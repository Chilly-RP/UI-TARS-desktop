/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  AppUsageRecord,
  DeepInsights,
  ProjectContext,
  FocusMetrics,
  DeepWorkSession,
  FrustrationSignal,
} from '@main/store/types';

// App category mapping for flow state detection
const WORK_DEV_APPS = new Set([
  'Code',
  'Visual Studio Code',
  'Cursor',
  'WebStorm',
  'IntelliJ IDEA',
  'PyCharm',
  'Xcode',
  'Android Studio',
  'Sublime Text',
  'Atom',
  'Nova',
  'Zed',
  'vim',
  'nvim',
  'neovim',
  'Emacs',
]);

const TERMINAL_APPS = new Set([
  'Terminal',
  'iTerm2',
  'iTerm',
  'Hyper',
  'Alacritty',
  'kitty',
  'Warp',
  'WezTerm',
  'Tabby',
]);

const COMMUNICATION_APPS = new Set([
  'Slack',
  'WeChat',
  'wechat',
  '微信',
  '飞书',
  'Lark',
  'DingTalk',
  '钉钉',
  'Telegram',
  'Discord',
  'Messages',
  'Mail',
  'Outlook',
  'Teams',
  'Microsoft Teams',
  'Zoom',
]);

const PRODUCTIVITY_APPS = new Set([
  'OneNote',
  'Microsoft OneNote',
  'Notion',
  'Obsidian',
  'Bear',
  'Logseq',
  'Joplin',
  'Typora',
  'Ulysses',
  'Craft',
  'Notes',
  '备忘录',
  'Evernote',
  'Figma',
  'Sketch',
  'Linear',
  'Jira',
  'Trello',
  'Miro',
]);

const BROWSER_APPS = new Set([
  'Google Chrome',
  'Safari',
  'Firefox',
  'Arc',
  'Brave Browser',
  'Microsoft Edge',
  'Opera',
  'Chromium',
]);

const SEARCH_KEYWORDS = [
  'google.com/search',
  'bing.com/search',
  'baidu.com/s',
  'stackoverflow.com/search',
  'Search',
];

const ERROR_KEYWORDS = [
  'error',
  'failed',
  'cannot',
  'undefined',
  'not found',
  'exception',
  'crash',
  'fatal',
  'ENOENT',
  'EACCES',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
];

const DISTRACTION_TITLE_KEYWORDS = [
  'youtube.com',
  'bilibili.com',
  'twitter.com',
  'x.com',
  'weibo.com',
  'reddit.com',
  'tiktok.com',
  'douyin.com',
  'instagram.com',
  'facebook.com',
  'netflix.com',
  'twitch.tv',
];

type AppCategory = 'work_dev' | 'terminal' | 'communication' | 'browser' | 'distraction' | 'productivity' | 'other';

function classifyApp(appName: string, windowTitle: string): AppCategory {
  if (WORK_DEV_APPS.has(appName)) return 'work_dev';
  if (TERMINAL_APPS.has(appName)) return 'terminal';
  if (PRODUCTIVITY_APPS.has(appName)) return 'productivity';
  if (COMMUNICATION_APPS.has(appName)) return 'communication';

  if (BROWSER_APPS.has(appName)) {
    const lowerTitle = windowTitle.toLowerCase();
    for (const keyword of DISTRACTION_TITLE_KEYWORDS) {
      if (lowerTitle.includes(keyword)) return 'distraction';
    }
    // Browser with dev-related content counts as work
    if (
      lowerTitle.includes('github.com') ||
      lowerTitle.includes('stackoverflow.com') ||
      lowerTitle.includes('developer.') ||
      lowerTitle.includes('docs.') ||
      lowerTitle.includes('api.') ||
      lowerTitle.includes('localhost')
    ) {
      return 'work_dev';
    }
    return 'browser';
  }

  return 'other';
}

function isWorkCategory(cat: AppCategory): boolean {
  return cat === 'work_dev' || cat === 'terminal' || cat === 'productivity';
}

