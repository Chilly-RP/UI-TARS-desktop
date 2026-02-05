/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Clock, Tag, Bot, CheckCircle, XCircle, Loader } from 'lucide-react';

import { ActivitySummary, AgentInteraction } from '@main/store/types';

interface ActivityTimelineProps {
  activities: ActivitySummary[];
  agentInteractions: AgentInteraction[];
}

export function ActivityTimeline({
  activities,
  agentInteractions,
}: ActivityTimelineProps) {
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'running':
      case 'in_progress':
        return <Loader className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <CheckCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-lg font-medium mb-4">Activity Timeline</h3>

      <div className="space-y-6">
        {/* Activity Analysis */}
        {activities.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Activity Analysis
            </h4>
            <div className="space-y-3">
              {activities.map((activity, index) => (
                <div
                  key={index}
                  className="relative pl-4 border-l-2 border-blue-200 pb-3"
                >
                  <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-blue-500" />
                  <div className="text-sm text-gray-500 mb-1">
                    {activity.timeRange}
                  </div>
                  <div className="text-gray-900">{activity.summary}</div>
                  {activity.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {activity.topics.map((topic, topicIndex) => (
                        <span
                          key={topicIndex}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-600"
                        >
                          <Tag className="h-3 w-3" />
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agent Interactions */}
        {agentInteractions.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Agent Interactions
            </h4>
            <div className="space-y-2">
              {agentInteractions.map((interaction, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  {getStatusIcon(interaction.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">
                      {interaction.instruction}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatTime(interaction.timestamp)} • {interaction.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {activities.length === 0 && agentInteractions.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            No activity data available for this period
          </div>
        )}
      </div>
    </div>
  );
}
