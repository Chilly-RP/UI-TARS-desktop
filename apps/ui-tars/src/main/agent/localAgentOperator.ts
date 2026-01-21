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

/**
 * LocalAgentOperator is a conversational operator that doesn't perform
 * computer actions. It's designed for question answering and skill-based tasks.
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
   * Execute tool actions (bash, file, skill, code)
   * LocalAgent doesn't support GUI actions like click, type, etc.
   */
  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { action_type, action_inputs } = params.parsedPrediction;

    logger.info(
      `[LocalAgentOperator] Executing action: ${action_type}`,
      action_inputs,
    );

    // LocalAgent only supports tool actions, not GUI actions
    // The actual tool execution would be handled by the model/agent layer
    // This operator just validates that only supported actions are executed

    const supportedActions = ['bash', 'file', 'skill', 'code', 'finished'];

    if (!supportedActions.includes(action_type)) {
      logger.error(
        `[LocalAgentOperator] Unsupported action type: ${action_type}`,
      );
      return {
        status: StatusEnum.ERROR,
        toolOutput: `LocalAgent doesn't support action type: ${action_type}. Only conversational and tool-based actions are supported.`,
      };
    }

    // For now, return success and let the model handle the actual execution
    // The DoubaoSeedModel doesn't parse actions anyway - it's purely conversational
    return {
      status: StatusEnum.RUNNING,
      toolOutput: 'Action acknowledged',
    };
  }
}
