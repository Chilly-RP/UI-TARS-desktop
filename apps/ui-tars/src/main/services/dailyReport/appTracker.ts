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

import { getLocalDateString } from './dateUtils';

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
  private readonly GAP_THRESHOLD_MS = 30000; // 30 seconds - detect sleep/suspend gaps
  private currentApp: ActiveWindowInfo | null = null;
  private currentAppStartTime: number | null = null;
  private lastPollTime: number | null = null;
  private isPaused = false;
  private isRunning = false;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.log('AppTrackerService: Already running');
      return;
    }

    logger.log('AppTrackerService: Starting app tracking');
    this.isRunning = true;
    this.isPaused = false;
    this.currentAppStartTime = Date.now();
    this.lastPollTime = Date.now();
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
    this.isPaused = false;
    this.currentApp = null;
    this.currentAppStartTime = null;
    this.lastPollTime = null;
    DailyReportStore.setCurrentSessionStart(null);
  }

  /**
   * Pause tracking (e.g., when system sleeps or screen locks).
   * Saves current app usage with endTime=now and stops the polling timer.
   */
  pause(): void {
    if (!this.isRunning || this.isPaused) {
      return;
    }

    logger.log('AppTrackerService: Pausing tracking (system sleep/lock)');
    this.isPaused = true;

    // Save current app usage before pausing
    this.saveCurrentAppUsage();
    this.currentApp = null;
    this.currentAppStartTime = null;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Resume tracking (e.g., when system wakes or screen unlocks).
   * Resets timestamps and restarts the polling timer.
   */
  resume(): void {
    if (!this.isRunning || !this.isPaused) {
      return;
    }

    logger.log('AppTrackerService: Resuming tracking (system wake/unlock)');
    this.isPaused = false;
    this.currentAppStartTime = Date.now();
    this.lastPollTime = Date.now();

    // Restart polling
    this.pollInterval = setInterval(() => {
      this.trackActiveWindow().catch((err) => {
        logger.error('AppTrackerService: Error tracking active window', err);
      });
    }, this.POLL_INTERVAL_MS);

    // Immediate track
    this.trackActiveWindow().catch((err) => {
      logger.error('AppTrackerService: Error tracking active window on resume', err);
    });
  }

  private async trackActiveWindow(): Promise<void> {
    try {
      const now = Date.now();

      // Layer 2: Gap detection — if time since last poll exceeds threshold,
      // the system likely slept. Fix endTime of last record to lastPollTime.
      if (this.lastPollTime && now - this.lastPollTime > this.GAP_THRESHOLD_MS) {
        logger.log(
          `AppTrackerService: Detected time gap of ${now - this.lastPollTime}ms (threshold: ${this.GAP_THRESHOLD_MS}ms), correcting last record`,
        );
        this.saveCurrentAppUsageWithEndTime(this.lastPollTime);
        this.currentApp = null;
        this.currentAppStartTime = now;
      }

      this.lastPollTime = now;

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

      // Check if app changed OR window title changed (detects file/tab switches)
      if (
        this.currentApp?.appName !== appName ||
        this.currentApp?.windowTitle !== windowTitle
      ) {
        // Save previous app usage (with minimum duration protection)
        this.saveCurrentAppUsage();

        // Start tracking new window state
        this.currentApp = newWindowInfo;
        this.currentAppStartTime = Date.now();
      }
    } catch (error) {
      logger.error('AppTrackerService: Failed to get active window', error);
    }
  }

  /**
   * Save current app usage with a specific endTime (used for gap correction).
   */
  private saveCurrentAppUsageWithEndTime(endTime: number): void {
    if (!this.currentApp || !this.currentAppStartTime) {
      return;
    }

    const duration = endTime - this.currentAppStartTime;
    if (duration < 2000) {
      return;
    }

    const segments = this.splitByDate(this.currentAppStartTime, endTime);
    for (const { start, end, date } of segments) {
      const record: AppUsageRecord = {
        id: uuidv4(),
        appName: this.currentApp.appName,
        windowTitle: this.currentApp.windowTitle,
        startTime: start,
        endTime: end,
        duration: end - start,
        date,
      };

      DailyReportStore.addAppUsageRecord(record);
      logger.log(
        `AppTrackerService: Saved usage (gap-corrected) for ${record.appName}: ${end - start}ms (date: ${date})`,
      );
    }
  }

  private saveCurrentAppUsage(): void {
    if (!this.currentApp || !this.currentAppStartTime) {
      return;
    }

    const endTime = Date.now();
    const duration = endTime - this.currentAppStartTime;

    // Only save if duration is at least 2 seconds (filters high-frequency title changes)
    if (duration < 2000) {
      return;
    }

    // Split records at midnight boundaries so each record belongs to a single local date
    const segments = this.splitByDate(this.currentAppStartTime, endTime);
    for (const { start, end, date } of segments) {
      const record: AppUsageRecord = {
        id: uuidv4(),
        appName: this.currentApp.appName,
        windowTitle: this.currentApp.windowTitle,
        startTime: start,
        endTime: end,
        duration: end - start,
        date,
      };

      DailyReportStore.addAppUsageRecord(record);
      logger.log(
        `AppTrackerService: Saved usage for ${record.appName}: ${end - start}ms (date: ${date})`,
      );
    }
  }

  private splitByDate(
    startTime: number,
    endTime: number,
  ): Array<{ start: number; end: number; date: string }> {
    const results: Array<{ start: number; end: number; date: string }> = [];
    let current = startTime;

    while (current < endTime) {
      const currentDate = new Date(current);
      // Next local midnight
      const nextMidnight = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate() + 1,
      ).getTime();
      const segmentEnd = Math.min(nextMidnight, endTime);

      results.push({
        start: current,
        end: segmentEnd,
        date: getLocalDateString(current),
      });

      current = segmentEnd;
    }

    return results;
  }

  isTracking(): boolean {
    return this.isRunning;
  }

  getCurrentApp(): ActiveWindowInfo | null {
    return this.currentApp;
  }
}
