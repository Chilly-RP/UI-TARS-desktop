/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  type ScreenshotOutput,
  type ExecuteParams,
  type ExecuteOutput,
  StatusEnum,
  Operator,
} from '@ui-tars/sdk/core';

import { logger } from '@main/logger';
import {
  BashExecutor,
  FileExecutor,
  SkillExecutor,
  CodeExecutor,
} from '@main/tools';

// Local type definitions for tool inputs
interface BashActionInputs {
  command: string;
  args?: string[];
  timeout?: number;
}

type FileOperation = 'read' | 'write' | 'append' | 'list' | 'delete';

interface FileActionInputs {
  operation: FileOperation;
  path: string;
  content?: string;
}

type SkillAction = 'load' | 'list' | 'info';

interface SkillActionInputs {
  name?: string;
  action: SkillAction;
  file?: string;
}

interface CodeActionInputs {
  language: 'javascript';
  content: string;
  timeout?: number;
}

/**
 * LocalAgentOperator is a conversational operator that doesn't perform
 * computer actions. It's designed for question answering and skill-based tasks.
 * It supports looping execution until the model returns 'finished'.
 */
export class LocalAgentOperator extends Operator {
  static SUPPORTS_SCREENSHOT = false;
  static MANUAL = {
    ACTION_SPACES: [
      `bash(command='<cmd>') # Execute whitelisted bash commands. Examples: bash(command='ls'), bash(command='ls -la'), bash(command='cat file.txt'), bash(command='grep pattern file'). Allowed: cat, ls, grep, head, tail, find, pwd, date, whoami. Forbidden: rm, mv, cp, chmod, sudo.`,
      `file(operation='<op>', path='<path>', content='<text>') # File operations in sandbox (~/Documents/ui-tars-workspace). Operations: read, write, append, list, delete. Examples: file(operation='list', path='.'), file(operation='read', path='notes.txt'), file(operation='write', path='output.txt', content='hello').`,
      `skill(action='list') # List all available skills for specialized tasks like document editing.`,
      `skill(name='<skill_name>', action='load') # Load a skill's documentation to learn how to perform specialized tasks.`,
      `skill(name='<skill_name>', action='load', file='<filename>') # Load a specific supporting file from a skill.`,
      `code(language='javascript', content='<code>') # Execute JavaScript code in sandbox (~/Documents/ui-tars-workspace). Timeout: 30s. Allowed: path, url, util, fs (sandbox-restricted), npm packages (if globally installed). Example: code(language='javascript', content='const docx = require("docx"); console.log("Hello")').`,
      `finished() # Task completed successfully.`,
    ],
  };

  // Tool executors for extended capabilities
  private bashExecutor: BashExecutor | null = null;
  private fileExecutor: FileExecutor | null = null;
  private skillExecutor: SkillExecutor | null = null;
  private codeExecutor: CodeExecutor | null = null;

  private getBashExecutor(): BashExecutor {
    if (!this.bashExecutor) {
      this.bashExecutor = new BashExecutor();
    }
    return this.bashExecutor;
  }

  private getFileExecutor(): FileExecutor {
    if (!this.fileExecutor) {
      this.fileExecutor = new FileExecutor();
    }
    return this.fileExecutor;
  }

  private getSkillExecutor(): SkillExecutor {
    if (!this.skillExecutor) {
      this.skillExecutor = new SkillExecutor();
    }
    return this.skillExecutor;
  }

  private getCodeExecutor(): CodeExecutor {
    if (!this.codeExecutor) {
      this.codeExecutor = new CodeExecutor();
    }
    return this.codeExecutor;
  }

  /**
   * LocalAgent doesn't take screenshots - it's conversational only
   */
  public async screenshot(): Promise<ScreenshotOutput> {
    logger.info('[LocalAgentOperator] Screenshot not supported for LocalAgent');
    return {
      base64: '',
      scaleFactor: 1,
    };
  }

  /**
   * Execute tool actions (bash, file, skill, code, finished)
   * LocalAgent doesn't support GUI actions like click, type, etc.
   */
  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { action_type, action_inputs } = params.parsedPrediction;

