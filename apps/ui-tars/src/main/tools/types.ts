/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Base tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Bash command execution result
 */
export interface BashExecutionResult extends ToolExecutionResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

/**
 * File operation execution result
 */
export interface FileExecutionResult extends ToolExecutionResult {
  data?: string | string[];
  bytesWritten?: number;
}

/**
 * Validation result for commands and paths
 */
export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  sanitizedValue?: string;
}
