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
  TerminalActivityContext,
  DeepInsights,
  StructuredSummary,
} from '@main/store/types';
import { BatchAnalysisResult, ScreenshotAnalysis } from './vlmAnalyzer';
import { InsightAnalyzer } from './insightAnalyzer';
import { getLocalDateString } from './dateUtils';

export class ReportGenerator {
  private insightAnalyzer = new InsightAnalyzer();

  /**
   * Generate a daily report for a specific date
   */
  generateReport(
    date: string,
    vlmAnalysisResults: BatchAnalysisResult[],
    agentInteractions: AgentInteraction[],
    terminalContext?: TerminalActivityContext,
    insights?: DeepInsights,
    refinedNarrative?: string,
    refinedAccomplishments?: string[],
    refinedBlockers?: string[],
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

    // Clamp records to the target date to handle legacy data stored with UTC dates
    const clampedRecords = filteredRecords.map((r) =>
      this.clampRecordToDate(r, date),
    );

    // Calculate app usage summary
    const appUsage = this.calculateAppUsage(clampedRecords);

    // Calculate total screen time
    const totalScreenTime = clampedRecords.reduce(
      (sum, record) => sum + record.duration,
      0,
    );

    // Compute deep insights if not provided
    const deepInsights = insights || this.insightAnalyzer.analyze(clampedRecords);

    // Enrich deep work sessions with VLM output context
    this.enrichDeepWorkSessions(deepInsights, vlmAnalysisResults);

    // Convert VLM analysis to activities
    const activities = this.convertToActivities(vlmAnalysisResults);

    // Generate overall summary (enhanced with insights)
    const summary = this.generateSummary(
      appUsage,
      totalScreenTime,
      activities,
      agentInteractions,
      terminalContext,
      deepInsights,
    );

    // Generate structured summary from VLM results + insights
    const structuredSummary = this.generateStructuredSummary(
      vlmAnalysisResults,
      deepInsights,
      totalScreenTime,
      refinedNarrative,
      refinedAccomplishments,
      refinedBlockers,
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
      insights: deepInsights,
      structuredSummary,
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
    terminalContext?: TerminalActivityContext,
    insights?: DeepInsights,
  ): string {
    const hours = Math.floor(totalScreenTime / (1000 * 60 * 60));
    const minutes = Math.floor(
      (totalScreenTime % (1000 * 60 * 60)) / (1000 * 60),
    );

    const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    // Build summary parts
    const parts: string[] = [];

    // Enhanced screen time with deep work info
    if (insights && insights.focusMetrics.totalDeepWorkMs > 0) {
      const deepMinutes = Math.floor(insights.focusMetrics.totalDeepWorkMs / (1000 * 60));
      const deepRatio = Math.round(insights.focusMetrics.deepWorkRatio * 100);
      parts.push(`总屏幕时间：${timeStr}（深度工作 ${deepMinutes}m，占比 ${deepRatio}%）`);
    } else {
      parts.push(`总屏幕时间：${timeStr}`);
    }

    // Projects instead of top apps
    if (insights && insights.projects.length > 0) {
      const topProjects = insights.projects
        .filter((p) => p.projectName !== '其他')
        .slice(0, 3);
      if (topProjects.length > 0) {
        const projectStrs = topProjects.map((p) => {
          const mins = Math.floor(p.totalDuration / (1000 * 60));
          return `${p.projectName}（${mins}m）`;
        });
        parts.push(`主要项目：${projectStrs.join('、')}`);
      }
    }

    // Fallback to top apps if no projects
    if (!insights || insights.projects.filter((p) => p.projectName !== '其他').length === 0) {
      const topApps = appUsage.slice(0, 3).map((a) => a.appName);
      if (topApps.length > 0) {
        parts.push(`最常用应用：${topApps.join('、')}`);
      }
    }

    // Get unique topics from activities
    const allTopics = new Set<string>();
    for (const activity of activities) {
      for (const topic of activity.topics) {
        allTopics.add(topic);
      }
    }
    const topicsList = Array.from(allTopics).slice(0, 5);
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

    const terminalPart = this.buildTerminalSummaryPart(terminalContext);
    if (terminalPart) {
      parts.push(terminalPart);
    }

    // Efficiency hints from insights
    if (insights) {
      const topDistraction = insights.focusMetrics.distractionSources[0];
      if (topDistraction && topDistraction.interruptions >= 2) {
        parts.push(
          `效率提示：${topDistraction.appName} 打断了 ${topDistraction.interruptions} 次深度工作`,
        );
      }
    }

    return parts.join('。') + '。';
  }

  /**
   * Generate structured summary from VLM results + computed insights
   */
  private generateStructuredSummary(
    vlmResults: BatchAnalysisResult[],
    insights: DeepInsights,
    totalScreenTime: number,
    refinedNarrative?: string,
    refinedAccomplishments?: string[],
    refinedBlockers?: string[],
  ): StructuredSummary {
    // Use refined narrative from LLM, fall back to bigram-dedup merge
    const narrative = refinedNarrative || this.mergeNarratives(vlmResults);

    // Use refined accomplishments from LLM, fall back to raw collect + dedup
    let keyAccomplishments: string[];
    if (refinedAccomplishments) {
      keyAccomplishments = refinedAccomplishments;
    } else {
      const raw: string[] = [];
      for (const result of vlmResults) {
        if (result.keyAccomplishments) {
          raw.push(...result.keyAccomplishments);
        }
      }
      keyAccomplishments = [...new Set(raw)];
    }

    // Use refined blockers from LLM, fall back to raw collect + dedup
    let blockers: string[];
    if (refinedBlockers) {
      blockers = [...refinedBlockers];
    } else {
      blockers = [];
      for (const result of vlmResults) {
        if (result.blockers) {
          blockers.push(...result.blockers);
        }
      }
      blockers = [...new Set(blockers)];
    }
    // Always append frustration signals
    for (const signal of insights.focusMetrics.frustrationSignals) {
      if (signal.type === 'rapid_switch') continue;
      blockers.push(`${signal.description}（${signal.timeRange}）`);
    }

    // Generate efficiency highlights from metrics
    const efficiencyHighlights: string[] = [];
    const { focusMetrics } = insights;

    if (focusMetrics.deepWorkRatio > 0) {
      const deepMinutes = Math.floor(focusMetrics.totalDeepWorkMs / (1000 * 60));
      const ratio = Math.round(focusMetrics.deepWorkRatio * 100);
      efficiencyHighlights.push(
        `今日深度工作 ${deepMinutes} 分钟，占屏幕时间 ${ratio}%`,
      );
    }

    if (focusMetrics.deepWorkRatio < 0.3 && totalScreenTime > 30 * 60 * 1000) {
      efficiencyHighlights.push('深度工作时间偏低，建议减少应用切换');
    }

    for (const source of focusMetrics.distractionSources) {
      if (source.interruptions >= 2) {
        efficiencyHighlights.push(
          `${source.appName} 今日打断了 ${source.interruptions} 次深度工作`,
        );
      }
    }

    if (focusMetrics.contextSwitchesPerHour > 30) {
      efficiencyHighlights.push(
        `每小时应用切换 ${focusMetrics.contextSwitchesPerHour} 次，频率较高`,
      );
    }

    if (focusMetrics.deepWorkSessions.length > 0) {
      const longestSession = focusMetrics.deepWorkSessions.reduce((a, b) =>
        a.duration > b.duration ? a : b,
      );
      const longestMin = Math.floor(longestSession.duration / (1000 * 60));
      efficiencyHighlights.push(
        `最长深度工作段 ${longestMin} 分钟（${longestSession.primaryApp}）`,
      );
    }

    // Generate suggestions
    const suggestions: string[] = [];
    const topProject = insights.projects.find((p) => p.projectName !== '其他');
    if (topProject) {
      suggestions.push(`继续推进 ${topProject.projectName} 项目`);
    }
    if (blockers.length > 0) {
      suggestions.push('排查今日遇到的技术阻塞');
    }
    if (focusMetrics.deepWorkRatio < 0.3 && totalScreenTime > 30 * 60 * 1000) {
      suggestions.push('尝试使用番茄工作法提升专注度');
    }

    // Milestones from longest deep work sessions + VLM accomplishments
    const milestones = this.generateMilestones(insights, vlmResults);

    // Attention drain from top switch pairs
    const attentionDrain = this.generateAttentionDrain(insights);

    return {
      narrative,
      keyAccomplishments: [...new Set(keyAccomplishments)],
      blockers: [...new Set(blockers)],
      efficiencyHighlights,
      suggestions,
      milestones: milestones.length > 0 ? milestones : undefined,
      attentionDrain: attentionDrain.length > 0 ? attentionDrain : undefined,
    };
  }

  /**
   * Merge narrative summaries from multiple VLM batches, removing duplicate sentences
   */
  private mergeNarratives(vlmResults: BatchAnalysisResult[]): string {
    const parts = vlmResults
      .map((r) => r.summary)
      .filter((s) => s && s !== '已记录活动（分析不可用）');

    if (parts.length === 0) return '今日活动数据已记录。';
    if (parts.length === 1) return parts[0];

    // Split all summaries into sentences
    const allSentences: string[] = [];
    for (const part of parts) {
      const sentences = part.split(/[。！？]/).filter((s) => s.trim().length > 0);
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        // Check if this sentence is too similar to any existing one
        const isDuplicate = allSentences.some(
          (existing) => this.stringSimilarity(existing, trimmed) > 0.7,
        );
        if (!isDuplicate) {
          allSentences.push(trimmed);
        }
      }
    }

    return allSentences.join('。') + '。';
  }

