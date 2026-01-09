/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '@main/logger';
import type { FileActionInputs } from '@ui-tars/shared/types';
import { FileExecutionResult } from '../types';
import { FileSandbox } from './sandbox';
import { FileValidator } from './validator';

// Maximum file size for read operations (10MB)
const MAX_READ_SIZE = 10 * 1024 * 1024;

/**
 * File operation executor
 * Executes validated file operations within the sandbox
 */
export class FileExecutor {
  private sandbox: FileSandbox;
  private validator: FileValidator;

  constructor(sandboxRoot?: string) {
    this.sandbox = new FileSandbox(sandboxRoot);
    this.validator = new FileValidator(this.sandbox);
  }

  /**
   * Execute a file operation
   */
  async execute(inputs: FileActionInputs): Promise<FileExecutionResult> {
    // 1. Validate inputs
    const validation = this.validator.validate(inputs);
    if (!validation.isValid) {
      logger.error(`[FileExecutor] Validation failed: ${validation.reason}`);
      return {
        success: false,
        error: validation.reason,
      };
    }

    const resolvedPath = validation.resolvedPath!;
    const { operation, content } = inputs;

    logger.info(`[FileExecutor] Executing ${operation} on: ${resolvedPath}`);

    try {
      switch (operation) {
        case 'read':
          return await this.read(resolvedPath);
        case 'write':
          return await this.write(resolvedPath, content!);
        case 'append':
          return await this.append(resolvedPath, content!);
        case 'list':
          return await this.list(resolvedPath);
        case 'delete':
          return await this.delete(resolvedPath);
        default:
          return { success: false, error: `Unknown operation: ${operation}` };
      }
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      logger.error(`[FileExecutor] Operation failed: ${error.message}`);

      // Provide user-friendly error messages
      let errorMessage = error.message;
      if (error.code === 'ENOENT') {
        errorMessage = 'File or directory not found';
      } else if (error.code === 'EACCES') {
        errorMessage = 'Permission denied';
      } else if (error.code === 'EISDIR') {
        errorMessage = 'Is a directory, not a file';
      } else if (error.code === 'ENOTDIR') {
        errorMessage = 'Not a directory';
      }

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Read file content
   */
  private async read(filePath: string): Promise<FileExecutionResult> {
    // Check file size before reading
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_READ_SIZE) {
      return {
        success: false,
        error: `File too large (${Math.round(stats.size / 1024 / 1024)}MB, max ${MAX_READ_SIZE / 1024 / 1024}MB)`,
      };
    }

    const content = await fs.readFile(filePath, { encoding: 'utf-8' });
    logger.info(
      `[FileExecutor] Read ${content.length} characters from ${filePath}`,
    );

    return {
      success: true,
      data: content,
      output: content,
    };
  }

  /**
   * Write content to file (overwrite)
   */
  private async write(
    filePath: string,
    content: string,
  ): Promise<FileExecutionResult> {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, content, { encoding: 'utf-8' });
    const stats = await fs.stat(filePath);

    logger.info(`[FileExecutor] Wrote ${stats.size} bytes to ${filePath}`);

    return {
      success: true,
      bytesWritten: stats.size,
      output: `Written ${stats.size} bytes to ${path.basename(filePath)}`,
    };
  }

  /**
   * Append content to file
   */
  private async append(
    filePath: string,
    content: string,
  ): Promise<FileExecutionResult> {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.appendFile(filePath, content, { encoding: 'utf-8' });
    const bytesWritten = Buffer.byteLength(content, 'utf-8');

    logger.info(`[FileExecutor] Appended ${bytesWritten} bytes to ${filePath}`);

    return {
      success: true,
      bytesWritten,
      output: `Appended ${bytesWritten} bytes to ${path.basename(filePath)}`,
    };
  }

  /**
   * List directory contents
   */
  private async list(dirPath: string): Promise<FileExecutionResult> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
    }));

    const formatted = files
      .map((f) => `${f.type === 'directory' ? 'd' : '-'} ${f.name}`)
      .sort();

    logger.info(`[FileExecutor] Listed ${files.length} items in ${dirPath}`);

    return {
      success: true,
      data: formatted,
      output: formatted.join('\n') || '(empty directory)',
    };
  }

  /**
   * Delete a file
   */
  private async delete(filePath: string): Promise<FileExecutionResult> {
    await fs.unlink(filePath);

    logger.info(`[FileExecutor] Deleted ${filePath}`);

    return {
      success: true,
      output: `Deleted ${path.basename(filePath)}`,
    };
  }

  /**
   * Get the sandbox root directory
   */
  getSandboxRoot(): string {
    return this.sandbox.getSandboxRoot();
  }
}