export class InsightAnalyzer {
  /**
   * Analyze app usage records to produce deep insights
   */
  analyze(records: AppUsageRecord[]): DeepInsights {
    const sorted = [...records].sort((a, b) => a.startTime - b.startTime);
    const projects = this.inferProjects(sorted);
    const focusMetrics = this.detectFocusMetrics(sorted);

    return { projects, focusMetrics };
  }

  /**
   * Infer project contexts from window titles
   */
  private inferProjects(records: AppUsageRecord[]): ProjectContext[] {
    const projectMap = new Map<string, { totalDuration: number; apps: Set<string>; subModules: Set<string> }>();

    for (const record of records) {
      const project = this.extractProjectName(record.appName, record.windowTitle);
      const subModule = this.extractSubModule(record.appName, record.windowTitle);
      const existing = projectMap.get(project);
      if (existing) {
        existing.totalDuration += record.duration;
        existing.apps.add(record.appName);
        if (subModule) existing.subModules.add(subModule);
      } else {
        const subModules = new Set<string>();
        if (subModule) subModules.add(subModule);
        projectMap.set(project, {
          totalDuration: record.duration,
          apps: new Set([record.appName]),
          subModules,
        });
      }
    }

    const totalDuration = records.reduce((sum, r) => sum + r.duration, 0);

    return Array.from(projectMap.entries())
      .map(([projectName, data]) => ({
        projectName,
        totalDuration: data.totalDuration,
        percentage: totalDuration > 0 ? Math.round((data.totalDuration / totalDuration) * 100) : 0,
        apps: Array.from(data.apps),
        subModules: data.subModules.size > 0 ? Array.from(data.subModules) : undefined,
      }))
      .sort((a, b) => b.totalDuration - a.totalDuration);
  }

  /**
   * Extract project name from app name + window title
   */
  private extractProjectName(appName: string, windowTitle: string): string {
    if (!windowTitle) return '其他';

    // IDE pattern: "file.ts - ProjectName — Visual Studio Code"
    // or "file.ts - ProjectName - Visual Studio Code"
    if (WORK_DEV_APPS.has(appName)) {
      // Try "— AppName" pattern first (em dash)
      const emDashMatch = windowTitle.match(/^(.+?)\s*—\s*.+$/);
      if (emDashMatch) {
        const beforeDash = emDashMatch[1].trim();
        // "file.ts - ProjectName" → extract ProjectName
        const parts = beforeDash.split(' - ');
        if (parts.length >= 2) {
          return parts[parts.length - 1].trim();
        }
        // Single part could be the project name itself
        return beforeDash;
      }

      // Try " - AppName" pattern (regular dash, common in some editors)
      const segments = windowTitle.split(' - ');
      if (segments.length >= 3) {
        // "file.ts - ProjectName - Editor"
        return segments[segments.length - 2].trim();
      }
      if (segments.length === 2) {
        // Could be "ProjectName - Editor" or "file.ts - Editor"
        const first = segments[0].trim();
        if (!first.includes('.') && !first.includes('/')) {
          return first;
        }
      }
    }

    // Terminal pattern: title contains ~/xxx or /Users/.../xxx
    if (TERMINAL_APPS.has(appName)) {
      const homeMatch = windowTitle.match(/~\/([^/\s]+)/);
      if (homeMatch) return homeMatch[1];

      const absMatch = windowTitle.match(/\/(?:Users|home)\/[^/]+\/([^/\s]+)/);
      if (absMatch) return absMatch[1];
    }

    // Browser pattern: github.com/org/repo
    if (BROWSER_APPS.has(appName)) {
      const ghMatch = windowTitle.match(/github\.com\/[^/]+\/([^/\s]+)/);
      if (ghMatch) return ghMatch[1].replace(/\s.*$/, '');

      const lowerTitle = windowTitle.toLowerCase();
      if (
        lowerTitle.includes('stackoverflow.com') ||
        lowerTitle.includes('google.com/search') ||
        lowerTitle.includes('bing.com/search') ||
        lowerTitle.includes('baidu.com')
      ) {
        return '搜索与学习';
      }
    }

    return '其他';
  }

