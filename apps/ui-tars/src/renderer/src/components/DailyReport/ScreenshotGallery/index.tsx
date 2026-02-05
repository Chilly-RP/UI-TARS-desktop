/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ScreenshotCard } from './ScreenshotCard';

interface CapturedScreenshot {
  id: string;
  filePath: string;
  timestamp: number;
  date: string;
}

interface ScreenshotGalleryProps {
  screenshots: CapturedScreenshot[];
  onScreenshotClick: (screenshot: CapturedScreenshot, index: number) => void;
}

export function ScreenshotGallery({
  screenshots,
  onScreenshotClick,
}: ScreenshotGalleryProps) {
  // Sort by timestamp descending (newest first)
  const sortedScreenshots = [...screenshots].sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  if (sortedScreenshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <p>该日期暂无截图</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {sortedScreenshots.map((screenshot, index) => (
        <ScreenshotCard
          key={screenshot.id}
          screenshot={screenshot}
          onClick={() => onScreenshotClick(screenshot, index)}
        />
      ))}
    </div>
  );
}

export type { CapturedScreenshot };