    logger.info(
      `[LocalAgentOperator] Executing action: ${action_type}`,
      action_inputs,
    );

    // Handle finished action - this signals the end of the task
    if (action_type === 'finished') {
      const content =
        (action_inputs?.content as string) || 'Task completed successfully.';
      logger.info('[LocalAgentOperator] Task finished:', content);
      return {
        status: StatusEnum.END,
        toolOutput: content,
      };
    }

    // Route to appropriate tool executor
    switch (action_type) {
      case 'bash':
        return await this.executeBash(action_inputs);
      case 'file':
        return await this.executeFile(action_inputs);
      case 'skill':
        return await this.executeSkill(action_inputs);
      case 'code':
        return await this.executeCode(action_inputs);
      default:
        logger.error(
          `[LocalAgentOperator] Unsupported action type: ${action_type}`,
        );
        return {
          status: StatusEnum.ERROR,
          toolOutput: `LocalAgent doesn't support action type: ${action_type}. Supported actions: bash, file, skill, code, finished.`,
        };
    }
  }

  /**
   * Execute bash command action
   */
  private async executeBash(
    actionInputs: Record<string, unknown>,
  ): Promise<ExecuteOutput> {
    // Support both nested format (actionInputs.bash) and flat format (actionInputs.command)
    let bashInputs: BashActionInputs | undefined;

    if (actionInputs.bash) {
      // Nested format: { bash: { command: 'ls', args: [...] } }
      bashInputs = actionInputs.bash as BashActionInputs;
    } else if (actionInputs.command) {
      // Flat format: { command: 'ls', args: [...] }
      bashInputs = {
        command: actionInputs.command as string,
        args: actionInputs.args as string[] | undefined,
        timeout: actionInputs.timeout as number | undefined,
      };
    }

    if (!bashInputs || !bashInputs.command) {
      logger.error('[LocalAgentOperator] Invalid bash action inputs');
      return {
        status: StatusEnum.ERROR,
        toolOutput: 'Invalid bash action inputs: command is required',
      };
    }

    logger.info(
      '[LocalAgentOperator] Executing bash command:',
      bashInputs.command,
    );

    const result = await this.getBashExecutor().execute(bashInputs);

    if (!result.success) {
      logger.error('[LocalAgentOperator] Bash execution failed:', result.error);
      return {
        status: StatusEnum.RUNNING, // Continue loop even on error, let model decide
        toolOutput: `Bash command failed: ${result.error || 'Unknown error'}\n${result.stderr || ''}`,
      };
    }

    logger.info(
      '[LocalAgentOperator] Bash execution succeeded, output:',
      result.output,
    );
    return {
      status: StatusEnum.RUNNING,
      toolOutput: result.output || result.stdout || '(no output)',
    };
  }

  /**
   * Execute file operation action
   */
  private async executeFile(
    actionInputs: Record<string, unknown>,
  ): Promise<ExecuteOutput> {
    // Support both nested format (actionInputs.file) and flat format
    let fileInputs: FileActionInputs | undefined;

    if (actionInputs.file) {
      // Nested format: { file: { operation: 'read', path: 'file.txt' } }
      fileInputs = actionInputs.file as FileActionInputs;
    } else if (actionInputs.operation && actionInputs.path) {
      // Flat format: { operation: 'read', path: 'file.txt', content: '...' }
      fileInputs = {
        operation: actionInputs.operation as FileActionInputs['operation'],
        path: actionInputs.path as string,
        content: actionInputs.content as string | undefined,
      };
    }

    if (!fileInputs || !fileInputs.operation || !fileInputs.path) {
      logger.error('[LocalAgentOperator] Invalid file action inputs');
      return {
        status: StatusEnum.ERROR,
        toolOutput:
          'Invalid file action inputs: operation and path are required',
      };
    }

    logger.info(
      '[LocalAgentOperator] Executing file operation:',
      fileInputs.operation,
      'on',
      fileInputs.path,
    );

    const result = await this.getFileExecutor().execute(fileInputs);

    if (!result.success) {
      logger.error(
        '[LocalAgentOperator] File operation failed:',
        result.error,
      );
      return {
        status: StatusEnum.RUNNING, // Continue loop even on error
        toolOutput: `File operation failed: ${result.error || 'Unknown error'}`,
      };
    }

    logger.info(
      '[LocalAgentOperator] File operation succeeded, output:',
      result.output,
    );
    return {
      status: StatusEnum.RUNNING,
      toolOutput: result.output || '(operation completed)',
    };
  }

  /**
   * Execute skill action
   */
  private async executeSkill(
    actionInputs: Record<string, unknown>,
  ): Promise<ExecuteOutput> {
    // Support both nested format (actionInputs.skill) and flat format
    let skillInputs: SkillActionInputs | undefined;

    if (actionInputs.skill) {
      // Nested format: { skill: { action: 'load', name: 'docx' } }
      skillInputs = actionInputs.skill as SkillActionInputs;
    } else if (actionInputs.action) {
      // Flat format: { action: 'load', name: 'docx', file: '...' }
      skillInputs = {
        name: actionInputs.name as string | undefined,
        action: actionInputs.action as SkillAction,
        file: actionInputs.file as string | undefined,
      };
    }

    if (!skillInputs || !skillInputs.action) {
      logger.error('[LocalAgentOperator] Invalid skill action inputs');
      return {
        status: StatusEnum.ERROR,
        toolOutput: 'Invalid skill action inputs: action is required',
      };
    }

    logger.info(
      '[LocalAgentOperator] Executing skill action:',
      skillInputs.action,
      'skill:',
      skillInputs.name || 'N/A',
    );

    const result = await this.getSkillExecutor().execute(skillInputs);

    if (!result.success) {
      logger.error(
        '[LocalAgentOperator] Skill execution failed:',
        result.error,
      );
      return {
        status: StatusEnum.RUNNING, // Continue loop even on error
        toolOutput: `Skill action failed: ${result.error || 'Unknown error'}`,
      };
    }

    logger.info('[LocalAgentOperator] Skill execution succeeded');
    return {
      status: StatusEnum.RUNNING,
      toolOutput: result.output || '(no output)',
    };
  }

  /**
   * Execute code action
   */
  private async executeCode(
    actionInputs: Record<string, unknown>,
  ): Promise<ExecuteOutput> {
    // Support both nested format (actionInputs.code) and flat format
    let codeInputs: CodeActionInputs | undefined;

    if (actionInputs.code) {
      // Nested format: { code: { language: 'javascript', content: '...' } }
      codeInputs = actionInputs.code as CodeActionInputs;
    } else if (actionInputs.language && actionInputs.content) {
      // Flat format: { language: 'javascript', content: '...' }
      codeInputs = {
        language: actionInputs.language as 'javascript',
        content: actionInputs.content as string,
        timeout: actionInputs.timeout as number | undefined,
      };
    }

    if (!codeInputs || !codeInputs.language || !codeInputs.content) {
      logger.error('[LocalAgentOperator] Invalid code action inputs');
      return {
        status: StatusEnum.ERROR,
        toolOutput:
          'Invalid code action inputs: language and content are required',
      };
    }

    logger.info(
      '[LocalAgentOperator] Executing code:',
      codeInputs.language,
      'content length:',
      codeInputs.content.length,
    );

    const result = await this.getCodeExecutor().execute(codeInputs);

    if (!result.success) {
      logger.error(
        '[LocalAgentOperator] Code execution failed:',
        result.error,
      );
      return {
        status: StatusEnum.RUNNING, // Continue loop even on error
        toolOutput: `Code execution failed: ${result.error || 'Unknown error'}\n${result.stderr || ''}`,
      };
    }

    logger.info(
      '[LocalAgentOperator] Code execution succeeded, output:',
      result.output,
    );
    return {
      status: StatusEnum.RUNNING,
      toolOutput: result.output || '(no output)',
    };
  }
}
