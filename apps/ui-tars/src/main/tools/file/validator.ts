/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import { logger } from '@main/logger';
import { ValidationResult } from '../types';
import {
  FileSandbox,
  BLOCKED_EXTENSIONS,
  BLOCKED_FILENAMES,
  MAX_WRITE_SIZE,
} from './sandbox';
import type { FileActionInputs, FileOperation } from '@ui-tars/shared/types';

/**
 * Extended validation result with resolved path
 */
export interface FileValidationResult extends ValidationResult {
  resolvedPath?: string;
}

/**
 * File path validator
 * Validates file operations against sandbox and security rules
 */
export class FileValidator {
  private sandbox: FileSandbox;

  constructor(sandbox: FileSandbox) {
    this.sandbox = sandbox;
  }

  /**
   * Validate file operation inputs
   */
  validate(inputs: FileActionInputs): FileValidationResult {
    const { operation, path: inputPath, content } = inputs;

    // 1. Basic parameter check
    if (!operation || !inputPath) {
      return { isValid: false, reason: 'Missing required parameters' };
    }

    // 2. Validate operation type
    const validOperations: FileOperation[] = [
      'read',
      'write',
      'append',
      'list',
      'delete',
    ];
    if (!validOperations.includes(operation)) {
      return { isValid: false, reason: `Invalid operation: ${operation}` };
    }

    // 3. Check for path traversal attacks
    if (this.sandbox.detectPathTraversal(inputPath)) {
      logger.warn(`[FileValidator] Path traversal detected: ${inputPath}`);
      return { isValid: false, reason: 'Path traversal attack detected' };
    }

    // 4. Resolve and validate path
    const resolvedPath = this.sandbox.resolvePath(inputPath);
    if (!resolvedPath) {
      return { isValid: false, reason: 'Path is outside sandbox' };
    }

    // 5. Check file extension
    const ext = path.extname(inputPath).toLowerCase();
    if (ext && BLOCKED_EXTENSIONS.includes(ext)) {
      logger.warn(`[FileValidator] Blocked extension: ${ext}`);
      return {
        isValid: false,
        reason: `File extension '${ext}' is not allowed`,
      };
    }

    // 6. Check filename
    const filename = path.basename(inputPath).toLowerCase();
    if (BLOCKED_FILENAMES.includes(filename)) {
      logger.warn(`[FileValidator] Blocked filename: ${filename}`);
      return {
        isValid: false,
        reason: `File '${filename}' is not allowed`,
      };
    }

    // 7. Operation-specific validation
    const operationValidation = this.validateOperation(
      operation,
      resolvedPath,
      content,
    );
    if (!operationValidation.isValid) {
      return operationValidation;
    }

    return { isValid: true, resolvedPath };
  }

  /**
   * Operation-specific validation rules
   */
  private validateOperation(
    operation: FileOperation,
    resolvedPath: string,
    content?: string,
  ): FileValidationResult {
    switch (operation) {
      case 'write':
      case 'append':
        // Content is required for write operations
        if (content === undefined || content === null) {
          return {
            isValid: false,
            reason: `${operation}: content is required`,
          };
        }
        // Check content size
        if (Buffer.byteLength(content, 'utf-8') > MAX_WRITE_SIZE) {
          return {
            isValid: false,
            reason: `${operation}: content too large (max ${MAX_WRITE_SIZE / 1024 / 1024}MB)`,
          };
        }
        break;

      case 'delete':
        // Log delete operations for audit
        logger.info(
          `[FileValidator] Delete operation requested: ${resolvedPath}`,
        );
        break;

      case 'read':
      case 'list':
        // No additional validation needed
        break;
    }

    return { isValid: true };
  }
}
