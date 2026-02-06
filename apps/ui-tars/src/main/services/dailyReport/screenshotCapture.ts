/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { desktopCapturer, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { logger } from '@main/logger';
import { DailyReportStore } from '@main/store/dailyReportStore';
import { getScreenSize } from '@main/utils/screen';

export interface CapturedScreenshot {
  id: string;
  filePath: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
}

export class ScreenshotCaptureService {
  private captureInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private screenshotDir: string;
  private capturedScreenshots: CapturedScreenshot[] = [];

  constructor() {
    this.screenshotDir = path.join(
      app.getPath('userData'),
      'daily-report-screenshots',
    );
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.log('ScreenshotCaptureService: Already running');
      return;
    }

    const settings = DailyReportStore.getSettings();
    const intervalMs = settings.screenshotIntervalMinutes * 60 * 1000;

    logger.log(
      `ScreenshotCaptureService: Starting with interval ${settings.screenshotIntervalMinutes} minutes`,
    );
    this.isRunning = true;

    // Take initial screenshot
    await this.captureScreenshot();

    // Start periodic capture
    this.captureInterval = setInterval(() => {
      this.captureScreenshot().catch((err) => {
        logger.error(
          'ScreenshotCaptureService: Error capturing screenshot',
          err,
        );
      });
    }, intervalMs);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.log('ScreenshotCaptureService: Stopping');

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    this.isRunning = false;
  }

  async captureScreenshot(): Promise<CapturedScreenshot | null> {
    try {
      const { logicalSize, id: primaryDisplayId } = getScreenSize();

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.round(logicalSize.width),
          height: Math.round(logicalSize.height),
        },
      });

      const primarySource =
        sources.find(
          (source) => source.display_id === primaryDisplayId.toString(),
        ) || sources[0];

      if (!primarySource) {
        logger.error('ScreenshotCaptureService: No display source found');
        return null;
      }

      const screenshot = primarySource.thumbnail;

      // Resize to reduce file size (50% for daily report)
      const scaledWidth = Math.round(logicalSize.width * 0.5);
      const scaledHeight = Math.round(logicalSize.height * 0.5);
      const resized = screenshot.resize({
        width: scaledWidth,
        height: scaledHeight,
      });

      // Convert to JPEG with medium quality
      const jpegBuffer = resized.toJPEG(60);

      // Generate file path
      const timestamp = Date.now();
      const date = this.getDateString(timestamp);
      const id = uuidv4();
      const filename = `${date}_${timestamp}_${id}.jpg`;
      const filePath = path.join(this.screenshotDir, filename);

      // Save to disk
      fs.writeFileSync(filePath, new Uint8Array(jpegBuffer));

      const captured: CapturedScreenshot = {
        id,
        filePath,
        timestamp,
        date,
      };

      this.capturedScreenshots.push(captured);
      logger.log(`ScreenshotCaptureService: Captured screenshot ${filename}`);

      return captured;
    } catch (error) {
      logger.error(
        'ScreenshotCaptureService: Failed to capture screenshot',
        error,
      );
      return null;
    }
  }

  private getDateString(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  }

  getScreenshotsByDate(date: string): CapturedScreenshot[] {
    return this.capturedScreenshots.filter((s) => s.date === date);
  }

  getAllScreenshots(): CapturedScreenshot[] {
    return [...this.capturedScreenshots];
  }

  loadScreenshotsFromDisk(): void {
    try {
      if (!fs.existsSync(this.screenshotDir)) {
        return;
      }

      const files = fs.readdirSync(this.screenshotDir);
      this.capturedScreenshots = [];

      for (const file of files) {
        if (!file.endsWith('.jpg')) {
          continue;
        }

        // Parse filename: YYYY-MM-DD_timestamp_id.jpg
        const parts = file.replace('.jpg', '').split('_');
        if (parts.length < 3) {
          continue;
        }

        const date = parts[0];
        const timestamp = parseInt(parts[1], 10);
        const id = parts.slice(2).join('_');

        this.capturedScreenshots.push({
          id,
          filePath: path.join(this.screenshotDir, file),
          timestamp,
          date,
        });
      }

      logger.log(
        `ScreenshotCaptureService: Loaded ${this.capturedScreenshots.length} screenshots from disk`,
      );
    } catch (error) {
      logger.error(
        'ScreenshotCaptureService: Failed to load screenshots from disk',
        error,
      );
    }
  }

  cleanupOldScreenshots(retentionDays: number): void {
    try {
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      const toDelete = this.capturedScreenshots.filter(
        (s) => s.timestamp < cutoffTime,
      );

      for (const screenshot of toDelete) {
        if (fs.existsSync(screenshot.filePath)) {
          fs.unlinkSync(screenshot.filePath);
          logger.log(
            `ScreenshotCaptureService: Deleted old screenshot ${screenshot.filePath}`,
          );
        }
      }

      this.capturedScreenshots = this.capturedScreenshots.filter(
        (s) => s.timestamp >= cutoffTime,
      );

      logger.log(
        `ScreenshotCaptureService: Cleaned up ${toDelete.length} old screenshots`,
      );
    } catch (error) {
      logger.error(
        'ScreenshotCaptureService: Failed to cleanup old screenshots',
        error,
      );
    }
  }

  getScreenshotAsBase64(filePath: string): string | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const buffer = fs.readFileSync(filePath);
      return buffer.toString('base64');
    } catch (error) {
      logger.error(
        'ScreenshotCaptureService: Failed to read screenshot as base64',
        error,
      );
      return null;
    }
  }

  deleteScreenshotsByIds(ids: string[]): {
    success: boolean;
    deletedCount: number;
    errors: string[];
  } {
    const errors: string[] = [];
    let deletedCount = 0;

    for (const id of ids) {
      const screenshot = this.capturedScreenshots.find((s) => s.id === id);
      if (!screenshot) {
        errors.push(`Screenshot with id ${id} not found`);
        continue;
      }

      try {
        if (fs.existsSync(screenshot.filePath)) {
          fs.unlinkSync(screenshot.filePath);
          logger.log(
            `ScreenshotCaptureService: Deleted screenshot file ${screenshot.filePath}`,
          );
        }
        deletedCount++;
      } catch (error) {
        errors.push(
          `Failed to delete ${screenshot.filePath}: ${String(error)}`,
        );
        logger.error(
          'ScreenshotCaptureService: Failed to delete screenshot',
          error,
        );
      }
    }

    // 从内存列表中移除
    this.capturedScreenshots = this.capturedScreenshots.filter(
      (s) => !ids.includes(s.id),
    );

    logger.log(
      `ScreenshotCaptureService: Deleted ${deletedCount} screenshots, ${errors.length} errors`,
    );
    return { success: errors.length === 0, deletedCount, errors };
  }

  isCapturing(): boolean {
    return this.isRunning;
  }
}