  /**
   * Calculate bigram-based string similarity (Jaccard coefficient)
   */
  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const bigramsA = new Set<string>();
    for (let i = 0; i < a.length - 1; i++) {
      bigramsA.add(a.substring(i, i + 2));
    }

    const bigramsB = new Set<string>();
    for (let i = 0; i < b.length - 1; i++) {
      bigramsB.add(b.substring(i, i + 2));
    }

    let intersection = 0;
    for (const bigram of bigramsA) {
      if (bigramsB.has(bigram)) intersection++;
    }

    const union = bigramsA.size + bigramsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Enrich deep work sessions with VLM output context (keyOutput, filesWorkedOn)
   */
  private enrichDeepWorkSessions(
    insights: DeepInsights,
    vlmResults: BatchAnalysisResult[],
  ): void {
    // Collect all screenshot analyses with timestamps
    const allAnalyses: ScreenshotAnalysis[] = [];
    for (const result of vlmResults) {
      allAnalyses.push(...result.analyses);
    }

    for (const session of insights.focusMetrics.deepWorkSessions) {
      // Find analyses that overlap with this deep work session
      const overlapping = allAnalyses.filter(
        (a) => a.timestamp >= session.startTime && a.timestamp <= session.endTime,
      );

      if (overlapping.length === 0) continue;

      // Extract files worked on (match common source file extensions)
      const files = new Set<string>();
      for (const analysis of overlapping) {
        const fileMatches = analysis.summary.match(/[\w./-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|cpp|c|h|css|html|vue|svelte|rb|swift|kt)/g);
        if (fileMatches) {
          for (const f of fileMatches) files.add(f);
        }
      }

      // Pick the most descriptive activity as keyOutput
      const bestAnalysis = overlapping.reduce((a, b) =>
        a.summary.length > b.summary.length ? a : b,
      );

      session.keyOutput = bestAnalysis.summary;
      if (files.size > 0) {
        session.filesWorkedOn = Array.from(files).slice(0, 5);
      }
    }
  }

