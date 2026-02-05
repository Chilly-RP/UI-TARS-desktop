/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { initIpc } from '@ui-tars/electron-ipc/main';

import { logger } from '@main/logger';
import { DailyReportService } from '@main/services/dailyReport';
import { DailyReportStore } from '@main/store/dailyReportStore';
import { DailyReportSettings } from '@main/store/types';

const t = initIpc.create();

export const dailyReportRoute = t.router({
  // Get current settings
  getDailyReportSettings: t.procedure.input<void>().handle(async () => {
    return DailyReportStore.getSettings();
  }),

  // Update settings
  updateDailyReportSettings: t.procedure
    .input<Partial<DailyReportSettings>>()
    .handle(async ({ input }) => {
      try {
        await DailyReportService.getInstance().updateSettings(input);
        return { success: true };
      } catch (error) {
        logger.error('dailyReportRoute: Failed to update settings', error);
        return { success: false, error: String(error) };
      }
    }),

  // Enable/disable daily report
  setDailyReportEnabled: t.procedure
    .input<{ enabled: boolean }>()
    .handle(async ({ input }) => {
      try {
        await DailyReportService.getInstance().setEnabled(input.enabled);
        return { success: true };
      } catch (error) {
        logger.error('dailyReportRoute: Failed to set enabled', error);
        return { success: false, error: String(error) };
      }
    }),

  // Generate report for a specific date
  generateDailyReport: t.procedure
    .input<{ date?: string }>()
    .handle(async ({ input }) => {
      try {
        logger.log(
          'dailyReportRoute: Starting report generation for',
          input.date,
        );
        const report = await DailyReportService.getInstance().generateReport(
          input.date,
        );
        logger.log(
          'dailyReportRoute: Report generated',
          report ? 'success' : 'null',
        );
        if (report) {
          logger.log(
            'dailyReportRoute: Report has',
            report.appUsage?.length,
            'apps,',
            report.activities?.length,
            'activities',
          );
          // Log the report structure to debug serialization
          logger.log(
            'dailyReportRoute: Report JSON test:',
            JSON.stringify(report).substring(0, 500),
          );
        }
        const result = { success: true, report };
        logger.log(
          'dailyReportRoute: Returning result, success:',
          result.success,
          'hasReport:',
          !!result.report,
        );
        return result;
      } catch (error) {
        logger.error('dailyReportRoute: Failed to generate report', error);
        const errorResult = {
          success: false,
          error: String(error),
          report: null,
        };
        logger.log('dailyReportRoute: Returning error result');
        return errorResult;
      }
    }),

  // Get service status
  getDailyReportStatus: t.procedure.input<void>().handle(async () => {
    return DailyReportService.getInstance().getStatus();
  }),

  // Trigger notification manually (for testing)
  triggerDailyReportNotification: t.procedure.input<void>().handle(async () => {
    try {
      DailyReportService.getInstance().triggerNotification();
      return { success: true };
    } catch (error) {
      logger.error('dailyReportRoute: Failed to trigger notification', error);
      return { success: false, error: String(error) };
    }
  }),

  // Get app usage records for a date
  getAppUsageRecords: t.procedure
    .input<{ date: string }>()
    .handle(async ({ input }) => {
      return DailyReportStore.getAppUsageRecordsByDate(input.date);
    }),

  // Get screenshots for a date
  getScreenshotsForDate: t.procedure
    .input<{ date: string }>()
    .handle(async ({ input }) => {
      return DailyReportService.getInstance().getScreenshotsForDate(input.date);
    }),

  // Add agent interaction (called from agent runner)
  addAgentInteraction: t.procedure
    .input<{ instruction: string; status: string; timestamp: number }>()
    .handle(async ({ input }) => {
      DailyReportService.getInstance().addAgentInteraction({
        instruction: input.instruction,
        status: input.status,
        timestamp: input.timestamp,
      });
      return { success: true };
    }),
});
