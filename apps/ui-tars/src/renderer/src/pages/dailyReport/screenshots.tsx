/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  CheckSquare,
  Trash2,
  X,
  SquareCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@renderer/api';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { DragArea } from '@renderer/components/Common/drag';
import {
  ScreenshotGallery,
  CapturedScreenshot,
} from '@renderer/components/DailyReport/ScreenshotGallery';
import { ScreenshotPreview } from '@renderer/components/DailyReport/ScreenshotGallery/ScreenshotPreview';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@renderer/components/ui/alert-dialog';

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

  // Selection mode states
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  // Exit selection mode when date changes
  useEffect(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, [currentDate]);

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

  // Selection mode handlers
  const handleEnterSelectionMode = () => {
    setIsSelectionMode(true);
    setSelectedIds(new Set());
  };

  const handleCancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleSelectionChange = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === screenshots.length) {
      // Deselect all if already all selected
      setSelectedIds(new Set());
    } else {
      // Select all
      setSelectedIds(new Set(screenshots.map((s) => s.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;

    setIsDeleting(true);
    try {
      const result = await api.deleteScreenshots({
        ids: Array.from(selectedIds),
      });
      if (result.success || result.deletedCount > 0) {
        // 显示成功通知
        toast.success(`成功删除 ${result.deletedCount} 张截图`);
        // Refresh screenshots list
        await loadScreenshots(currentDate);
        // Exit selection mode
        setIsSelectionMode(false);
        setSelectedIds(new Set());
        if (result.errors && result.errors.length > 0) {
          // 部分成功，部分失败
          toast.error('部分删除失败', {
            description: `${result.errors.length} 个文件删除失败`,
          });
        }
      } else {
        // 完全失败
        toast.error('删除失败', {
          description: result.errors?.join(', ') || '未知错误',
        });
      }
    } catch (error) {
      console.error('Failed to delete screenshots:', error);
      toast.error('删除失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const isToday = currentDate === new Date().toISOString().split('T')[0];
  const isAllSelected =
    screenshots.length > 0 && selectedIds.size === screenshots.length;

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
            onClick={() => navigate(`/daily-report?date=${currentDate}`)}
            title="返回"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">截图记录</h1>
        </div>

        {isSelectionMode ? (
          // Selection mode buttons
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="gap-1"
            >
              <SquareCheck className="h-4 w-4" />
              {isAllSelected ? '取消全选' : '全选'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={selectedIds.size === 0 || isDeleting}
              className="gap-1"
            >
              <Trash2 className="h-4 w-4" />
              删除 ({selectedIds.size})
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancelSelection}>
              <X className="h-4 w-4" />
              取消
            </Button>
          </div>
        ) : (
          // Normal mode buttons
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
            {screenshots.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEnterSelectionMode}
                className="gap-1 ml-2"
              >
                <CheckSquare className="h-4 w-4" />
                选择
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Screenshot count */}
      <div className="px-6 py-3 border-b bg-gray-50">
        <span className="text-sm text-gray-600">
          {isSelectionMode
            ? `已选择 ${selectedIds.size} / ${screenshots.length} 张截图`
            : `共 ${screenshots.length} 张截图`}
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
              isSelectionMode={isSelectionMode}
              selectedIds={selectedIds}
              onSelectionChange={handleSelectionChange}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 {selectedIds.size} 张截图吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export { ScreenshotGalleryPage as Component };
