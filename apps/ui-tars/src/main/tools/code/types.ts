/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolExecutionResult } from '../types';

/**
 * Code action inputs
 */
export interface CodeActionInputs {
  language: 'javascript'; // Currently only JavaScript is supported
  content: string; // Code content to execute
  timeout?: number; // Execution timeout in milliseconds, default 30000
}

/**
 * Code execution result
 */
export interface CodeExecutionResult extends ToolExecutionResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
  executionTime?: number; // Execution time in milliseconds
}

/**
 * Validation result for code
 */
export interface CodeValidationResult {
  isValid: boolean;
  reason?: string;
  sanitizedCode?: string;
}
