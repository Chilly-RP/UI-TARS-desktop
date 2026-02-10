/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { AppUsageRecord, TerminalCommandSummary } from '@main/store/types';
import { TRIVIAL_COMMANDS } from './terminalConstants';

const TERMINAL_APPS = new Set([
  'Terminal',
  'iTerm2',
  'iTerm',
  'Warp',
  'Alacritty',
  'kitty',
  'Hyper',
  'WezTerm',
  'Tabby',
  'Rio',
]);

/**
 * Title patterns for extracting commands from terminal window titles.
 *
 * Common formats:
 *   "user@host: ~/project — vim file.ts"
 *   "~/project — git status"
 *   "user@host:~/project"
 *   "bash — 80×24"
 *   "vim file.ts (~/project)"
 *   "node server.js"
 */
const TITLE_PATTERNS: RegExp[] = [
  // "... — command args"  (em-dash separator, common in iTerm2/Warp)
  /\s[—–-]\s+(.+)$/,
  // "user@host: path — command"
  /:\s*[~\/]\S*\s+[—–-]\s+(.+)$/,
  // Leading command at start: "vim file.ts (...)" or "node server.js"
  /^(\w[\w.+-]*(?:\s+\S+)?)\s*(?:\(|$)/,
];

function isTerminalApp(appName: string): boolean {
  return TERMINAL_APPS.has(appName);
}

/**
 * Extract a probable command string from a terminal window title.
 * Returns null if no command can be identified.
 */
function extractCommandFromTitle(title: string): string | null {
  if (!title || title.trim().length === 0) {
    return null;
  }

  for (const pattern of TITLE_PATTERNS) {
    const match = title.match(pattern);
    if (match && match[1]) {
      const cmd = match[1].trim();
      // Filter out things that don't look like commands
      if (cmd.length > 0 && cmd.length < 200 && /^[a-zA-Z]/.test(cmd)) {
        return cmd;
      }
    }
  }

  // Fallback: if the whole title looks like a short command (no special chars)
  const trimmed = title.trim();
  if (
    trimmed.length < 60 &&
    /^[a-zA-Z][\w.+-]*(\s+\S+)*$/.test(trimmed) &&
    !trimmed.includes('@')
  ) {
    return trimmed;
  }

  return null;
}

/**
 * Get the base command (first word) from a command string.
 */
function getBaseCommand(command: string): string {
  // Handle common prefixes: sudo, env, nohup
  const parts = command.split(/\s+/);
  const prefixes = new Set(['sudo', 'env', 'nohup', 'time', 'nice']);
  let idx = 0;
  while (idx < parts.length - 1 && prefixes.has(parts[idx])) {
    idx++;
  }
  return parts[idx] || parts[0];
}

/**
 * Extract terminal activity commands from app usage records.
 */
export function extractTerminalActivities(
  records: AppUsageRecord[],
): { command: string; baseCommand: string; timestamp: number }[] {
  const activities: { command: string; baseCommand: string; timestamp: number }[] = [];

  for (const record of records) {
    if (!isTerminalApp(record.appName)) {
      continue;
    }
    const command = extractCommandFromTitle(record.windowTitle);
    if (command) {
      activities.push({
        command,
        baseCommand: getBaseCommand(command),
        timestamp: record.startTime,
      });
    }
  }

  return activities;
}

/**
 * Summarize terminal activities into aggregated command summaries,
 * sorted by count descending.
 */
export function summarizeTerminalActivities(
  activities: { command: string; baseCommand: string }[],
): TerminalCommandSummary[] {
  const map = new Map<string, { count: number; examples: Set<string> }>();

  for (const { command, baseCommand } of activities) {
    if (TRIVIAL_COMMANDS.has(baseCommand)) {
      continue;
    }
    const existing = map.get(baseCommand);
    if (existing) {
      existing.count++;
      if (existing.examples.size < 3) {
        existing.examples.add(command);
      }
    } else {
      map.set(baseCommand, { count: 1, examples: new Set([command]) });
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