  /**
   * Extract sub-module name from window title (file name for IDEs, subdirectory for terminals)
   */
  private extractSubModule(appName: string, windowTitle: string): string | null {
    if (!windowTitle) return null;

    // IDE pattern: "file.ts - ProjectName — VS Code" → extract file name without extension
    if (WORK_DEV_APPS.has(appName)) {
      const emDashMatch = windowTitle.match(/^(.+?)\s*—\s*.+$/);
      if (emDashMatch) {
        const beforeDash = emDashMatch[1].trim();
        const parts = beforeDash.split(' - ');
        if (parts.length >= 2) {
          // First part is the file path/name
          const filePart = parts[0].trim();
          // Extract directory from path like "src/services/dailyReport/insightAnalyzer.ts"
          const pathMatch = filePart.match(/(?:^|\/)([^/]+)\/[^/]+\.\w+$/);
          if (pathMatch) return pathMatch[1];
          // Just the filename without extension
          const fileMatch = filePart.match(/([^/]+)\.\w+$/);
          if (fileMatch) return fileMatch[1];
        }
      }
    }

    // Terminal pattern: ~/project/subdir → extract subdir
    if (TERMINAL_APPS.has(appName)) {
      const subDirMatch = windowTitle.match(/~\/[^/\s]+\/([^/\s]+)/);
      if (subDirMatch) return subDirMatch[1];

      const absSubMatch = windowTitle.match(/\/(?:Users|home)\/[^/]+\/[^/]+\/([^/\s]+)/);
      if (absSubMatch) return absSubMatch[1];
    }

    return null;
  }

  /**
   * Detect focus metrics: deep work sessions, context switches, distractions, frustration
   */
  private detectFocusMetrics(records: AppUsageRecord[]): FocusMetrics {
    if (records.length === 0) {
      return {
        deepWorkSessions: [],
        totalDeepWorkMs: 0,
        deepWorkRatio: 0,
        contextSwitchesPerHour: 0,
        distractionSources: [],
        frustrationSignals: [],
      };
    }

    const deepWorkSessions = this.detectDeepWorkSessions(records);
    const totalDeepWorkMs = deepWorkSessions.reduce((sum, s) => sum + s.duration, 0);
    const totalScreenTime = records.reduce((sum, r) => sum + r.duration, 0);
    const deepWorkRatio = totalScreenTime > 0 ? totalDeepWorkMs / totalScreenTime : 0;

    const contextSwitchesPerHour = this.calculateContextSwitches(records);
    const distractionSources = this.detectDistractions(records, deepWorkSessions);
    const frustrationSignals = this.detectFrustration(records);
    const topSwitchPairs = this.calculateTopSwitchPairs(records);

    return {
      deepWorkSessions,
      totalDeepWorkMs,
      deepWorkRatio,
      contextSwitchesPerHour,
      distractionSources,
      frustrationSignals,
      topSwitchPairs,
    };
  }

