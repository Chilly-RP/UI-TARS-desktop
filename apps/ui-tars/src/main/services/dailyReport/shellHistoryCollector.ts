/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

import { logger } from '@main/logger';
import { TerminalCommandSummary } from '@main/store/types';
import { TRIVIAL_COMMANDS } from './terminalConstants';

/** Sensitive keywords — commands containing these are redacted */
const SENSITIVE_PATTERNS =
  /password|passwd|token|secret|api_key|apikey|authorization|credential|private_key|ssh_key/i;

/** Maximum lines to read from non-timestamped history */
const MAX_RECENT_LINES = 200;

export interface ShellHistoryStatus {
  exists: boolean;
  extendedHistoryEnabled: boolean;
  lineCount: number;
  path: string;
}

interface HistoryEntry {
  command: string;
  timestamp?: number;
}

/**
 * Resolve a shell history path, expanding ~ to home directory.
 */
function resolvePath(historyPath: string): string {
  if (historyPath.startsWith('~')) {
    return path.join(os.homedir(), historyPath.slice(1));
  }
  return historyPath;
}

/**
 * Check the status of the shell history file.
 */
export function checkExtendedHistoryStatus(
  historyPath: string,
): ShellHistoryStatus {
  const resolved = resolvePath(historyPath);
  const result: ShellHistoryStatus = {
    exists: false,
    extendedHistoryEnabled: false,
    lineCount: 0,
    path: resolved,
  };

  try {
    if (!fs.existsSync(resolved)) {
      return result;
    }
    result.exists = true;

    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n').filter((l) => l.length > 0);
    result.lineCount = lines.length;

    // Check for extended history format: ": timestamp:0;command"
    const sampleSize = Math.min(20, lines.length);
    let extendedCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      if (/^:\s*\d+:\d+;/.test(lines[i])) {
        extendedCount++;
      }
    }
    result.extendedHistoryEnabled = extendedCount > sampleSize * 0.5;
  } catch (error) {
    logger.error('ShellHistoryCollector: Failed to check history status', error);
  }

  return result;
}

/**
 * Parse a single history line, handling both extended and plain formats.
 */
function parseHistoryLine(line: string): HistoryEntry | null {
  // Extended format: ": timestamp:0;command"
  const extMatch = line.match(/^:\s*(\d+):\d+;(.+)/);
  if (extMatch) {
    const timestamp = parseInt(extMatch[1], 10) * 1000; // to ms
    const command = extMatch[2].trim();
    if (command.length > 0) {
      return { command, timestamp };
    }
    return null;
  }

  // Plain format: just the command
  const trimmed = line.trim();
  if (trimmed.length > 0 && !trimmed.startsWith('#')) {
    return { command: trimmed };
  }

  return null;
}

/**
 * Sanitize a command by redacting sensitive values.
 * Returns null if the entire command should be excluded.
 */
function sanitizeCommand(command: string): string | null {
  if (SENSITIVE_PATTERNS.test(command)) {
    return null;
  }
  return command;
}

/**
 * Get the base command (first word), handling common prefixes.
 */
function getBaseCommand(command: string): string {
  const parts = command.split(/\s+/);
  const prefixes = new Set(['sudo', 'env', 'nohup', 'time', 'nice']);
  let idx = 0;
  while (idx < parts.length - 1 && prefixes.has(parts[idx])) {
    idx++;
  }
  return parts[idx] || parts[0];
}

/**
 * Get commands for a specific date from the shell history file.
 * If extended history is not enabled, returns the most recent commands as a reference.
 */
export function getCommandsForDate(
  historyPath: string,
  date: string,
): HistoryEntry[] {
  const resolved = resolvePath(historyPath);

  try {
    if (!fs.existsSync(resolved)) {
      return [];
    }

    const content = fs.readFileSync(resolved, 'utf-8');
    const lines = content.split('\n');

    const entries: HistoryEntry[] = [];
    let hasTimestamps = false;

    for (const line of lines) {
      const entry = parseHistoryLine(line);
      if (entry) {
        if (entry.timestamp) {
          hasTimestamps = true;
        }
        entries.push(entry);
      }
    }

    if (hasTimestamps) {
      // Filter by date
      const [year, month, day] = date.split('-').map(Number);
      const dayStart = new Date(year, month - 1, day).getTime();
      const dayEnd = new Date(year, month - 1, day + 1).getTime();

      return entries.filter(
        (e) => e.timestamp && e.timestamp >= dayStart && e.timestamp < dayEnd,
      );
    }

    // No timestamps — return the most recent entries as reference
    return entries.slice(-MAX_RECENT_LINES);
  } catch (error) {
    logger.error('ShellHistoryCollector: Failed to read history', error);
    return [];
  }
}

/**
 * Summarize commands into aggregated summaries with privacy sanitization.
 */
export function summarizeCommands(
  entries: HistoryEntry[],
): TerminalCommandSummary[] {
  const map = new Map<string, { count: number; examples: Set<string> }>();

  for (const entry of entries) {
    const sanitized = sanitizeCommand(entry.command);
    if (!sanitized) {
      continue;
    }

    const base = getBaseCommand(sanitized);
    if (TRIVIAL_COMMANDS.has(base)) {
      continue;
    }
    const existing = map.get(base);
    if (existing) {
      existing.count++;
      if (existing.examples.size < 3) {
        existing.examples.add(sanitized);
      }
    } else {
      map.set(base, { count: 1, examples: new Set([sanitized]) });
    }
  }

  return Array.from(map.entries())
    .map(([baseCommand, { count, examples }]) => ({
      baseCommand,
      count,
      examples: Array.from(examples),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get setup guide text for enabling EXTENDED_HISTORY in zsh.
 */
export function getSetupGuideText(): string {
  return `要启用 zsh 扩展历史记录（包含时间戳），请在 ~/.zshrc 中添加以下配置：

# 启用扩展历史格式（包含时间戳）
setopt EXTENDED_HISTORY

# 可选：增加历史记录大小
HISTSIZE=10000
SAVEHIST=10000

添加后，运行 source ~/.zshrc 使配置生效。
之后新执行的命令将包含时间戳，可以按日期精确筛选。`;
}
