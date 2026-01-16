/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { logger } from '@main/logger';
import { Skill, SkillMetadata, SkillSummary } from './types';

// YAML frontmatter pattern: starts with ---, ends with ---
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

/**
 * SkillLoader handles discovery, parsing, and loading of skills
 */
export class SkillLoader {
  private skillsDirectory: string;
  private skillCache: Map<string, Skill> = new Map();

  constructor(skillsDirectory?: string) {
    this.skillsDirectory = skillsDirectory || this.getDefaultSkillsPath();
    logger.info(`[SkillLoader] Skills directory: ${this.skillsDirectory}`);
  }

  /**
   * Get the default skills directory path
   */
  private getDefaultSkillsPath(): string {
    // Check if running in development or production
    if (app.isPackaged) {
      // Production: skills bundled with app
      return path.join(process.resourcesPath, 'skills');
    } else {
      // Development: relative to source - go up from tools/skill to main, then to skills
      // Path: apps/ui-tars/src/main/tools/skill -> apps/ui-tars/skills
      return path.join(__dirname, '../../../../skills');
    }
  }

  /**
   * Discover all available skills
   */
  async discoverSkills(): Promise<SkillSummary[]> {
    const summaries: SkillSummary[] = [];

    try {
      // Check if skills directory exists
      try {
        await fs.access(this.skillsDirectory);
      } catch {
        logger.warn(
          `[SkillLoader] Skills directory not found: ${this.skillsDirectory}`,
        );
        return summaries;
      }

      const entries = await fs.readdir(this.skillsDirectory, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue; // Skip hidden directories

        const skillPath = path.join(this.skillsDirectory, entry.name);
        const skillMdPath = path.join(skillPath, 'SKILL.md');

        try {
          await fs.access(skillMdPath);
          const metadata = await this.parseSkillMetadata(skillMdPath);
          if (metadata) {
            summaries.push({
              name: metadata.name,
              description: metadata.description,
            });
          }
        } catch {
          // SKILL.md doesn't exist, skip this directory
          logger.debug(`[SkillLoader] No SKILL.md in ${entry.name}, skipping`);
        }
      }
    } catch (err) {
      logger.error(`[SkillLoader] Error discovering skills: ${err}`);
    }

    return summaries;
  }

  /**
   * Parse skill metadata from SKILL.md YAML frontmatter
   */
  private async parseSkillMetadata(
    skillMdPath: string,
  ): Promise<SkillMetadata | null> {
    try {
      const content = await fs.readFile(skillMdPath, 'utf-8');
      const match = content.match(FRONTMATTER_REGEX);

      if (!match) {
        logger.warn(`[SkillLoader] No frontmatter found in ${skillMdPath}`);
        return null;
      }

      const yamlContent = match[1];
      return this.parseYamlFrontmatter(yamlContent);
    } catch (err) {
      logger.error(`[SkillLoader] Error parsing ${skillMdPath}: ${err}`);
      return null;
    }
  }

  /**
   * Simple YAML frontmatter parser (handles basic key: value pairs)
   * For more complex YAML, consider using a proper YAML parser
   */
  private parseYamlFrontmatter(yaml: string): SkillMetadata {
    const metadata: Record<string, string> = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // Remove surrounding quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      metadata[key] = value;
    }

    return {
      name: metadata.name || '',
      description: metadata.description || '',
      license: metadata.license,
      version: metadata.version,
      author: metadata.author,
    };
  }

  /**
   * Load a skill by name
   */
  async loadSkill(skillName: string): Promise<Skill | null> {
    // Check cache first
    if (this.skillCache.has(skillName)) {
      logger.info(`[SkillLoader] Returning cached skill: ${skillName}`);
      return this.skillCache.get(skillName)!;
    }

    const skillPath = path.join(this.skillsDirectory, skillName);
    const skillMdPath = path.join(skillPath, 'SKILL.md');

    try {
      // Verify skill exists
      await fs.access(skillMdPath);

      // Read SKILL.md
      const skillMdContent = await fs.readFile(skillMdPath, 'utf-8');

      // Parse metadata and content
      const match = skillMdContent.match(FRONTMATTER_REGEX);
      if (!match) {
        logger.error(`[SkillLoader] No frontmatter in ${skillName}/SKILL.md`);
        return null;
      }

      const metadata = this.parseYamlFrontmatter(match[1]);
      const content = skillMdContent.slice(match[0].length); // Content after frontmatter

      // Load supporting files
      const supportingFiles = await this.loadSupportingFiles(skillPath);

      const skill: Skill = {
        metadata,
        content,
        supportingFiles,
        rootPath: skillPath,
      };

      // Cache the skill
      this.skillCache.set(skillName, skill);

      logger.info(`[SkillLoader] Loaded skill: ${skillName}`);
      return skill;
    } catch (err) {
      logger.error(`[SkillLoader] Error loading skill ${skillName}: ${err}`);
      return null;
    }
  }

  /**
   * Load supporting markdown files from skill directory
   */
  private async loadSupportingFiles(
    skillPath: string,
  ): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    try {
      const entries = await fs.readdir(skillPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (entry.name === 'SKILL.md') continue; // Skip main file
        if (!entry.name.endsWith('.md')) continue; // Only load markdown files

        const filePath = path.join(skillPath, entry.name);
        const content = await fs.readFile(filePath, 'utf-8');
        files.set(entry.name, content);
      }
    } catch (err) {
      logger.error(`[SkillLoader] Error loading supporting files: ${err}`);
    }

    return files;
  }

  /**
   * Load a specific supporting file from a skill
   */
  async loadSupportingFile(
    skillName: string,
    fileName: string,
  ): Promise<string | null> {
    const skill = await this.loadSkill(skillName);
    if (!skill) return null;

    // Check if file is in the supportingFiles map
    if (skill.supportingFiles.has(fileName)) {
      return skill.supportingFiles.get(fileName)!;
    }

    // Try loading directly from disk (for non-.md files)
    const filePath = path.join(skill.rootPath, fileName);
    try {
      // Security: ensure file is within skill directory
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(skill.rootPath)) {
        logger.warn(`[SkillLoader] Path traversal attempt: ${fileName}`);
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch {
      logger.error(`[SkillLoader] File not found: ${skillName}/${fileName}`);
      return null;
    }
  }

  /**
   * Clear the skill cache
   */
  clearCache(): void {
    this.skillCache.clear();
    logger.info('[SkillLoader] Cache cleared');
  }

  /**
   * Get skills directory path
   */
  getSkillsDirectory(): string {
    return this.skillsDirectory;
  }
}
