/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Notification, BrowserWindow } from 'electron';

import { logger } from '@main/logger';
import { DailyReportStore } from '@main/store/dailyReportStore';

import { getLocalDateString } from './dateUtils';

export type NotificationCallback = () => void;

export class NotificationScheduler {
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastNotificationDate: string | null = null;
  private isRunning = false;
  private onReportReadyCallback: NotificationCallback | null = null;

  /**
   * Start the notification scheduler
   */
  start(onReportReady: NotificationCallback): void {
    if (this.isRunning) {
      logger.log('NotificationScheduler: Already running');
      return;
    }

    this.onReportReadyCallback = onReportReady;
    this.isRunning = true;

    // Check every minute if it's time to notify
    this.checkInterval = setInterval(() => {
      this.checkAndNotify();
    }, 60 * 1000);

    logger.log('NotificationScheduler: Started');
  }

  /**
   * Stop the notification scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isRunning = false;
    logger.log('NotificationScheduler: Stopped');
  }

  /**
   * Check if it's time to send a notification
   */
  private checkAndNotify(): void {
    const settings = DailyReportStore.getSettings();

    if (!settings.enabled) {
      return;
    }

    const now = new Date();
    const currentDate = getLocalDateString(now.getTime());
    const currentTime = this.formatTime(now);

    // Check if we already notified today
    if (this.lastNotificationDate === currentDate) {
      return;
    }

    // Check if it's notification time
    if (currentTime === settings.notificationTime) {
      this.sendNotification();
      this.lastNotificationDate = currentDate;
    }
  }

  /**
   * Format time as HH:mm
   */
  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Send system notification
   */
  private sendNotification(): void {
    if (!Notification.isSupported()) {
      logger.warn('NotificationScheduler: Notifications not supported');
      return;
    }

    const notification = new Notification({
      title: 'Daily Report Ready',
      body: 'Your daily activity report is ready to view. Click to open.',
      silent: false,
    });

    notification.on('click', () => {
      this.openReportPage();
    });

    notification.show();
    logger.log('NotificationScheduler: Notification sent');

    // Trigger report generation callback
    if (this.onReportReadyCallback) {
      this.onReportReadyCallback();
    }
  }

  /**
   * Open the report page in the main window
   */
  private openReportPage(): void {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWindow = windows[0];
      mainWindow.show();
      mainWindow.focus();
      // Send IPC to navigate to report page
      mainWindow.webContents.send('navigate-to-daily-report');
    }
  }

  /**
   * Manually trigger a notification (for testing)
   */
  triggerNotification(): void {
    this.sendNotification();
  }

  /**
   * Update notification time
   */
  updateNotificationTime(time: string): void {
    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      logger.error('NotificationScheduler: Invalid time format', time);
      return;
    }

    DailyReportStore.updateSettings({ notificationTime: time });
    logger.log(`NotificationScheduler: Updated notification time to ${time}`);
  }

  isSchedulerRunning(): boolean {
    return this.isRunning;
  }
}
