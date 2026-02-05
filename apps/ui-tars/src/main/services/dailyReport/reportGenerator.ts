/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { v4 as uuidv4 } from 'uuid';

import { logger } from '@main/logger';
import { DailyReportStore } from '@main/store/dailyReportStore';
import {
  DailyReport,
  AppUsageSummary,
  ActivitySummary,
  AgentInteraction,
  AppUsageRecord,
} from '@main/store/types';
import { BatchAnalysisResult } from './vlmAnalyzer';

export class ReportGenerator {
  /**
   * Generate a daily report for a specific date
   */
  generateReport(
    date: string,
    vlmAnalysisResults: BatchAnalysisResult[],
    agentInteractions: AgentInteraction[],
  ): DailyReport {
    logger.log(`ReportGenerator: Generating report for ${date}`);

    // Get app usage records for the date
    const appUsageRecords = DailyReportStore.getAppUsageRecordsByDate(date);

    // Filter out excluded apps from settings
    const settings = DailyReportStore.getSettings();
    const filteredRecords = appUsageRecords.filter(
      (record) => !settings.excludedApps.includes(record.appName),
    );

    logger.log(
      `ReportGenerator: Filtered ${appUsageRecords.length - filteredRecords.length} excluded apps from ${appUsageRecords.length} total records`,
    );

    // Calculate app usage summary
    const appUsage = this.calculateAppUsage(filteredRecords);

    // Calculate total screen time
    const totalScreenTime = filteredRecords.reduce(
      (sum, record) => sum + record.duration,
      0,
    );

    // Convert VLM analysis to activities
    const activities = this.convertToActivities(vlmAnalysisResults);

    // Generate overall summary
    const summary = this.generateSummary(
      appUsage,
      totalScreenTime,
      activities,
      agentInteractions,
    );

    const report: DailyReport = {
      id: uuidv4(),
      date,
      totalScreenTime,
      appUsage,
      activities,
      agentInteractions,
      summary,
      generatedAt: Date.now(),
    };

    logger.log(
      `ReportGenerator: Report generated with ${appUsage.length} apps tracked`,
    );
    return report;
  }

  /**
   * Calculate app usage summary from records
   */
  private calculateAppUsage(records: AppUsageRecord[]): AppUsageSummary[] {
    const usageMap = new Map<string, number>();

    for (const record of records) {
      const current = usageMap.get(record.appName) || 0;
      usageMap.set(record.appName, current + record.duration);
    }

    const totalDuration = Array.from(usageMap.values()).reduce(
      (sum, d) => sum + d,
      0,
    );

    const appUsage: AppUsageSummary[] = Array.from(usageMap.entries())
      .map(([appName, duration]) => ({
        appName,
        duration,
        percentage:
          totalDuration > 0 ? Math.round((duration / totalDuration) * 100) : 0,
      }))
      .sort((a, b) => b.duration - a.duration);

    return appUsage;
  }

  /**
   * Convert VLM analysis results to activity summaries
   */
  private convertToActivities(
    vlmResults: BatchAnalysisResult[],
  ): ActivitySummary[] {
    return vlmResults.map((result) => ({
      timeRange: result.timeRange,
      summary: result.summary,
      topics: result.topics,
    }));
  }

  /**
   * Generate an overall summary of the day
   */
  private generateSummary(
    appUsage: AppUsageSummary[],
    totalScreenTime: number,
    activities: ActivitySummary[],
    agentInteractions: AgentInteraction[],
  ): string {
    const hours = Math.floor(totalScreenTime / (1000 * 60 * 60));
    const minutes = Math.floor(
      (totalScreenTime % (1000 * 60 * 60)) / (1000 * 60),
    );

    const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    // Get top 3 apps
    const topApps = appUsage.slice(0, 3).map((a) => a.appName);

    // Get unique topics from activities
    const allTopics = new Set<string>();
    for (const activity of activities) {
      for (const topic of activity.topics) {
        allTopics.add(topic);
      }
    }
    const topicsList = Array.from(allTopics).slice(0, 5);

    // Build summary parts
    const parts: string[] = [];

    parts.push(`总屏幕时间：${timeStr}`);

    if (topApps.length > 0) {
      parts.push(`最常用应用：${topApps.join('、')}`);
    }

    if (topicsList.length > 0) {
      parts.push(`主要话题：${topicsList.join('、')}`);
    }

    if (agentInteractions.length > 0) {
      const completedTasks = agentInteractions.filter(
        (i) => i.status === 'completed',
      ).length;
      parts.push(
        `智能体交互：${agentInteractions.length} 次（${completedTasks} 次已完成）`,
      );
    }

    return parts.join('。') + '。';
  }

  /**
   * Get the current date string in YYYY-MM-DD format
   */
  getCurrentDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Check if enough data exists to generate a report
   */
  hasEnoughData(date: string): boolean {
    const records = DailyReportStore.getAppUsageRecordsByDate(date);
    // Require at least 5 minutes of tracked app usage
    const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);
    return totalDuration >= 5 * 60 * 1000;
  }
}
