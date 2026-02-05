/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { AppUsageSummary } from '@main/store/types';

interface AppUsageChartProps {
  appUsage: AppUsageSummary[];
}

// Color palette for the pie chart
const COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
  '#6366F1', // indigo
];

export function AppUsageChart({ appUsage }: AppUsageChartProps) {
  const formatDuration = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  // Prepare data for pie chart (show top 8, group rest as "Other")
  const prepareChartData = () => {
    if (appUsage.length <= 8) {
      return appUsage.map((item) => ({
        name: item.appName,
        value: item.duration,
        percentage: item.percentage,
      }));
    }

    const topApps = appUsage.slice(0, 7);
    const otherApps = appUsage.slice(7);
    const otherDuration = otherApps.reduce((sum, app) => sum + app.duration, 0);
    const otherPercentage = otherApps.reduce(
      (sum, app) => sum + app.percentage,
      0,
    );

    return [
      ...topApps.map((item) => ({
        name: item.appName,
        value: item.duration,
        percentage: item.percentage,
      })),
      {
        name: 'Other',
        value: otherDuration,
        percentage: otherPercentage,
      },
    ];
  };

  const chartData = prepareChartData();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-lg border bg-white p-2 shadow-lg">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-gray-600">
            {formatDuration(data.value)} ({data.percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-lg font-medium mb-4">App Usage</h3>

      {appUsage.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No app usage data available
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Pie Chart */}
          <div className="w-64 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend / App List */}
          <div className="flex-1 space-y-2 max-h-64 overflow-y-auto">
            {appUsage.map((app, index) => (
              <div
                key={app.appName}
                className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                  <span className="text-sm truncate max-w-40">
                    {app.appName}
                  </span>
                </div>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <span>{formatDuration(app.duration)}</span>
                  <span className="text-xs text-gray-400">
                    ({app.percentage}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