  /**
   * Detect deep work sessions: consecutive work_dev/terminal blocks > 15min
   */
  private detectDeepWorkSessions(records: AppUsageRecord[]): DeepWorkSession[] {
    const MIN_DEEP_WORK_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_GAP_MS = 2 * 60 * 1000; // 2 minute gap tolerance
    const SHORT_INTERRUPTION_MS = 60 * 1000; // 1 minute interruption tolerance

    const sessions: DeepWorkSession[] = [];
    let blockStart: number | null = null;
    let blockEnd: number | null = null;
    let blockPrimaryApp = '';
    let blockAppDurations = new Map<string, number>();
    let lastWorkEndTime: number | null = null;

    for (const record of records) {
      const category = classifyApp(record.appName, record.windowTitle);
      const isWork = isWorkCategory(category);

      if (isWork) {
        // Check if this continues or starts a new block
        if (
          blockStart !== null &&
          lastWorkEndTime !== null &&
          record.startTime - lastWorkEndTime <= MAX_GAP_MS
        ) {
          // Continue block
          blockEnd = record.endTime;
        } else {
          // Flush previous block if qualifying
          if (blockStart !== null && blockEnd !== null) {
            const duration = blockEnd - blockStart;
            if (duration >= MIN_DEEP_WORK_MS) {
              sessions.push({
                startTime: blockStart,
                endTime: blockEnd,
                duration,
                primaryApp: blockPrimaryApp,
                project: undefined, // Will be enriched later if needed
              });
            }
          }
          // Start new block
          blockStart = record.startTime;
          blockEnd = record.endTime;
          blockAppDurations = new Map();
        }

        // Track app durations within block
        const cur = blockAppDurations.get(record.appName) || 0;
        blockAppDurations.set(record.appName, cur + record.duration);

        // Update primary app
        let maxDur = 0;
        for (const [app, dur] of blockAppDurations) {
          if (dur > maxDur) {
            maxDur = dur;
            blockPrimaryApp = app;
          }
        }

        lastWorkEndTime = record.endTime;
      } else if (category === 'communication' && record.duration < SHORT_INTERRUPTION_MS) {
        // Short communication doesn't break deep work
        continue;
      } else {
        // Non-work app breaks the block (unless short communication handled above)
        if (blockStart !== null && blockEnd !== null) {
          const duration = blockEnd - blockStart;
          if (duration >= MIN_DEEP_WORK_MS) {
            sessions.push({
              startTime: blockStart,
              endTime: blockEnd,
              duration,
              primaryApp: blockPrimaryApp,
            });
          }
        }
        blockStart = null;
        blockEnd = null;
        lastWorkEndTime = null;
        blockAppDurations = new Map();
      }
    }

    // Flush last block
    if (blockStart !== null && blockEnd !== null) {
      const duration = blockEnd - blockStart;
      if (duration >= MIN_DEEP_WORK_MS) {
        sessions.push({
          startTime: blockStart,
          endTime: blockEnd,
          duration,
          primaryApp: blockPrimaryApp,
        });
      }
    }

    return sessions;
  }

  /**
   * Calculate context switches per hour (app changes)
   */
  private calculateContextSwitches(records: AppUsageRecord[]): number {
    if (records.length < 2) return 0;

    let switches = 0;
    for (let i = 1; i < records.length; i++) {
      if (records[i].appName !== records[i - 1].appName) {
        switches++;
      }
    }

    const totalTimeMs = records[records.length - 1].endTime - records[0].startTime;
    const totalHours = totalTimeMs / (1000 * 60 * 60);

    return totalHours > 0 ? Math.round((switches / totalHours) * 10) / 10 : 0;
  }

  /**
   * Detect distraction sources that interrupt deep work
   */
  private detectDistractions(
    records: AppUsageRecord[],
    deepWorkSessions: DeepWorkSession[],
  ): { appName: string; interruptions: number }[] {
    const interruptionMap = new Map<string, number>();

    for (const session of deepWorkSessions) {
      // Find records that occurred right after a deep work session ended
      for (const record of records) {
        if (
          record.startTime >= session.endTime &&
          record.startTime <= session.endTime + 2 * 60 * 1000
        ) {
          const category = classifyApp(record.appName, record.windowTitle);
          if (category === 'communication' || category === 'distraction') {
            const cur = interruptionMap.get(record.appName) || 0;
            interruptionMap.set(record.appName, cur + 1);
          }
          break; // Only count the first interrupting app per session
        }
      }
    }

    return Array.from(interruptionMap.entries())
      .map(([appName, interruptions]) => ({ appName, interruptions }))
      .sort((a, b) => b.interruptions - a.interruptions);
  }

