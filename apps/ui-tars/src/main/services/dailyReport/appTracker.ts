/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

import { v4 as uuidv4 } from 'uuid';

import { logger } from '@main/logger';
import { DailyReportStore } from '@main/store/dailyReportStore';
import { AppUsageRecord } from '@main/store/types';

const execFileAsync = promisify(execFile);

interface ActiveWindowResult {
  owner: { name: string };
  title: string;
}

/**
 * Get the active window information using AppleScript (macOS only).
 * This avoids native module compatibility issues with Electron.
 */
async function getActiveWindow(): Promise<ActiveWindowResult | null> {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    // Get frontmost app name
    const { stdout: appName } = await execFileAsync('osascript', [
      '-e',
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);

    // Get window title
    const { stdout: windowTitle } = await execFileAsync('osascript', [
      '-e',
      `tell application "System Events"
        set frontApp to first application process whose frontmost is true
        set appName to name of frontApp
        try
          tell process appName to get name of front window
        on error
          return ""
        end try
      end tell`,
    ]);

    return {
      owner: { name: appName.trim() },
      title: windowTitle.trim(),
    };
  } catch (error) {
    logger.error('getActiveWindow: AppleScript execution failed', error);
    return null;
  }
}

export interface ActiveWindowInfo {
  appName: string;
  windowTitle: string;
}

export class AppTrackerService {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private readonly POLL_INTERVAL_MS = 1000; // 1 second
  private currentApp: ActiveWindowInfo | null = null;
  private currentAppStartTime: number | null = null;
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.log('AppTrackerService: Already running');
      return;
    }

    logger.log('AppTrackerService: Starting app tracking');
    this.isRunning = true;
    this.currentAppStartTime = Date.now();
    DailyReportStore.setCurrentSessionStart(this.currentAppStartTime);

    // Start polling
    this.pollInterval = setInterval(() => {
      this.trackActiveWindow().catch((err) => {
        logger.error('AppTrackerService: Error tracking active window', err);
      });
    }, this.POLL_INTERVAL_MS);

    // Initial track
    await this.trackActiveWindow();
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.log('AppTrackerService: Stopping app tracking');

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Save current app usage before stopping
    this.saveCurrentAppUsage();

    this.isRunning = false;
    this.currentApp = null;
    this.currentAppStartTime = null;
    DailyReportStore.setCurrentSessionStart(null);
  }

  private async trackActiveWindow(): Promise<void> {
    try {
      const windowInfo = await getActiveWindow();

      if (!windowInfo) {
        return;
      }

      const appName = windowInfo.owner?.name || 'Unknown';
      const windowTitle = windowInfo.title || '';

      // Check if excluded
      const settings = DailyReportStore.getSettings();
      if (settings.excludedApps.includes(appName)) {
        return;
      }

      const newWindowInfo: ActiveWindowInfo = { appName, windowTitle };

      // Check if app changed
      if (this.currentApp?.appName !== appName) {
        // Save previous app usage
        this.saveCurrentAppUsage();

        // Start tracking new app
        this.currentApp = newWindowInfo;
        this.currentAppStartTime = Date.now();
      } else {
        // Update window title if changed (same app)
        this.currentApp = newWindowInfo;
      }
    } catch (error) {
      logger.error('AppTrackerService: Failed to get active window', error);
    }
  }

  private saveCurrentAppUsage(): void {
    if (!this.currentApp || !this.currentAppStartTime) {
      return;
    }

    const endTime = Date.now();
    const duration = endTime - this.currentAppStartTime;

    // Only save if duration is at least 1 second
    if (duration < 1000) {
      return;
    }

    const record: AppUsageRecord = {
      id: uuidv4(),
      appName: this.currentApp.appName,
      windowTitle: this.currentApp.windowTitle,
      startTime: this.currentAppStartTime,
      endTime,
      duration,
      date: this.getDateString(this.currentAppStartTime),
    };

    DailyReportStore.addAppUsageRecord(record);
    logger.log(
      `AppTrackerService: Saved usage for ${record.appName}: ${duration}ms`,
    );
  }

  private getDateString(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  isTracking(): boolean {
    return this.isRunning;
  }

  getCurrentApp(): ActiveWindowInfo | null {
    return this.currentApp;
  }
}
