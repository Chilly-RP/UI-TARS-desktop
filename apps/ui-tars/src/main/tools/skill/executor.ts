/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@main/logger';
import { SkillLoader } from './loader';
import { SkillValidator } from './validator';
import { SkillActionInputs, SkillExecutionResult } from './types';

/**
 * SkillExecutor handles skill action execution
 */
export class SkillExecutor {
  private loader: SkillLoader;
  private validator: SkillValidator;

  constructor(skillsDirectory?: string) {
    this.loader = new SkillLoader(skillsDirectory);
    this.validator = new SkillValidator();
  }

  /**
   * Execute a skill action
   */
  async execute(inputs: SkillActionInputs): Promise<SkillExecutionResult> {
    // 1. Validate inputs
    const validation = this.validator.validate(inputs);
    if (!validation.isValid) {
      logger.error(`[SkillExecutor] Validation failed: ${validation.reason}`);
      return {
        success: false,
        error: validation.reason,
      };
    }

    const { name, action, file } = inputs;

    logger.info(
      `[SkillExecutor] Executing action: ${action}, skill: ${name || 'N/A'}`,
    );

    try {
      switch (action) {
        case 'list':
          return await this.listSkills();

        case 'load':
          return await this.loadSkill(name!, file);

        case 'info':
          return await this.getSkillInfo(name!);

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      const error = err as Error;
      logger.error(`[SkillExecutor] Execution error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List all available skills
   */
  private async listSkills(): Promise<SkillExecutionResult> {
    const skills = await this.loader.discoverSkills();

    if (skills.length === 0) {
      return {
        success: true,
        output: 'No skills available.',
      };
    }

    const formatted = skills
      .map((s) => `- ${s.name}: ${s.description}`)
      .join('\n');

    return {
      success: true,
      output: `Available skills:\n${formatted}`,
    };
  }

  /**
   * Load a skill's content
   */
  private async loadSkill(
    skillName: string,
    file?: string,
  ): Promise<SkillExecutionResult> {
    // Load specific file if requested
    if (file) {
      const fileContent = await this.loader.loadSupportingFile(skillName, file);
      if (!fileContent) {
        return {
          success: false,
          error: `File '${file}' not found in skill '${skillName}'`,
        };
      }
      return {
        success: true,
        output: fileContent,
        skillContent: fileContent,
      };
    }

    // Load main skill content
    const skill = await this.loader.loadSkill(skillName);
    if (!skill) {
      return {
        success: false,
        error: `Skill '${skillName}' not found`,
      };
    }

    // Build output with skill content and available supporting files
    let output = skill.content;

    if (skill.supportingFiles.size > 0) {
      const fileList = Array.from(skill.supportingFiles.keys()).join(', ');
      output += `\n\n---\nAvailable supporting files: ${fileList}\nUse skill(name='${skillName}', action='load', file='<filename>') to load a specific file.`;
    }

    return {
      success: true,
      output,
      skillContent: skill.content,
      metadata: skill.metadata,
    };
  }

  /**
   * Get skill information (metadata only)
   */
  private async getSkillInfo(skillName: string): Promise<SkillExecutionResult> {
    const skill = await this.loader.loadSkill(skillName);
    if (!skill) {
      return {
        success: false,
        error: `Skill '${skillName}' not found`,
      };
    }

    const info = [
      `Name: ${skill.metadata.name}`,
      `Description: ${skill.metadata.description}`,
      skill.metadata.version ? `Version: ${skill.metadata.version}` : null,
      skill.metadata.author ? `Author: ${skill.metadata.author}` : null,
      skill.metadata.license ? `License: ${skill.metadata.license}` : null,
      `Supporting files: ${skill.supportingFiles.size > 0 ? Array.from(skill.supportingFiles.keys()).join(', ') : 'None'}`,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      success: true,
      output: info,
      metadata: skill.metadata,
    };
  }

  /**
   * Get the skills directory
   */
  getSkillsDirectory(): string {
    return this.loader.getSkillsDirectory();
  }
}
