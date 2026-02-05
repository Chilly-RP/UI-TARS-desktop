/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Clock, Monitor, Bot, Calendar } from 'lucide-react';

import { DailyReport } from '@main/store/types';

interface ReportSummaryProps {
  report: DailyReport;
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

  return (
    <div className="space-y-4">
      {/* Date Header */}
      <div className="flex items-center gap-2 text-gray-500">
        <Calendar className="h-4 w-4" />
        <span>{formatDate(report.date)}</span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
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

      {/* Summary Text */}
      <div className="rounded-lg border bg-gray-50 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">摘要</h3>
        <p className="text-gray-600">{report.summary}</p>
      </div>
    </div>
  );
}
