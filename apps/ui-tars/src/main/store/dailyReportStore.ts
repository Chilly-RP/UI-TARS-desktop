/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import ElectronStore from 'electron-store';
import { BrowserWindow } from 'electron';

import { logger } from '@main/logger';

import {
  DailyReportSettings,
  AppUsageRecord,
  DEFAULT_DAILY_REPORT_SETTINGS,
} from './types';

interface DailyReportStoreData {
  settings: DailyReportSettings;
  appUsageRecords: AppUsageRecord[];
  lastReportDate: string | null;
  currentSessionStart: number | null;
}

const DEFAULT_STORE_DATA: DailyReportStoreData = {
  settings: DEFAULT_DAILY_REPORT_SETTINGS,
  appUsageRecords: [],
  lastReportDate: null,
  currentSessionStart: null,
};

export class DailyReportStore {
  private static instance: ElectronStore<DailyReportStoreData>;

  public static getInstance(): ElectronStore<DailyReportStoreData> {
    if (!DailyReportStore.instance) {
      DailyReportStore.instance = new ElectronStore<DailyReportStoreData>({
        name: 'ui_tars.daily_report',
        defaults: DEFAULT_STORE_DATA,
      });

      DailyReportStore.instance.onDidAnyChange((newValue, _oldValue) => {
        logger.log(`DailyReportStore: settings changed`);
        // Notify renderers when settings change
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send(
            'daily-report-settings-updated',
            newValue?.settings,
          );
        });
      });
    }
    return DailyReportStore.instance;
  }

  // Settings methods
  public static getSettings(): DailyReportSettings {
    return DailyReportStore.getInstance().get(
      'settings',
      DEFAULT_DAILY_REPORT_SETTINGS,
    );
  }

  public static setSettings(settings: DailyReportSettings): void {
    DailyReportStore.getInstance().set('settings', settings);
  }

  public static updateSettings(partial: Partial<DailyReportSettings>): void {
    const current = DailyReportStore.getSettings();
    DailyReportStore.setSettings({ ...current, ...partial });
  }

  // App usage records methods
  public static getAppUsageRecords(): AppUsageRecord[] {
    return DailyReportStore.getInstance().get('appUsageRecords', []);
  }

  public static addAppUsageRecord(record: AppUsageRecord): void {
    const records = DailyReportStore.getAppUsageRecords();
    records.push(record);
    DailyReportStore.getInstance().set('appUsageRecords', records);
  }

  public static getAppUsageRecordsByDate(date: string): AppUsageRecord[] {
    const records = DailyReportStore.getAppUsageRecords();
    return records.filter((r) => r.date === date);
  }

  public static clearAppUsageRecords(): void {
    DailyReportStore.getInstance().set('appUsageRecords', []);
  }

  public static cleanupOldRecords(retentionDays: number): void {
    const records = DailyReportStore.getAppUsageRecords();
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const filteredRecords = records.filter((r) => r.startTime >= cutoffTime);
    DailyReportStore.getInstance().set('appUsageRecords', filteredRecords);
  }

  // Last report date
  public static getLastReportDate(): string | null {
    return DailyReportStore.getInstance().get('lastReportDate', null);
  }

  public static setLastReportDate(date: string): void {
    DailyReportStore.getInstance().set('lastReportDate', date);
  }

  // Session tracking
  public static getCurrentSessionStart(): number | null {
    return DailyReportStore.getInstance().get('currentSessionStart', null);
  }

  public static setCurrentSessionStart(timestamp: number | null): void {
    DailyReportStore.getInstance().set('currentSessionStart', timestamp);
  }

  // Reset
  public static reset(): void {
    DailyReportStore.getInstance().set(DEFAULT_STORE_DATA);
  }
}