  /**
   * Detect frustration signals
   */
  private detectFrustration(records: AppUsageRecord[]): FrustrationSignal[] {
    const signals: FrustrationSignal[] = [];

    // Rapid switch detection: 5min window, >6 switches between same two apps
    const WINDOW_MS = 5 * 60 * 1000;
    for (let i = 0; i < records.length; i++) {
      const windowEnd = records[i].startTime + WINDOW_MS;
      const windowRecords = records.filter(
        (r) => r.startTime >= records[i].startTime && r.startTime < windowEnd,
      );

      if (windowRecords.length < 6) continue;

      // Count pair switches
      const pairCounts = new Map<string, number>();
      for (let j = 1; j < windowRecords.length; j++) {
        if (windowRecords[j].appName !== windowRecords[j - 1].appName) {
          const pair = [windowRecords[j - 1].appName, windowRecords[j].appName].sort().join('↔');
          pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
        }
      }

      for (const [pair, count] of pairCounts) {
        if (count >= 6) {
          const startTimeStr = new Date(records[i].startTime).toLocaleTimeString('zh-CN');
          const endTimeStr = new Date(windowEnd).toLocaleTimeString('zh-CN');
          signals.push({
            type: 'rapid_switch',
            description: `在 ${pair.replace('↔', ' 和 ')} 之间频繁切换（${count} 次）`,
            timeRange: `${startTimeStr} - ${endTimeStr}`,
          });
          // Skip ahead to avoid duplicate signals for overlapping windows
          break;
        }
      }
    }

    // Error-then-search sequence detection
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const category = classifyApp(record.appName, record.windowTitle);
      if (!isWorkCategory(category)) continue;

      const lowerTitle = record.windowTitle.toLowerCase();
      const hasError = ERROR_KEYWORDS.some((kw) => lowerTitle.includes(kw.toLowerCase()));
      if (!hasError) continue;

      // Check if a browser search follows within 2 minutes
      const searchWindow = record.endTime + 2 * 60 * 1000;
      for (let j = i + 1; j < records.length && records[j].startTime <= searchWindow; j++) {
        if (
          BROWSER_APPS.has(records[j].appName) &&
          SEARCH_KEYWORDS.some((kw) => records[j].windowTitle.toLowerCase().includes(kw.toLowerCase()))
        ) {
          const startTimeStr = new Date(record.startTime).toLocaleTimeString('zh-CN');
          const endTimeStr = new Date(records[j].endTime).toLocaleTimeString('zh-CN');
          signals.push({
            type: 'error_search_sequence',
            description: `在 ${record.appName} 中遇到错误后搜索解决方案`,
            timeRange: `${startTimeStr} - ${endTimeStr}`,
            resolution: '已尝试通过搜索解决',
          });
          break;
        }
      }
    }

    // Repeated search detection: 3+ consecutive browser records with search keywords
    let consecutiveSearches = 0;
    let searchStart = 0;

    for (let i = 0; i < records.length; i++) {
      const isSearch =
        BROWSER_APPS.has(records[i].appName) &&
        SEARCH_KEYWORDS.some((kw) => records[i].windowTitle.toLowerCase().includes(kw.toLowerCase()));

      if (isSearch) {
        if (consecutiveSearches === 0) searchStart = i;
        consecutiveSearches++;
      } else {
        if (consecutiveSearches >= 3) {
          const startTimeStr = new Date(records[searchStart].startTime).toLocaleTimeString('zh-CN');
          const endTimeStr = new Date(records[i - 1].endTime).toLocaleTimeString('zh-CN');
          signals.push({
            type: 'repeated_search',
            description: `连续 ${consecutiveSearches} 次搜索，可能遇到技术难题`,
            timeRange: `${startTimeStr} - ${endTimeStr}`,
          });
        }
        consecutiveSearches = 0;
      }
    }

    // Check trailing searches
    if (consecutiveSearches >= 3) {
      const startTimeStr = new Date(records[searchStart].startTime).toLocaleTimeString('zh-CN');
      const endTimeStr = new Date(records[records.length - 1].endTime).toLocaleTimeString('zh-CN');
      signals.push({
        type: 'repeated_search',
        description: `连续 ${consecutiveSearches} 次搜索，可能遇到技术难题`,
        timeRange: `${startTimeStr} - ${endTimeStr}`,
      });
    }

    return signals;
  }

  /**
   * Calculate top application switch pairs by frequency
   */
  private calculateTopSwitchPairs(records: AppUsageRecord[]): { pair: string; count: number }[] {
    if (records.length < 2) return [];

    const pairCounts = new Map<string, number>();
    for (let i = 1; i < records.length; i++) {
      if (records[i].appName !== records[i - 1].appName) {
        const pair = [records[i - 1].appName, records[i].appName].sort().join(' ↔ ');
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    }

    return Array.from(pairCounts.entries())
      .map(([pair, count]) => ({ pair, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }
}
