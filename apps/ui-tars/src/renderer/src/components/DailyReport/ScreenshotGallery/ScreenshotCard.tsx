/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';

import { api } from '@renderer/api';
import { Checkbox } from '@renderer/components/ui/checkbox';
import { cn } from '@renderer/utils/index';

interface CapturedScreenshot {
  id: string;
  filePath: string;
  timestamp: number;
  date: string;
}

interface ScreenshotCardProps {
  screenshot: CapturedScreenshot;
  onClick: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onSelectionChange?: (id: string, selected: boolean) => void;
}

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function ScreenshotCard({
  screenshot,
  onClick,
  isSelectionMode = false,
  isSelected = false,
  onSelectionChange,
}: ScreenshotCardProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadImage = async () => {
      try {
        const base64 = await api.getScreenshotBase64({
          filePath: screenshot.filePath,
        });
        if (mounted && base64) {
          setImageData(`data:image/jpeg;base64,${base64}`);
        }
      } catch (error) {
        console.error('Failed to load screenshot:', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadImage();
    return () => {
      mounted = false;
    };
  }, [screenshot.filePath]);

  const handleClick = () => {
    if (isSelectionMode && onSelectionChange) {
      onSelectionChange(screenshot.id, !isSelected);
    } else {
      onClick();
    }
  };

  const handleCheckboxChange = (checked: boolean) => {
    if (onSelectionChange) {
      onSelectionChange(screenshot.id, checked);
    }
  };

  return (
    <div
      className="cursor-pointer group relative"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
    >
      <div
        className={cn(
          'aspect-[16/10] rounded-lg border overflow-hidden bg-gray-100 transition-all group-hover:border-blue-400 group-hover:shadow-md',
          isSelected && 'border-blue-500 border-2 shadow-md',
        )}
      >
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-blue-500 rounded-full" />
          </div>
        ) : imageData ? (
          <img
            src={imageData}
            alt={`截图 ${formatTime(screenshot.timestamp)}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            加载失败
          </div>
        )}

        {/* Checkbox in selection mode */}
        {isSelectionMode && (
          <div
            className="absolute bottom-2 right-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
              className="h-5 w-5 bg-white shadow-md"
            />
          </div>
        )}
      </div>
      <p className="text-sm text-gray-500 text-center mt-2">
        {formatTime(screenshot.timestamp)}
      </p>
    </div>
  );
}
