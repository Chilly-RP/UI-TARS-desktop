/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserWindow } from 'electron';

import { logger } from '@main/logger';
import { DailyReportStore } from '@main/store/dailyReportStore';
import {
  DailyReport,
  DailyReportSettings,
  AgentInteraction,
  TerminalActivityContext,
} from '@main/store/types';

import { AppTrackerService } from './appTracker';
import { ScreenshotCaptureService } from './screenshotCapture';
import { VLMAnalyzer } from './vlmAnalyzer';
import { ReportGenerator } from './reportGenerator';
import { NotificationScheduler } from './notificationScheduler';
import { getLocalDateString } from './dateUtils';
import {
  extractTerminalActivities,
  summarizeTerminalActivities,
} from './windowTitleParser';
import {
  checkExtendedHistoryStatus,
  getCommandsForDate,
  summarizeCommands,
  getSetupGuideText,
  ShellHistoryStatus,
} from './shellHistoryCollector';

export class DailyReportService {
  private static instance: DailyReportService | null = null;

  private appTracker: AppTrackerService;
  private screenshotCapture: ScreenshotCaptureService;
  private vlmAnalyzer: VLMAnalyzer;
  private reportGenerator: ReportGenerator;
  private notificationScheduler: NotificationScheduler;

  private isInitialized = false;
  private agentInteractions: AgentInteraction[] = [];

  private constructor() {
    this.appTracker = new AppTrackerService();
    this.screenshotCapture = new ScreenshotCaptureService();
    this.vlmAnalyzer = new VLMAnalyzer();
    this.reportGenerator = new ReportGenerator();
    this.notificationScheduler = new NotificationScheduler();
  }

  public static getInstance(): DailyReportService {
    if (!DailyReportService.instance) {
      DailyReportService.instance = new DailyReportService();
    }
    return DailyReportService.instance;
  }

  /**
   * Initialize the daily report service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.log('DailyReportService: Initializing');

    // Load existing screenshots from disk
    this.screenshotCapture.loadScreenshotsFromDisk();

    // Check if service should be enabled
    const settings = DailyReportStore.getSettings();
    if (settings.enabled) {
      await this.start();
    }

    this.isInitialized = true;
    logger.log('DailyReportService: Initialized');
  }

  /**
   * Start all tracking services
   */
  async start(): Promise<void> {
    const settings = DailyReportStore.getSettings();

    if (!settings.enabled) {
      logger.log('DailyReportService: Not enabled, skipping start');
      return;
    }

    logger.log('DailyReportService: Starting services');

    // Start app tracking
    await this.appTracker.start();

    // Start screenshot capture
    await this.screenshotCapture.start();

    // Start notification scheduler
    this.notificationScheduler.start(() => {
      this.generateAndSaveReport();
    });

    // Clean up old data based on retention settings
    this.cleanupOldData();
  }

  /**
   * Stop all tracking services
   */
  stop(): void {
    logger.log('DailyReportService: Stopping services');

    this.appTracker.stop();
    this.screenshotCapture.stop();
    this.notificationScheduler.stop();
  }

  /**
   * Enable or disable the service
   */
  async setEnabled(enabled: boolean): Promise<void> {
    DailyReportStore.updateSettings({ enabled });

    if (enabled) {
      await this.start();
    } else {
      this.stop();
    }
  }

  /**
   * Update settings
   */
  async updateSettings(settings: Partial<DailyReportSettings>): Promise<void> {
    const wasEnabled = DailyReportStore.getSettings().enabled;
    DailyReportStore.updateSettings(settings);
    const isEnabled = DailyReportStore.getSettings().enabled;

    // Handle enable/disable state change
    if (wasEnabled !== isEnabled) {
      if (isEnabled) {
        await this.start();
      } else {
        this.stop();
      }
    }

    // If screenshot interval changed and service is running, restart screenshot capture
    if (settings.screenshotIntervalMinutes !== undefined && isEnabled) {
      this.screenshotCapture.stop();
      await this.screenshotCapture.start();
    }
  }

  /**
   * Get current settings
   */
  getSettings(): DailyReportSettings {
    return DailyReportStore.getSettings();
  }

  /**
   * Add an agent interaction record
   */
  addAgentInteraction(interaction: AgentInteraction): void {
    this.agentInteractions.push(interaction);
    logger.log(
      `DailyReportService: Added agent interaction for ${interaction.instruction.substring(0, 50)}...`,
    );
  }

  /**
   * Generate a daily report for a specific date (or today)
   */
  async generateReport(date?: string): Promise<DailyReport | null> {
    const targetDate = date || this.reportGenerator.getCurrentDateString();

    logger.log(`DailyReportService: Generating report for ${targetDate}`);

    // Check if there's enough data
    if (!this.reportGenerator.hasEnoughData(targetDate)) {
      logger.warn('DailyReportService: Not enough data for report');
      return null;
    }

    // Get screenshots for the date
    const screenshots = this.screenshotCapture.getScreenshotsByDate(targetDate);

    // Collect terminal activity context
    const terminalContext = this.collectTerminalContext(targetDate);

    // Analyze screenshots with VLM
    const vlmResults = await this.vlmAnalyzer.analyzeScreenshots(
      screenshots,
      (filePath) => this.screenshotCapture.getScreenshotAsBase64(filePath),
      terminalContext,
    );

    // Get agent interactions for today
    const todayInteractions = this.agentInteractions.filter((i) => {
      const interactionDate = getLocalDateString(i.timestamp);
      return interactionDate === targetDate;
    });

    // Generate report
    const report = this.reportGenerator.generateReport(
      targetDate,
      vlmResults,
      todayInteractions,
      terminalContext,
    );

    return report;
  }