  /**
   * Generate milestones from deep work sessions + VLM accomplishments
   */
  private generateMilestones(
    insights: DeepInsights,
    vlmResults: BatchAnalysisResult[],
  ): string[] {
    const milestones: string[] = [];
    const sessions = [...insights.focusMetrics.deepWorkSessions]
      .sort((a, b) => b.duration - a.duration);

    for (const session of sessions.slice(0, 3)) {
      const startStr = new Date(session.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const endStr = new Date(session.endTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const mins = Math.floor(session.duration / (1000 * 60));

      // Find VLM accomplishments that overlap with this session
      let accomplishment = '';
      for (const result of vlmResults) {
        if (!result.keyAccomplishments || result.keyAccomplishments.length === 0) continue;
        // Check if any analysis in this batch overlaps with the session
        const hasOverlap = result.analyses.some(
          (a) => a.timestamp >= session.startTime && a.timestamp <= session.endTime,
        );
        if (hasOverlap) {
          accomplishment = result.keyAccomplishments[0];
          break;
        }
      }

      if (accomplishment) {
        milestones.push(`${startStr}-${endStr} 的 ${mins}m 深度工作中完成：${accomplishment}`);
      } else if (session.keyOutput) {
        milestones.push(`${startStr}-${endStr} 的 ${mins}m 深度工作：${session.keyOutput}`);
      }
    }

    return milestones;
  }

  /**
   * Generate attention drain insights from top switch pairs
   */
  private generateAttentionDrain(
    insights: DeepInsights,
  ): { topSwitchPair: string; switchCount: number; suggestion: string }[] {
    const topPairs = insights.focusMetrics.topSwitchPairs;
    if (!topPairs) return [];

    return topPairs
      .filter((p) => p.count >= 5)
      .map((p) => ({
        topSwitchPair: p.pair,
        switchCount: p.count,
        suggestion: `减少 ${p.pair} 之间的切换，考虑分时段集中处理`,
      }));
  }

  /**
   * Build terminal activity summary text from terminal context.
   * Always merges both windowTitle and shellHistory commands regardless of timestamp availability.
   * Includes representative examples for top commands.
   */
  private buildTerminalSummaryPart(
    context?: TerminalActivityContext,
  ): string | null {
    if (!context) {
      return null;
    }

    // Merge commands from both sources, dedup by baseCommand
    const merged = new Map<string, { count: number; examples: string[] }>();
    const allSources = [...context.windowTitleCommands, ...context.shellHistoryCommands];
    for (const cmd of allSources) {
      const existing = merged.get(cmd.baseCommand);
      if (existing) {
        existing.count += cmd.count;
        for (const ex of cmd.examples) {
          if (existing.examples.length < 2 && !existing.examples.includes(ex)) {
            existing.examples.push(ex);
          }
        }
      } else {
        merged.set(cmd.baseCommand, { count: cmd.count, examples: cmd.examples.slice(0, 2) });
      }
    }

    if (merged.size === 0) {
      return null;
    }

    const topEntries = Array.from(merged.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);

    const parts = topEntries.map(([cmd, { count, examples }]) => {
      // If the example is just the base command itself, only show count
      const meaningfulExamples = examples.filter((ex) => ex.trim() !== cmd);
      if (meaningfulExamples.length > 0) {
        return `${cmd}(${count}次, 如: ${meaningfulExamples[0]})`;
      }
      return `${cmd}(${count}次)`;
    });

    return `终端活动：${parts.join('、')}`;
  }

  /**
   * Get the current date string in YYYY-MM-DD format (local timezone)
   */
  getCurrentDateString(): string {
    return getLocalDateString(Date.now());
  }

  /**
   * Clamp a record's duration to only count time within the specified local date.
   * This handles legacy data that may have been stored with UTC-based date strings.
   */
  private clampRecordToDate(
    record: AppUsageRecord,
    date: string,
  ): AppUsageRecord {
    const [year, month, day] = date.split('-').map(Number);
    const dayStart = new Date(year, month - 1, day).getTime();
    const dayEnd = new Date(year, month - 1, day + 1).getTime();

    const clampedStart = Math.max(record.startTime, dayStart);
    const clampedEnd = Math.min(record.endTime, dayEnd);
    const clampedDuration = Math.max(0, clampedEnd - clampedStart);

    return { ...record, duration: clampedDuration };
  }

  /**
   * Check data sufficiency for report generation, returning structured stats
   */
  checkDataSufficiency(date: string): {
    hasEnough: boolean;
    totalDurationMs: number;
    requiredDurationMs: number;
    recordCount: number;
  } {
    const records = DailyReportStore.getAppUsageRecordsByDate(date);
    const totalDurationMs = records.reduce((sum, r) => sum + r.duration, 0);
    const requiredDurationMs = 5 * 60 * 1000;
    return {
      hasEnough: totalDurationMs >= requiredDurationMs,
      totalDurationMs,
      requiredDurationMs,
      recordCount: records.length,
    };
  }

  /**
   * Check if enough data exists to generate a report
   */
  hasEnoughData(date: string): boolean {
    return this.checkDataSufficiency(date).hasEnough;
  }
}
