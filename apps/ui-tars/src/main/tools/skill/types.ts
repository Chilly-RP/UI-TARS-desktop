/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Skill metadata parsed from YAML frontmatter in SKILL.md
 */
export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  version?: string;
  author?: string;
}

/**
 * Represents a loaded skill with all its content
 */
export interface Skill {
  metadata: SkillMetadata;
  content: string; // Main SKILL.md content (after frontmatter)
  supportingFiles: Map<string, string>; // filename -> content
  rootPath: string; // Absolute path to skill directory
}

/**
 * Skill action types
 */
export type SkillAction = 'load' | 'list' | 'info';

/**
 * Input parameters for skill action
 */
export interface SkillActionInputs {
  name?: string; // Skill name (required for 'load' and 'info')
  action: SkillAction;
  file?: string; // Optional: specific supporting file to load
}

/**
 * Result of skill execution
 */
export interface SkillExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  skillContent?: string;
  metadata?: SkillMetadata;
}

/**
 * Summary of a skill for listing purposes
 */
export interface SkillSummary {
  name: string;
  description: string;
}
