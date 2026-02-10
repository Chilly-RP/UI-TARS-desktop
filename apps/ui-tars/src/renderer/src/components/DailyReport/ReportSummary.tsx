/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import {
  Clock,
  Monitor,
  Bot,
  Calendar,
  Zap,
  ChevronDown,
  ChevronRight,
  Trophy,
  BookOpen,
  AlertTriangle,
  Lightbulb,
  FolderGit2,
  Target,
  Repeat,
} from 'lucide-react';

import { DailyReport } from '@main/store/types';
import { AppUsageChart } from './AppUsageChart';

interface ReportSummaryProps {
  report: DailyReport;
}

function CollapsibleSection({
  title,
  icon,
  items,
  emptyText,
  colorClass,
  defaultOpen,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  emptyText: string;
  colorClass: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? items.length > 0);

  return (
    <div className="border rounded-lg overflow-hidden print:border-gray-300">
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors print:hidden"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
        )}
        <span className={colorClass}>{icon}</span>
        <span className="text-sm font-medium text-gray-700">{title}</span>
        {items.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">{items.length}</span>
        )}
      </button>
      {/* Print-only header (always visible) */}
      <div className="hidden print:flex items-center gap-2 px-4 py-3">
        <span className={colorClass}>{icon}</span>
        <span className="text-sm font-medium text-gray-700">{title}</span>
      </div>
      {/* Content: shown when open or in print mode */}
      <div className={`px-4 pb-3 ${open ? '' : 'hidden'} print:!block`}>
        {items.length > 0 ? (
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-gray-300 mt-1 shrink-0">-</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-400">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

export function ReportSummary({ report }: ReportSummaryProps) {
  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const { insights, structuredSummary } = report;
  const hasInsights = !!insights;
  const hasStructured = !!structuredSummary;

  return (
    <div className="space-y-4">
      {/* Date Header */}
      <div className="flex items-center gap-2 text-gray-500">
        <Calendar className="h-4 w-4" />
        <span>{formatDate(report.date)}</span>
      </div>

      {/* Summary Cards */}
      <div className={`grid gap-4 ${hasInsights ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {/* Screen Time Card */}
        <div className="rounded-lg border bg-gradient-to-br from-blue-50 to-white p-4">
          <div className="flex items-center gap-2 text-blue-600 mb-2">
            <Clock className="h-5 w-5" />
            <span className="text-sm font-medium">屏幕时间</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatDuration(report.totalScreenTime)}
          </div>
        </div>

        {/* Deep Work Card (new) */}
        {hasInsights && (
          <div className="rounded-lg border bg-gradient-to-br from-orange-50 to-white p-4">
            <div className="flex items-center gap-2 text-orange-600 mb-2">
              <Zap className="h-5 w-5" />
              <span className="text-sm font-medium">深度工作</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {formatDuration(insights.focusMetrics.totalDeepWorkMs)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              占比 {Math.round(insights.focusMetrics.deepWorkRatio * 100)}%
            </div>
          </div>
        )}

        {/* Apps Used Card */}
        <div className="rounded-lg border bg-gradient-to-br from-green-50 to-white p-4">
          <div className="flex items-center gap-2 text-green-600 mb-2">
            <Monitor className="h-5 w-5" />
            <span className="text-sm font-medium">使用的应用</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {report.appUsage.length}
          </div>
        </div>

        {/* Agent Interactions Card */}
        <div className="rounded-lg border bg-gradient-to-br from-purple-50 to-white p-4">
          <div className="flex items-center gap-2 text-purple-600 mb-2">
            <Bot className="h-5 w-5" />
            <span className="text-sm font-medium">智能体任务</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {report.agentInteractions.length}
          </div>
        </div>
      </div>

      {/* APP Usage Chart */}
      <AppUsageChart appUsage={report.appUsage} />

      {/* Narrative Summary */}
      <div className="rounded-lg border bg-gray-50 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">摘要</h3>
        <p className="text-gray-600">
          {hasStructured ? structuredSummary.narrative : report.summary}
        </p>
      </div>

      {/* Project Distribution */}
      {hasInsights && insights.projects.filter((p) => p.projectName !== '其他').length > 0 && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-3">
            <FolderGit2 className="h-4 w-4 text-indigo-500" />
            <h3 className="text-sm font-medium text-gray-700">项目投入</h3>
          </div>
          <div className="space-y-2">
            {insights.projects
              .filter((p) => p.projectName !== '其他')
              .slice(0, 6)
              .map((project) => (
                <div key={project.projectName} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-28 truncate" title={project.projectName}>
                    {project.projectName}
                  </span>
                  <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full transition-all"
                      style={{ width: `${Math.max(project.percentage, 2)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-16 text-right">
                    {formatDuration(project.totalDuration)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Structured Details */}
      {hasStructured && (
        <div className="space-y-2">
          {structuredSummary.milestones && structuredSummary.milestones.length > 0 && (
            <CollapsibleSection
              title="今日里程碑"
              icon={<Target className="h-4 w-4" />}
              items={structuredSummary.milestones}
              emptyText="暂无里程碑"
              colorClass="text-indigo-500"
            />
          )}
          <CollapsibleSection
            title="关键成就"
            icon={<Trophy className="h-4 w-4" />}
            items={structuredSummary.keyAccomplishments}
            emptyText="暂无关键成就记录"
            colorClass="text-amber-500"
          />
          <CollapsibleSection
            title="知识探索"
            icon={<BookOpen className="h-4 w-4" />}
            items={structuredSummary.knowledgeExplored}
            emptyText="暂无知识探索记录"
            colorClass="text-blue-500"
          />
          <CollapsibleSection
            title="困难与阻塞"
            icon={<AlertTriangle className="h-4 w-4" />}
            items={structuredSummary.blockers}
            emptyText="今日未检测到明显阻塞"
            colorClass="text-red-500"
          />
          {structuredSummary.attentionDrain && structuredSummary.attentionDrain.length > 0 && (
            <CollapsibleSection
              title="注意力损耗分析"
              icon={<Repeat className="h-4 w-4" />}
              items={structuredSummary.attentionDrain.map(
                (d) => `${d.topSwitchPair}（${d.switchCount} 次切换）：${d.suggestion}`,
              )}
              emptyText="暂无注意力损耗数据"
              colorClass="text-orange-500"
            />
          )}
          <CollapsibleSection
            title="效率洞察与建议"
            icon={<Lightbulb className="h-4 w-4" />}
            items={[
              ...structuredSummary.efficiencyHighlights,
              ...structuredSummary.suggestions,
            ]}
            emptyText="暂无效率建议"
            colorClass="text-emerald-500"
          />
        </div>
      )}
    </div>
  );
}
