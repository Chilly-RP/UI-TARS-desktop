/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trivial commands that add noise to terminal activity summaries.
 * These are filtered out during command summarization.
 */
export const TRIVIAL_COMMANDS = new Set([
  'cd',
  'ls',
  'll',
  'la',
  'dir',
  'pwd',
  'clear',
  'cls',
  'exit',
  'logout',
  'reset',
  'whoami',
  'which',
  'where',
  'type',
  'history',
  'source',
  'export',
  'alias',
  'unalias',
  'pushd',
  'popd',
  'conda',
  'nvm',
  'true',
  'false',
]);
