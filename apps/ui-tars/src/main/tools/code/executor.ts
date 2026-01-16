/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { logger } from '@main/logger';
import { CodeActionInputs, CodeExecutionResult } from './types';
import { CodeSandbox, MAX_OUTPUT_SIZE, DEFAULT_TIMEOUT } from './sandbox';
import { CodeValidator } from './validator';

/**
 * Code executor
 * Executes validated JavaScript code in a sandboxed Node.js process
 */
export class CodeExecutor {
  private sandbox: CodeSandbox;
  private validator: CodeValidator;

  constructor(sandboxRoot?: string) {
    this.sandbox = new CodeSandbox(sandboxRoot);
    this.validator = new CodeValidator();
  }

  /**
   * Execute JavaScript code
   */
  async execute(inputs: CodeActionInputs): Promise<CodeExecutionResult> {
    const { content, timeout = DEFAULT_TIMEOUT } = inputs;

    // 1. Validate code
    const validation = this.validator.validate(inputs);
    if (!validation.isValid) {
      logger.error(`[CodeExecutor] Validation failed: ${validation.reason}`);
      return {
        success: false,
        error: validation.reason,
        exitCode: -1,
      };
    }

    // 2. Create temporary file for code
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `ui-tars-code-${Date.now()}.js`);
    const sandboxRoot = this.sandbox.getSandboxRoot();

    try {
      // 3. Wrap code with sandbox setup
      const wrappedCode = this.wrapCode(content, sandboxRoot);
      await fs.writeFile(tempFile, wrappedCode, 'utf-8');

      // 4. Execute in subprocess
      const result = await this.runInSubprocess(tempFile, sandboxRoot, timeout);

      return result;
    } catch (err) {
      const error = err as Error;
      logger.error(`[CodeExecutor] Execution error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        exitCode: -1,
      };
    } finally {
      // 5. Cleanup temporary file
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Wrap user code with sandbox restrictions
   */
  private wrapCode(userCode: string, sandboxRoot: string): string {
    return `
'use strict';

// Sandbox configuration
const SANDBOX_ROOT = ${JSON.stringify(sandboxRoot)};

// Restricted fs module
const originalFs = require('fs');
const originalFsPromises = require('fs/promises');
const pathModule = require('path');

function restrictPath(filePath) {
  // Handle relative paths
  const resolved = pathModule.resolve(SANDBOX_ROOT, filePath);
  if (!resolved.startsWith(SANDBOX_ROOT)) {
    throw new Error('Access denied: Path outside sandbox');
  }
  return resolved;
}

const safeFs = {
  readFileSync: (filePath, options) => originalFs.readFileSync(restrictPath(filePath), options),
  writeFileSync: (filePath, data, options) => originalFs.writeFileSync(restrictPath(filePath), data, options),
  existsSync: (filePath) => originalFs.existsSync(restrictPath(filePath)),
  readdirSync: (dirPath, options) => originalFs.readdirSync(restrictPath(dirPath), options),
  statSync: (filePath) => originalFs.statSync(restrictPath(filePath)),
  mkdirSync: (dirPath, options) => originalFs.mkdirSync(restrictPath(dirPath), options),
  appendFileSync: (filePath, data, options) => originalFs.appendFileSync(restrictPath(filePath), data, options),
  // Promise versions
  promises: {
    readFile: (filePath, options) => originalFsPromises.readFile(restrictPath(filePath), options),
    writeFile: (filePath, data, options) => originalFsPromises.writeFile(restrictPath(filePath), data, options),
    readdir: (dirPath, options) => originalFsPromises.readdir(restrictPath(dirPath), options),
    stat: (filePath) => originalFsPromises.stat(restrictPath(filePath)),
    mkdir: (dirPath, options) => originalFsPromises.mkdir(restrictPath(dirPath), options),
    appendFile: (filePath, data, options) => originalFsPromises.appendFile(restrictPath(filePath), data, options),
  }
};

// Allowed modules
const ALLOWED_MODULES = {
  path: require('path'),
  url: require('url'),
  util: require('util'),
  querystring: require('querystring'),
  buffer: require('buffer'),
  stream: require('stream'),
  fs: safeFs,
  'fs/promises': safeFs.promises,
};

// Safe require function
const safeRequire = (moduleName) => {
  if (Object.prototype.hasOwnProperty.call(ALLOWED_MODULES, moduleName)) {
    return ALLOWED_MODULES[moduleName];
  }

  // Allow npm packages (e.g., 'docx', 'lodash', etc.)
  // This enables skills to use external libraries
  try {
    return require(moduleName);
  } catch (err) {
    throw new Error(\`Module '\${moduleName}' is not available. Make sure it is installed globally.\`);
  }
};

// Replace globals
const __dirname = SANDBOX_ROOT;
const __filename = pathModule.join(SANDBOX_ROOT, 'script.js');

// Execute user code
(async () => {
  try {
    const require = safeRequire;
    const path = ALLOWED_MODULES.path;
    const fs = safeFs;

${userCode}
  } catch (err) {
    console.error('Execution error:', err.message);
    process.exit(1);
  }
})();
`;
  }

  /**
   * Run code in a sandboxed subprocess
   */
  private runInSubprocess(
    scriptPath: string,
    sandboxRoot: string,
    timeout: number,
  ): Promise<CodeExecutionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let killed = false;

      const proc = spawn('node', [scriptPath], {
        cwd: sandboxRoot,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'production',
          // Allow npm global modules
          NODE_PATH: process.env.NODE_PATH || '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timeoutId = setTimeout(() => {
        killed = true;
        proc.kill('SIGTERM');
        logger.warn(`[CodeExecutor] Execution timeout after ${timeout}ms`);
      }, Math.min(timeout, DEFAULT_TIMEOUT));

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > MAX_OUTPUT_SIZE) {
          killed = true;
          proc.kill('SIGTERM');
          logger.warn(`[CodeExecutor] Output too large, killing process`);
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > MAX_OUTPUT_SIZE) {
          killed = true;
          proc.kill('SIGTERM');
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - startTime;

        logger.info(
          `[CodeExecutor] Completed in ${executionTime}ms with code ${code}`,
        );

        const exitCode = code ?? (killed ? -2 : -1);

        resolve({
          success: exitCode === 0 && !killed,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          output: stdout.trim() || stderr.trim(),
          exitCode,
          executionTime,
          error: killed
            ? 'Execution timeout or output too large'
            : exitCode !== 0
              ? stderr.trim() || `Code exited with status ${exitCode}`
              : undefined,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        logger.error(`[CodeExecutor] Process error: ${err.message}`);
        resolve({
          success: false,
          error: err.message,
          exitCode: -1,
        });
      });
    });
  }

  /**
   * Get the sandbox root directory
   */
  getSandboxRoot(): string {
    return this.sandbox.getSandboxRoot();
  }
}
