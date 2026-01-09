/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { logger } from '@main/logger';

/**
 * File sandbox configuration
 * All file operations are restricted to the sandbox directory
 */
export class FileSandbox {
  private sandboxRoot: string;
  private allowedPaths: string[];

  constructor(customRoot?: string) {
    // Default sandbox root: ui-tars-workspace under user's Documents directory
    this.sandboxRoot =
      customRoot || path.join(app.getPath('documents'), 'ui-tars-workspace');

    // Ensure sandbox directory exists
    this.ensureSandboxExists();

    // Allowed paths list
    this.allowedPaths = [
      this.sandboxRoot,
      app.getPath('temp'), // Temp directory is also allowed
    ];

    logger.info(`[FileSandbox] Initialized with root: ${this.sandboxRoot}`);
  }

  /**
   * Ensure the sandbox directory exists
   */
  private ensureSandboxExists(): void {
    if (!fs.existsSync(this.sandboxRoot)) {
      fs.mkdirSync(this.sandboxRoot, { recursive: true });
      logger.info(
        `[FileSandbox] Created sandbox directory: ${this.sandboxRoot}`,
      );
    }
  }

  /**
   * Get the sandbox root directory
   */
  getSandboxRoot(): string {
    return this.sandboxRoot;
  }

  /**
   * Validate if a path is within the sandbox
   */
  isPathAllowed(targetPath: string): boolean {
    // Resolve to absolute path
    const absolutePath = path.resolve(this.sandboxRoot, targetPath);
    const normalizedPath = path.normalize(absolutePath);

    // Check if path is within allowed paths
    return this.allowedPaths.some((allowed) =>
      normalizedPath.startsWith(path.normalize(allowed)),
    );
  }

  /**
   * Resolve a relative path to an absolute path within sandbox
   * Returns null if path is outside sandbox
   */
  resolvePath(relativePath: string): string | null {
    const absolutePath = path.resolve(this.sandboxRoot, relativePath);
    const normalizedPath = path.normalize(absolutePath);

    if (!this.isPathAllowed(normalizedPath)) {
      logger.warn(
        `[FileSandbox] Path outside sandbox: ${relativePath} -> ${normalizedPath}`,
      );
      return null;
    }

    return normalizedPath;
  }

  /**
   * Detect path traversal attacks
   */
  detectPathTraversal(inputPath: string): boolean {
    // Common path traversal patterns
    const dangerousPatterns = [
      /\.\./, // ..
      /\.\.%2f/i, // URL encoded ../
      /\.\.%5c/i, // URL encoded ..\
      /%2e%2e/i, // URL encoded ..
      /\.\.\\/, // ..\
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(inputPath)) {
        logger.warn(
          `[FileSandbox] Path traversal detected: ${inputPath} (pattern: ${pattern})`,
        );
        return true;
      }
    }

    return false;
  }
}

// Blocked file extensions (executable and sensitive files)
export const BLOCKED_EXTENSIONS = [
  '.exe',
  '.dll',
  '.so',
  '.dylib', // Executables
  '.sh',
  '.bash',
  '.zsh',
  '.fish', // Shell scripts
  '.bat',
  '.cmd',
  '.ps1', // Windows scripts
  '.app',
  '.dmg',
  '.pkg', // macOS applications
  '.deb',
  '.rpm', // Linux packages
  '.plist',
  '.kext', // macOS system files
  '.msi',
  '.com', // Windows executables
  '.scr',
  '.vbs',
  '.js', // Scripts (in file context)
];

// Blocked filenames (sensitive configuration files)
export const BLOCKED_FILENAMES = [
  '.bashrc',
  '.zshrc',
  '.profile',
  '.bash_profile',
  '.gitconfig',
  '.npmrc',
  '.yarnrc',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'known_hosts',
  'authorized_keys',
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.ssh',
  '.gnupg',
  '.aws',
  'credentials',
  'config.json',
  'secrets.json',
];

// Maximum file size for write operations (1MB)
export const MAX_WRITE_SIZE = 1024 * 1024;
