/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

interface CapturedScreenshot {
  id: string;
  filePath: string;
  timestamp: number;
  date: string;
}

interface ScreenshotCardProps {
  screenshot: CapturedScreenshot;
  onClick: () => void;
}

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function ScreenshotCard({ screenshot, onClick }: ScreenshotCardProps) {
  return (
    <div
      className="cursor-pointer group"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
    >
      <div className="aspect-[16/10] rounded-lg border overflow-hidden bg-gray-100 transition-all group-hover:border-blue-400 group-hover:shadow-md">
        <img
          src={`file://${screenshot.filePath}`}
          alt={`截图 ${formatTime(screenshot.timestamp)}`}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
      <p className="text-sm text-gray-500 text-center mt-2">
        {formatTime(screenshot.timestamp)}
      </p>
    </div>
  );
}
