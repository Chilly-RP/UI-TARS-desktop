/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Button } from '@renderer/components/ui/button';
import { api } from '@renderer/api';

interface CapturedScreenshot {
  id: string;
  filePath: string;
  timestamp: number;
  date: string;
}

interface ScreenshotPreviewProps {
  screenshot: CapturedScreenshot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}

const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export function ScreenshotPreview({
  screenshot,
  open,
  onOpenChange,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: ScreenshotPreviewProps) {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!screenshot || !open) {
      setImageData(null);
      return;
    }

    let mounted = true;
    setLoading(true);

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
  }, [screenshot?.filePath, open]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    },
    [open, hasPrevious, hasNext, onPrevious, onNext],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  if (!screenshot) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] w-auto">
        <DialogHeader>
          <DialogTitle>{formatDateTime(screenshot.timestamp)}</DialogTitle>
        </DialogHeader>
        <div className="relative flex items-center justify-center min-h-[200px]">
          {hasPrevious && onPrevious && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-0 z-10"
              onClick={onPrevious}
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          )}
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-blue-500 rounded-full" />
            </div>
          ) : imageData ? (
            <img
              src={imageData}
              alt={`截图 ${formatDateTime(screenshot.timestamp)}`}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          ) : (
            <div className="flex items-center justify-center text-gray-400">
              加载失败
            </div>
          )}
          {hasNext && onNext && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 z-10"
              onClick={onNext}
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          )}
        </div>
        <p className="text-sm text-gray-500 text-center">
          使用 ← → 箭头键切换截图
        </p>
      </DialogContent>
    </Dialog>
  );
}
