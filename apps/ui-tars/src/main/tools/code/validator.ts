/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@main/logger';
import { CodeActionInputs, CodeValidationResult } from './types';
import {
  BLOCKED_MODULES,
  BLOCKED_APIS,
  DANGEROUS_PATTERNS,
  MAX_CODE_LENGTH,
} from './sandbox';

/**
 * Code validator
 * Validates code against security rules before execution
 */
export class CodeValidator {
  /**
   * Validate code inputs
   */
  validate(inputs: CodeActionInputs): CodeValidationResult {
    const { language, content } = inputs;

    // 1. Check required parameters
    if (!language || !content) {
      return {
        isValid: false,
        reason: 'Missing required parameters: language and content',
      };
    }

    // 2. Check language support
    if (language !== 'javascript') {
      return {
        isValid: false,
        reason: `Unsupported language: ${language}. Only 'javascript' is supported.`,
      };
    }

    // 3. Check code length
    if (content.length > MAX_CODE_LENGTH) {
      return {
        isValid: false,
        reason: `Code too long (${content.length} chars, max ${MAX_CODE_LENGTH} chars)`,
      };
    }

    // 4. Check for blocked modules
    for (const module of BLOCKED_MODULES) {
      const patterns = [
        new RegExp(`require\\s*\\(\\s*['"\`]${module}['"\`]\\s*\\)`, 'g'),
        new RegExp(`from\\s+['"\`]${module}['"\`]`, 'g'),
        new RegExp(`import\\s+['"\`]${module}['"\`]`, 'g'),
      ];
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          logger.warn(`[CodeValidator] Blocked module detected: ${module}`);
          return {
            isValid: false,
            reason: `Module '${module}' is not allowed for security reasons`,
          };
        }
      }
    }

    // 5. Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        logger.warn(`[CodeValidator] Dangerous pattern detected: ${pattern}`);
        return {
          isValid: false,
          reason: 'Code contains potentially dangerous patterns',
        };
      }
    }

    // 6. Check for blocked APIs
    for (const api of BLOCKED_APIS) {
      // Check for direct usage of eval() or Function()
      const pattern = new RegExp(`\\b${api}\\s*\\(`, 'g');
      if (pattern.test(content)) {
        logger.warn(`[CodeValidator] Blocked API detected: ${api}`);
        return {
          isValid: false,
          reason: `API '${api}' is not allowed for security reasons`,
        };
      }
    }

    return { isValid: true, sanitizedCode: content };
  }
}
