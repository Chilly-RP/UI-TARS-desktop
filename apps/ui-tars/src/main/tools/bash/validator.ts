/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@main/logger';
import { ValidationResult } from '../types';
import {
  BASH_BLACKLIST,
  DANGEROUS_PATTERNS,
  getAllowedCommands,
} from './whitelist';

/**
 * Bash command validator
 * Validates commands against whitelist and security rules
 */
export class BashValidator {
  private allowedCommands: Set<string>;
  private blacklistedKeywords: Set<string>;

  constructor() {
    this.allowedCommands = getAllowedCommands();
    this.blacklistedKeywords = new Set(BASH_BLACKLIST);
  }

  /**
   * Validate a bash command
   */
  validate(command: string): ValidationResult {
    // 1. Empty command check
    if (!command || command.trim() === '') {
      return { isValid: false, reason: 'Empty command' };
    }

    const trimmedCommand = command.trim();

    // 2. Check for dangerous patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(trimmedCommand)) {
        logger.warn(`[BashValidator] Dangerous pattern detected: ${pattern}`);
        return {
          isValid: false,
          reason: `Dangerous pattern detected`,
        };
      }
    }

    // 3. Check for blacklisted keywords
    for (const blacklisted of this.blacklistedKeywords) {
      // Check if the blacklisted keyword appears in the command
      if (this.containsKeyword(trimmedCommand, blacklisted)) {
        logger.warn(`[BashValidator] Blacklisted keyword: ${blacklisted}`);
        return {
          isValid: false,
          reason: `Command contains forbidden keyword: '${blacklisted}'`,
        };
      }
    }

    // 4. Extract main command
    const mainCommand = this.extractMainCommand(trimmedCommand);
    if (!mainCommand) {
      return { isValid: false, reason: 'Could not extract main command' };
    }

    // 5. Check if main command is in whitelist
    if (!this.allowedCommands.has(mainCommand)) {
      logger.warn(`[BashValidator] Command not in whitelist: ${mainCommand}`);
      return {
        isValid: false,
        reason: `Command '${mainCommand}' is not in whitelist`,
      };
    }

    // 6. Command-specific validation
    const specificValidation = this.validateSpecificCommand(
      mainCommand,
      trimmedCommand,
    );
    if (!specificValidation.isValid) {
      return specificValidation;
    }

    return {
      isValid: true,
      sanitizedValue: trimmedCommand,
    };
  }

  /**
   * Check if command contains a specific keyword
   */
  private containsKeyword(command: string, keyword: string): boolean {
    // For operators like >, >>, |, etc., check directly
    if (['>', '>>', '|', '`', '$(', '&&', '||', ';'].includes(keyword)) {
      return command.includes(keyword);
    }
    // For commands, check word boundaries
    const regex = new RegExp(
      `(^|\\s|/)${this.escapeRegex(keyword)}($|\\s)`,
      'i',
    );
    return regex.test(command);
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Extract the main command from a full command string
   */
  private extractMainCommand(command: string): string | null {
    const parts = command.split(/\s+/);
    const firstPart = parts[0];

    if (!firstPart) return null;

    // Handle path-prefixed commands like /usr/bin/ls
    if (firstPart.includes('/')) {
      const segments = firstPart.split('/');
      return segments[segments.length - 1] || null;
    }

    return firstPart;
  }

  /**
   * Command-specific validation rules
   */
  private validateSpecificCommand(
    mainCommand: string,
    fullCommand: string,
  ): ValidationResult {
    switch (mainCommand) {
      case 'curl':
        // Only allow GET requests
        if (
          fullCommand.includes('-X POST') ||
          fullCommand.includes('-X PUT') ||
          fullCommand.includes('-X DELETE') ||
          fullCommand.includes('-X PATCH') ||
          fullCommand.includes('-d ') ||
          fullCommand.includes('--data') ||
          fullCommand.includes('-F ') ||
          fullCommand.includes('--form')
        ) {
          return {
            isValid: false,
            reason: 'curl: only GET requests are allowed',
          };
        }
        break;

      case 'ping':
        // Must specify count limit
        if (!fullCommand.includes('-c ') && !fullCommand.includes('-c=')) {
          return {
            isValid: false,
            reason: 'ping: must specify count with -c option',
          };
        }
        // Check count limit
        const countMatch = fullCommand.match(/-c[=\s]+(\d+)/);
        if (countMatch && parseInt(countMatch[1], 10) > 5) {
          return {
            isValid: false,
            reason: 'ping: count must be <= 5',
          };
        }
        break;

      case 'find':
        // Must specify maxdepth to prevent deep recursion
        if (
          !fullCommand.includes('-maxdepth') &&
          !fullCommand.includes('-maxdepth=')
        ) {
          return {
            isValid: false,
            reason: 'find: must specify -maxdepth option',
          };
        }
        // Check maxdepth limit
        const depthMatch = fullCommand.match(/-maxdepth[=\s]+(\d+)/);
        if (depthMatch && parseInt(depthMatch[1], 10) > 5) {
          return {
            isValid: false,
            reason: 'find: maxdepth must be <= 5',
          };
        }
        break;

      case 'head':
      case 'tail':
        // Check for reasonable line limit
        const lineMatch = fullCommand.match(/-n[=\s]+(\d+)/);
        if (lineMatch && parseInt(lineMatch[1], 10) > 1000) {
          return {
            isValid: false,
            reason: `${mainCommand}: line count must be <= 1000`,
          };
        }
        break;
    }

    return { isValid: true };
  }
}
