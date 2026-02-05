/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';

import { api } from '@renderer/api';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { DragArea } from '@renderer/components/Common/drag';
import {
  ScreenshotGallery,
  CapturedScreenshot,
} from '@renderer/components/DailyReport/ScreenshotGallery';
import { ScreenshotPreview } from '@renderer/components/DailyReport/ScreenshotGallery/ScreenshotPreview';

export default function ScreenshotGalleryPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [currentDate, setCurrentDate] = useState(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) return dateParam;
    return new Date().toISOString().split('T')[0];
  });

  const [screenshots, setScreenshots] = useState<CapturedScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Sort screenshots by timestamp descending for navigation
  const sortedScreenshots = [...screenshots].sort(
    (a, b) => b.timestamp - a.timestamp,
  );

  // Load screenshots for current date
  useEffect(() => {
    loadScreenshots(currentDate);
  }, [currentDate]);

  // Update URL when date changes
  useEffect(() => {
    setSearchParams({ date: currentDate });
  }, [currentDate, setSearchParams]);

  const loadScreenshots = async (date: string) => {
    setLoading(true);
    try {
      const result = await api.getScreenshotsForDate({ date });
      setScreenshots(result);
    } catch (error) {
      console.error('Failed to load screenshots:', error);
      setScreenshots([]);
    } finally {
      setLoading(false);
    }
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const date = new Date(currentDate);
    if (direction === 'prev') {
      date.setDate(date.getDate() - 1);
    } else {
      date.setDate(date.getDate() + 1);
    }
    setCurrentDate(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setCurrentDate(new Date().toISOString().split('T')[0]);
  };

  const handleScreenshotClick = useCallback(
    (_screenshot: CapturedScreenshot, index: number) => {
      setSelectedIndex(index);
      setPreviewOpen(true);
    },
    [],
  );

  const handlePrevious = useCallback(() => {
    if (
      selectedIndex !== null &&
      selectedIndex < sortedScreenshots.length - 1
    ) {
      setSelectedIndex(selectedIndex + 1);
    }
  }, [selectedIndex, sortedScreenshots.length]);

  const handleNext = useCallback(() => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  }, [selectedIndex]);

  const isToday = currentDate === new Date().toISOString().split('T')[0];

  const selectedScreenshot =
    selectedIndex !== null ? sortedScreenshots[selectedIndex] : null;

  return (
    <div className="h-screen flex flex-col bg-white">
      <DragArea />

      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/daily-report')}
            title="返回"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">截图记录</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateDate('prev')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-28 text-center">
            {currentDate}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateDate('next')}
            disabled={isToday}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            disabled={isToday}
          >
            今天
          </Button>
        </div>
      </div>

      {/* Screenshot count */}
      <div className="px-6 py-3 border-b bg-gray-50">
        <span className="text-sm text-gray-600">
          共 {screenshots.length} 张截图
        </span>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
            </div>
          ) : (
            <ScreenshotGallery
              screenshots={screenshots}
              onScreenshotClick={handleScreenshotClick}
            />
          )}
        </div>
      </ScrollArea>

      {/* Preview Dialog */}
      <ScreenshotPreview
        screenshot={selectedScreenshot}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onPrevious={handlePrevious}
        onNext={handleNext}
        hasPrevious={
          selectedIndex !== null && selectedIndex < sortedScreenshots.length - 1
        }
        hasNext={selectedIndex !== null && selectedIndex > 0}
      />
    </div>
  );
}

export { ScreenshotGalleryPage as Component };
