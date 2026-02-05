/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

import { SearchEngineForSettings, VLMProviderV2, Operator } from './types';

const PresetSourceSchema = z.object({
  type: z.enum(['local', 'remote']),
  url: z.string().url().optional(),
  autoUpdate: z.boolean().optional(),
  lastUpdated: z.number().optional(),
});

// Daily Report Settings Schema
export const DailyReportSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  screenshotIntervalMinutes: z.number().min(1).max(15).default(5),
  retentionDays: z.number().min(1).max(7).default(3),
  notificationTime: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .default('20:00'),
  excludedApps: z.array(z.string()).default([]),
});

export const PresetSchema = z.object({
  // Local VLM Settings
  vlmProvider: z.nativeEnum(VLMProviderV2).optional(),
  vlmBaseUrl: z.string().url(),
  vlmApiKey: z.string().min(1),
  vlmModelName: z.string().min(1),
  useResponsesApi: z.boolean().optional(),

  // Chat Settings
  operator: z.nativeEnum(Operator),
  language: z.enum(['zh', 'en']).optional(),
  screenshotScale: z.number().min(0.1).max(1).optional(),
  maxLoopCount: z.number().min(25).max(200).optional(),
  loopIntervalInMs: z.number().min(0).max(3000).optional(),
  searchEngineForBrowser: z.nativeEnum(SearchEngineForSettings).optional(),

  // Image Compression Settings
  /** Resolution scale factor for screenshots (0.1-1.0), lower = smaller image, faster inference */
  resolutionScaleFactor: z.number().min(0.1).max(1).optional(),
  /** JPEG quality for screenshot compression (1-100), lower = smaller file size */
  screenshotJpegQuality: z.number().min(1).max(100).optional(),
  /** PNG quality for image preprocessing (1-100), lower = smaller file size */
  preprocessPngQuality: z.number().min(1).max(100).optional(),

  // Report Settings
  reportStorageBaseUrl: z.string().url().optional(),
  utioBaseUrl: z.string().url().optional(),
  presetSource: PresetSourceSchema.optional(),

  // Command Suggestions
  commandSuggestions: z.array(z.string()).optional(),

  // Debug Settings
  saveRequestsToJson: z.boolean().optional(),

  // ASR Settings
  asrAppKey: z.string().optional(),
  asrAccessKey: z.string().optional(),
  asrWsUrl: z.string().optional(),

  // LLM Settings (for DoubaoSeedModel)
  llmBaseUrl: z.string().url().optional().or(z.literal('')),
  llmApiKey: z.string().optional(),
  llmModelName: z.string().optional(),
  llmReasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  llmUseResponsesApi: z.boolean().optional(),
});

export type PresetSource = z.infer<typeof PresetSourceSchema>;
export type LocalStore = z.infer<typeof PresetSchema>;

export const validatePreset = (data: unknown): LocalStore => {
  return PresetSchema.parse(data);
};
