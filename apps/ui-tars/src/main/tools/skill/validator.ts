/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@main/logger';
import { ValidationResult } from '../types';
import { SkillActionInputs, SkillAction } from './types';

// Maximum skill name length
const MAX_SKILL_NAME_LENGTH = 64;

// Allowed characters in skill name (alphanumeric, hyphens, underscores)
const VALID_SKILL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

// Valid actions
const VALID_ACTIONS: SkillAction[] = ['load', 'list', 'info'];

/**
 * SkillValidator validates skill action inputs
 */
export class SkillValidator {
  /**
   * Validate skill action inputs
   */
  validate(inputs: SkillActionInputs): ValidationResult {
    const { name, action, file } = inputs;

    // 1. Validate action type
    if (!action) {
      return { isValid: false, reason: 'Missing required parameter: action' };
    }

    if (!VALID_ACTIONS.includes(action)) {
      return {
        isValid: false,
        reason: `Invalid action: ${action}. Valid actions: ${VALID_ACTIONS.join(', ')}`,
      };
    }

    // 2. For 'load' and 'info' actions, name is required
    if ((action === 'load' || action === 'info') && !name) {
      return {
        isValid: false,
        reason: `Action '${action}' requires skill name`,
      };
    }

    // 3. Validate skill name if provided
    if (name) {
      if (name.length > MAX_SKILL_NAME_LENGTH) {
        return {
          isValid: false,
          reason: `Skill name too long (max ${MAX_SKILL_NAME_LENGTH} characters)`,
        };
      }

      if (!VALID_SKILL_NAME_REGEX.test(name)) {
        return {
          isValid: false,
          reason: 'Skill name contains invalid characters',
        };
      }

      // Check for path traversal
      if (name.includes('..') || name.includes('/') || name.includes('\\')) {
        logger.warn(
          `[SkillValidator] Path traversal attempt in skill name: ${name}`,
        );
        return { isValid: false, reason: 'Invalid skill name' };
      }
    }

    // 4. Validate file parameter if provided
    if (file) {
      if (
        file.includes('..') ||
        file.startsWith('/') ||
        file.startsWith('\\')
      ) {
        logger.warn(
          `[SkillValidator] Path traversal attempt in file: ${file}`,
        );
        return { isValid: false, reason: 'Invalid file path' };
      }
    }

    return { isValid: true };
  }
}
