/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { GUIAgentData, Message } from '@ui-tars/shared/types';

import { LocalStore, PresetSource } from './validate';
import { ConversationWithSoM } from '@main/shared/types';

export type NextAction =
  | { type: 'key'; text: string }
  | { type: 'type'; text: string }
  | { type: 'mouse_move'; x: number; y: number }
  | { type: 'left_click' }
  | { type: 'left_click_drag'; x: number; y: number }
  | { type: 'right_click' }
  | { type: 'middle_click' }
  | { type: 'double_click' }
  | { type: 'screenshot' }
  | { type: 'cursor_position' }
  | { type: 'finish' }
  | { type: 'error'; message: string };

export type AppState = {
  theme: 'dark' | 'light';
  ensurePermissions: { screenCapture?: boolean; accessibility?: boolean };
  instructions: string | null;
  restUserData: Omit<GUIAgentData, 'status' | 'conversations'> | null;
  status: GUIAgentData['status'];
  errorMsg: string | null;
  sessionHistoryMessages: Message[];
  messages: ConversationWithSoM[];
  abortController: AbortController | null;
  thinking: boolean;
  browserAvailable: boolean;
};

export enum VlmProvider {
  // Ollama = 'ollama',
  Huggingface = 'Hugging Face',
  vLLM = 'vLLM',
}

export enum VLMProviderV2 {
  ui_tars_1_0 = 'Hugging Face for UI-TARS-1.0',
  ui_tars_1_5 = 'Hugging Face for UI-TARS-1.5',
  doubao_1_5 = 'VolcEngine Ark for Doubao-1.5-UI-TARS',
  doubao_1_5_vl = 'VolcEngine Ark for Doubao-1.5-thinking-vision-pro',
}

export enum SearchEngineForSettings {
  GOOGLE = 'google',
  BAIDU = 'baidu',
  BING = 'bing',
}

export enum Operator {
  RemoteComputer = 'Remote Computer Operator',
  RemoteBrowser = 'Remote Browser Operator',
  LocalComputer = 'Local Computer Operator',
  LocalBrowser = 'Local Browser Operator',
  LocalAgent = 'Local Agent Assistant',
}

// Daily Report Types
export interface DailyReportSettings {
  enabled: boolean;
  screenshotIntervalMinutes: number; // 1-15
  retentionDays: number; // 1-7
  notificationTime: string; // "HH:mm"
  excludedApps: string[];
  enableShellHistory: boolean;
  shellHistoryPath: string;
  vlmModelName?: string; // 日报专用 VLM 模型名，空则回退主 VLM
}

export interface AppUsageRecord {
  id: string;
  appName: string;
  windowTitle: string;
  startTime: number;
  endTime: number;
  duration: number;
  date: string; // YYYY-MM-DD
}

export interface AppUsageSummary {
  appName: string;
  duration: number;
  percentage: number;
}

export interface ActivitySummary {
  timeRange: string;
  summary: string;
  topics: string[];
}

export interface AgentInteraction {
  instruction: string;
  status: string;
  timestamp: number;
}

// Deep Insights Types
export interface ProjectContext {
  projectName: string;
  totalDuration: number;
  percentage: number;
  apps: string[];
  subModules?: string[];
}

export interface DeepWorkSession {
  startTime: number;
  endTime: number;
  duration: number;
  primaryApp: string;
  project?: string;
  keyOutput?: string;
  filesWorkedOn?: string[];
}

export interface FrustrationSignal {
  type: 'rapid_switch' | 'repeated_search' | 'restart_loop' | 'error_search_sequence';
  description: string;
  timeRange: string;
  resolution?: string;
}

export interface FocusMetrics {
  deepWorkSessions: DeepWorkSession[];
  totalDeepWorkMs: number;
  deepWorkRatio: number;
  contextSwitchesPerHour: number;
  distractionSources: { appName: string; interruptions: number }[];
  frustrationSignals: FrustrationSignal[];
  topSwitchPairs?: { pair: string; count: number }[];
}

export interface DeepInsights {
  projects: ProjectContext[];
  focusMetrics: FocusMetrics;
}

export interface StructuredSummary {
  narrative: string;
  keyAccomplishments: string[];
  blockers: string[];
  efficiencyHighlights: string[];
  suggestions: string[];
  milestones?: string[];
  attentionDrain?: { topSwitchPair: string; switchCount: number; suggestion: string }[];
}

export interface DailyReport {
  id: string;
  date: string; // YYYY-MM-DD
  totalScreenTime: number;
  appUsage: AppUsageSummary[];
  activities: ActivitySummary[];
  agentInteractions: AgentInteraction[];
  summary: string;
  generatedAt: number;
  insights?: DeepInsights;
  structuredSummary?: StructuredSummary;
}

// Terminal Activity Context (passed to report generator and VLM)
export interface TerminalCommandSummary {
  baseCommand: string;
  count: number;
  examples: string[];
}

export interface TerminalActivityContext {
  windowTitleCommands: TerminalCommandSummary[];
  shellHistoryCommands: TerminalCommandSummary[];
  shellHistoryAvailable: boolean;
  shellHistoryHasTimestamps: boolean;
}

export interface ReportGenerationProgress {
  stage: string;
  stageLabel: string;
  percent: number;
  detail?: string;
}

export const DEFAULT_DAILY_REPORT_SETTINGS: DailyReportSettings = {
  enabled: false,
  screenshotIntervalMinutes: 5,
  retentionDays: 3,
  notificationTime: '20:00',
  excludedApps: [],
  enableShellHistory: false,
  shellHistoryPath: '~/.zsh_history',
};

export type { PresetSource, LocalStore };
