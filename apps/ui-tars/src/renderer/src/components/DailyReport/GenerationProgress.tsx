/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Check, Loader2 } from 'lucide-react';
import type { ReportGenerationProgress } from '@main/store/types';

const STAGES = [
  { key: 'checking_data', label: '检查数据充分性' },
  { key: 'collecting_screenshots', label: '收集截图数据' },
  { key: 'collecting_terminal', label: '收集终端活动' },
  { key: 'analyzing_insights', label: '深度洞察分析' },
  { key: 'analyzing_screenshots', label: 'VLM 批量分析截图' },
  { key: 'refining_narrative', label: 'LLM 精炼叙述' },
  { key: 'generating_report', label: '生成报告' },
] as const;

function getStageIndex(stage: string): number {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return idx === -1 ? STAGES.length : idx;
}

export function GenerationProgress({
  progress,
}: {
  progress: ReportGenerationProgress;
}) {
  const currentIdx = getStageIndex(progress.stage);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Percent + progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600 font-medium">
              {progress.stageLabel}
            </span>
            <span className="text-gray-500 tabular-nums">
              {progress.percent}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {/* Stage list */}
        <div className="space-y-1">
          {STAGES.map((stage, idx) => {
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;

            return (
              <div
                key={stage.key}
                className={`flex items-center gap-3 py-1.5 px-2 rounded text-sm ${
                  isCurrent
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : isCompleted
                      ? 'text-gray-400'
                      : 'text-gray-300'
                }`}
              >
                <span className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                  {isCompleted ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                  )}
                </span>
                <span>{stage.label}</span>
              </div>
            );
          })}
        </div>

        {/* Detail text */}
        {progress.detail && (
          <p className="text-xs text-gray-400 text-center">{progress.detail}</p>
        )}
      </div>
    </div>
  );
}
