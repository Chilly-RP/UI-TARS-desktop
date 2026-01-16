/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { logger } from '@main/logger';

/**
 * Code sandbox configuration
 * All code execution is restricted to the sandbox directory
 */
export class CodeSandbox {
  private sandboxRoot: string;

  constructor(customRoot?: string) {
    this.sandboxRoot =
      customRoot || path.join(app.getPath('documents'), 'ui-tars-workspace');
    this.ensureSandboxExists();
    logger.info(`[CodeSandbox] Initialized with root: ${this.sandboxRoot}`);
  }

  private ensureSandboxExists(): void {
    if (!fs.existsSync(this.sandboxRoot)) {
      fs.mkdirSync(this.sandboxRoot, { recursive: true });
      logger.info(
        `[CodeSandbox] Created sandbox directory: ${this.sandboxRoot}`,
      );
    }
  }

  getSandboxRoot(): string {
    return this.sandboxRoot;
  }
}

/**
 * Blocked Node.js built-in modules
 */
export const BLOCKED_MODULES = [
  'child_process', // Prevent executing system commands
  'cluster', // Prevent creating child processes
  'dgram', // UDP
  'dns', // DNS queries
  'http', // HTTP server
  'https', // HTTPS server
  'http2', // HTTP/2
  'net', // Network sockets
  'tls', // TLS/SSL
  'vm', // Virtual machine (potential escape)
  'worker_threads', // Worker threads
  'repl', // REPL
  'inspector', // Debugger
  'trace_events', // Trace events
];

/**
 * Blocked global APIs
 */
export const BLOCKED_APIS = [
  'eval', // Prevent dynamic execution
  'Function', // Prevent dynamic function creation
];

/**
 * Dangerous patterns to detect in code
 */
export const DANGEROUS_PATTERNS: RegExp[] = [
  /require\s*\(\s*['"`]child_process['"`]\s*\)/,
  /require\s*\(\s*['"`]fs['"`]\s*\)\.unlink/,
  /require\s*\(\s*['"`]fs['"`]\s*\)\.rmdir/,
  /require\s*\(\s*['"`]fs['"`]\s*\)\.rm\s*\(/,
  /process\.exit/,
  /process\.kill/,
  /process\.env/, // Prevent accessing environment variables
  /global\./, // Prevent accessing global object
  /globalThis\./, // Prevent accessing global object
];

/**
 * Maximum code length (64KB)
 */
export const MAX_CODE_LENGTH = 64 * 1024;

/**
 * Maximum output size (1MB)
 */
export const MAX_OUTPUT_SIZE = 1024 * 1024;

/**
 * Default execution timeout (30 seconds)
 */
export const DEFAULT_TIMEOUT = 30000;
