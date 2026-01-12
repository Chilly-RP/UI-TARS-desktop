/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn } from 'child_process';
import { logger } from '@main/logger';
import type { BashActionInputs } from '@ui-tars/shared/types';
import { BashExecutionResult } from '../types';
import { BashValidator } from './validator';

// Maximum output size (1MB)
const MAX_OUTPUT_SIZE = 1024 * 1024;

// Default timeout (30 seconds)
const DEFAULT_TIMEOUT = 30000;

/**
 * Bash command executor
 * Executes validated bash commands with security constraints
 */
export class BashExecutor {
  private validator: BashValidator;

  constructor() {
    this.validator = new BashValidator();
  }

  /**
   * Parse args from various formats that LLM might return
   */
  private parseArgs(args: unknown): string[] {
    if (!args) {
      return [];
    }

    // Already an array
    if (Array.isArray(args)) {
      return args.map((arg) => String(arg));
    }

    // String that looks like an array: "[]", "[arg1, arg2]", "[-la, /path]"
    if (typeof args === 'string') {
      const trimmed = args.trim();

      // Empty array string
      if (trimmed === '[]' || trimmed === '') {
        return [];
      }

      // Parse array-like string: "[arg1, arg2]" or "[-la, /path]"
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const inner = trimmed.slice(1, -1).trim();
        if (inner === '') {
          return [];
        }
        // Split by comma, trim each part, remove quotes
        return inner.split(',').map((s) =>
          s
            .trim()
            .replace(/^['"]|['"]$/g, '')
            .trim(),
        );
      }

      // Try JSON parse
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((arg) => String(arg));
        }
      } catch {
        // Not valid JSON, treat as single argument or space-separated
      }

      // Single argument or space-separated (but be careful with paths containing spaces)
      return [trimmed];
    }

    return [];
  }

  /**
   * Execute a bash command
   */
  async execute(inputs: BashActionInputs): Promise<BashExecutionResult> {
    const { command, timeout = DEFAULT_TIMEOUT } = inputs;

    // Parse args - handle string, array, or undefined
    const args = this.parseArgs(inputs.args);

    // 1. Build full command string for validation
    const fullCommand =
      args.length > 0 ? `${command} ${args.join(' ')}` : command;

    // 2. Validate command
    const validation = this.validator.validate(fullCommand);
    if (!validation.isValid) {
      logger.error(`[BashExecutor] Validation failed: ${validation.reason}`);
      return {
        success: false,
        error: validation.reason,
        exitCode: -1,
      };
    }

    logger.info(`[BashExecutor] Executing command: ${fullCommand}`);

    // 3. Execute command
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';
      let killed = false;

      const proc = spawn(command, args, {
        shell: true,
        timeout: Math.min(timeout, DEFAULT_TIMEOUT), // Cap at default timeout
        env: {
          // Only pass safe environment variables
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          USER: process.env.USER,
          LANG: process.env.LANG,
          LC_ALL: process.env.LC_ALL,
        },
      });

      // Set timeout
      const timeoutId = setTimeout(
        () => {
          killed = true;
          proc.kill('SIGTERM');
          logger.warn(`[BashExecutor] Command timeout: ${fullCommand}`);
        },
        Math.min(timeout, DEFAULT_TIMEOUT),
      );

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
        // Limit output size
        if (stdout.length > MAX_OUTPUT_SIZE) {
          killed = true;
          proc.kill('SIGTERM');
          logger.warn(`[BashExecutor] Output too large, killing process`);
        }
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
        // Also limit stderr
        if (stderr.length > MAX_OUTPUT_SIZE) {
          killed = true;
          proc.kill('SIGTERM');
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        logger.info(
          `[BashExecutor] Command completed in ${duration}ms with code ${code}`,
        );

        const exitCode = code ?? (killed ? -2 : -1);

        resolve({
          success: exitCode === 0 && !killed,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          output: stdout.trim() || stderr.trim(),
          exitCode,
          error: killed
            ? 'Command timeout or output too large'
            : exitCode !== 0
              ? `Command exited with code ${exitCode}`
              : undefined,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        logger.error(`[BashExecutor] Command error: ${err.message}`);
        resolve({
          success: false,
          error: err.message,
          exitCode: -1,
        });
      });
    });
  }
}
