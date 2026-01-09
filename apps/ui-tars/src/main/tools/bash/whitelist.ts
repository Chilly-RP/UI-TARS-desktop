/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bash command whitelist configuration
 * Only commands in this whitelist are allowed to execute
 */
export const BASH_WHITELIST = {
  // File viewing commands (read-only)
  readonly: [
    'cat', // View file content
    'head', // View file beginning
    'tail', // View file end
    'less', // Paginated viewing
    'more', // Paginated viewing
    'ls', // List directory
    'pwd', // Current directory
    'find', // Find files (restricted)
    'grep', // Search content
    'wc', // Word count
    'du', // Disk usage
    'df', // Disk space
    'file', // File type
    'stat', // File status
  ],
  // Text processing commands
  textProcessing: [
    'echo', // Output
    'printf', // Formatted output
    'sort', // Sort
    'uniq', // Deduplicate
    'cut', // Cut columns
    'diff', // Compare files
    'tr', // Character translation
  ],
  // System info commands
  systemInfo: [
    'date', // Date and time
    'whoami', // Current user
    'hostname', // Hostname
    'uname', // System info
    'which', // Command location
    'type', // Command type
  ],
  // Network diagnostic commands (read-only)
  network: [
    'ping', // Network connectivity (limited count)
    'curl', // HTTP request (GET only)
  ],
};

/**
 * Bash command blacklist - absolutely forbidden commands
 */
export const BASH_BLACKLIST = [
  // File modification
  'rm',
  'rmdir',
  'mv',
  'cp',
  'mkdir',
  'touch',
  // Permission changes
  'chmod',
  'chown',
  'chgrp',
  // Privilege escalation
  'sudo',
  'su',
  'doas',
  // Process management
  'kill',
  'killall',
  'pkill',
  // System control
  'reboot',
  'shutdown',
  'halt',
  'poweroff',
  'init',
  'systemctl',
  'service',
  // Scheduled tasks
  'crontab',
  'at',
  // Disk operations
  'dd',
  'mkfs',
  'fdisk',
  'mount',
  'umount',
  // Dangerous operators
  '>',
  '>>',
  // Command chaining (checked separately)
  '&&',
  '||',
  ';',
  // Command substitution
  '`',
  '$(',
  // Script execution
  'eval',
  'exec',
  'source',
  'alias',
  'export',
  'unset',
];

/**
 * Dangerous patterns to detect in commands
 */
export const DANGEROUS_PATTERNS: RegExp[] = [
  /\s+-rf\s*/, // rm -rf pattern
  /\s+--force\s*/, // Force execution
  /\s+-f\s+\//, // Force on root paths
  /\/etc\//, // System config directory
  /\/usr\//, // System program directory
  /\/bin\//, // System binary directory
  /\/sbin\//, // System admin binary directory
  /\/boot\//, // Boot directory
  /\/dev\//, // Device directory
  /\/proc\//, // Process info
  /\/sys\//, // System info
  /\/var\/log\//, // System logs
  /~\/\.\w+/, // Hidden config files
  /\|/, // Pipe operator
];

/**
 * Get all allowed commands as a flat set
 */
export function getAllowedCommands(): Set<string> {
  return new Set([
    ...BASH_WHITELIST.readonly,
    ...BASH_WHITELIST.textProcessing,
    ...BASH_WHITELIST.systemInfo,
    ...BASH_WHITELIST.network,
  ]);
}
