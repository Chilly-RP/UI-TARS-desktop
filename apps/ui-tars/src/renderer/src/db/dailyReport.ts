/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { get, set, del, entries, createStore } from 'idb-keyval';

import { DailyReport } from '@main/store/types';

// Use a dedicated database for daily reports to avoid IndexedDB version conflicts
const dailyReportStore = createStore('ui_tars_daily_reports_db', 'daily_reports');

// Daily Report Manager class
export class DailyReportManager {
  // Save a daily report
  async saveReport(report: DailyReport): Promise<void> {
    // Use date as the key for easy lookup
    await set(report.date, report, dailyReportStore);
  }

  // Get a report by date
  async getReportByDate(date: string): Promise<DailyReport | null | undefined> {
    return await get(date, dailyReportStore);
  }

  // Get all reports
  async getAllReports(): Promise<DailyReport[]> {
    const items = await entries(dailyReportStore);
    const reports = items.map(([_, value]) => value as DailyReport);
    // Sort by date descending (newest first)
    return reports.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }

  // Get reports for a date range
  async getReportsInRange(
    startDate: string,
    endDate: string,
  ): Promise<DailyReport[]> {
    const allReports = await this.getAllReports();
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return allReports.filter((report) => {
      const reportDate = new Date(report.date).getTime();
      return reportDate >= start && reportDate <= end;
    });
  }

  // Delete a report by date
  async deleteReport(date: string): Promise<boolean> {
    const report = await this.getReportByDate(date);
    if (!report) return false;

    await del(date, dailyReportStore);
    return true;
  }

  // Delete old reports based on retention days
  async cleanupOldReports(retentionDays: number): Promise<number> {
    const allReports = await this.getAllReports();
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const report of allReports) {
      const reportTime = new Date(report.date).getTime();
      if (reportTime < cutoffTime) {
        await del(report.date, dailyReportStore);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  // Get the most recent report
  async getLatestReport(): Promise<DailyReport | null> {
    const reports = await this.getAllReports();
    return reports.length > 0 ? reports[0] : null;
  }

  // Check if a report exists for a date
  async hasReportForDate(date: string): Promise<boolean> {
    const report = await this.getReportByDate(date);
    return report !== null && report !== undefined;
  }
}

// Export singleton instance
export const dailyReportManager = new DailyReportManager();