  /**
   * Generate and save report, then notify renderer
   */
  private async generateAndSaveReport(): Promise<void> {
    try {
      const report = await this.generateReport();

      if (report) {
        // Update last report date
        DailyReportStore.setLastReportDate(report.date);

        // Notify all windows about the new report
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send('daily-report-generated', report);
        });

        logger.log('DailyReportService: Report generated and saved');
      }
    } catch (error) {
      logger.error('DailyReportService: Failed to generate report', error);
    }
  }

  /**
   * Clean up old data based on retention settings
   */
  private cleanupOldData(): void {
    const settings = DailyReportStore.getSettings();

    // Clean up old app usage records
    DailyReportStore.cleanupOldRecords(settings.retentionDays);

    // Clean up old screenshots
    this.screenshotCapture.cleanupOldScreenshots(settings.retentionDays);

    // Clean up old agent interactions
    const cutoffTime =
      Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000;
    this.agentInteractions = this.agentInteractions.filter(
      (i) => i.timestamp >= cutoffTime,
    );

    logger.log('DailyReportService: Cleaned up old data');
  }

  /**
   * Collect terminal activity context for a given date.
   * Combines window title parsing and optional shell history.
   */
  private collectTerminalContext(date: string): TerminalActivityContext {
    const settings = DailyReportStore.getSettings();

    // Window title parsing (always available)
    const appUsageRecords = DailyReportStore.getAppUsageRecordsByDate(date);
    const activities = extractTerminalActivities(appUsageRecords);
    const windowTitleCommands = summarizeTerminalActivities(activities);

    // Shell history (opt-in)
    let shellHistoryCommands: TerminalActivityContext['shellHistoryCommands'] = [];
    let shellHistoryAvailable = false;

    if (settings.enableShellHistory && settings.shellHistoryPath) {
      try {
        const entries = getCommandsForDate(settings.shellHistoryPath, date);
        shellHistoryCommands = summarizeCommands(entries);
        shellHistoryAvailable = true;
        logger.log(
          `DailyReportService: Shell history collected ${entries.length} entries, ${shellHistoryCommands.length} unique commands`,
        );
      } catch (error) {
        logger.error('DailyReportService: Failed to collect shell history', error);
      }
    }

    return {
      windowTitleCommands,
      shellHistoryCommands,
      shellHistoryAvailable,
    };
  }

  /**
   * Check the status of the shell history file
   */
  getShellHistoryStatus(): ShellHistoryStatus {
    const settings = DailyReportStore.getSettings();
    return checkExtendedHistoryStatus(settings.shellHistoryPath);
  }

  /**
   * Get setup guide for enabling EXTENDED_HISTORY
   */
  getShellHistorySetupGuide(): string {
    return getSetupGuideText();
  }

  /**
   * Get service status
   */
  getStatus(): {
    enabled: boolean;
    isTracking: boolean;
    isCapturing: boolean;
    lastReportDate: string | null;
  } {
    return {
      enabled: DailyReportStore.getSettings().enabled,
      isTracking: this.appTracker.isTracking(),
      isCapturing: this.screenshotCapture.isCapturing(),
      lastReportDate: DailyReportStore.getLastReportDate(),
    };
  }

  /**
   * Manually trigger notification (for testing)
   */
  triggerNotification(): void {
    this.notificationScheduler.triggerNotification();
  }

  /**
   * Get screenshots for a date
   */
  getScreenshotsForDate(date: string) {
    return this.screenshotCapture.getScreenshotsByDate(date);
  }

  /**
   * Get screenshot as base64 string
   */
  getScreenshotBase64(filePath: string): string | null {
    return this.screenshotCapture.getScreenshotAsBase64(filePath);
  }

  /**
   * Check data sufficiency for report generation
   */
  checkDataSufficiency(date?: string) {
    const targetDate = date || this.reportGenerator.getCurrentDateString();
    return this.reportGenerator.checkDataSufficiency(targetDate);
  }

  /**
   * Delete screenshots by IDs
   */
  deleteScreenshots(ids: string[]): {
    success: boolean;
    deletedCount: number;
    errors: string[];
  } {
    return this.screenshotCapture.deleteScreenshotsByIds(ids);
  }
}

// Export sub-services for direct access if needed
export { AppTrackerService } from './appTracker';
export { ScreenshotCaptureService } from './screenshotCapture';
export { VLMAnalyzer } from './vlmAnalyzer';
export { ReportGenerator } from './reportGenerator';
export { NotificationScheduler } from './notificationScheduler';
export type { ShellHistoryStatus } from './shellHistoryCollector';
