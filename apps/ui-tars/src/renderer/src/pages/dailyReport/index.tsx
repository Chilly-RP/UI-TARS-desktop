/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Settings,
  Images,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@renderer/api';
import { DailyReport } from '@main/store/types';
import { dailyReportManager } from '@renderer/db/dailyReport';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { DragArea } from '@renderer/components/Common/drag';
import { ReportSummary } from '@renderer/components/DailyReport/ReportSummary';
import { ActivityTimeline } from '@renderer/components/DailyReport/ActivityTimeline';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { DailyReportSettingsPanel } from '@renderer/components/Settings/category/dailyReport';

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`;
  return `${seconds} 秒`;
}

export default function DailyReportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) return dateParam;
    return new Date().toISOString().split('T')[0];
  });
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load report for current date
  useEffect(() => {
    loadReport(currentDate);
  }, [currentDate]);

  // Listen for new reports from main process
  useEffect(() => {
    const unsubscribe = window.electron.dailyReport.onReportGenerated(
      async (newReport) => {
        // Save to IndexedDB
        await dailyReportManager.saveReport(newReport);

        // Update display if it's for the current date
        if (newReport.date === currentDate) {
          setReport(newReport);
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [currentDate]);

  // Listen for navigation requests
  useEffect(() => {
    const unsubscribe = window.electron.dailyReport.onNavigateToReport(() => {
      // Already on the page, refresh the current report
      loadReport(currentDate);
    });

    return () => {
      unsubscribe();
    };
  }, [currentDate]);

  const loadReport = async (date: string) => {
    setLoading(true);
    try {
      // First try to load from IndexedDB
      const storedReport = await dailyReportManager.getReportByDate(date);
      if (storedReport) {
        setReport(storedReport);
      } else {
        setReport(null);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    setGenerating(true);
    console.log('=== handleGenerateReport START ===');
    try {
      console.log('handleGenerateReport: Calling API for date', currentDate);
      const result = await api.generateDailyReport({ date: currentDate });
      console.log(
        'handleGenerateReport: Received result',
        JSON.stringify(result).substring(0, 500),
      );
      if (result.success && result.report) {
        console.log('handleGenerateReport: Saving report to IndexedDB');
        // Save to IndexedDB
        await dailyReportManager.saveReport(result.report);
        setReport(result.report);
        console.log('handleGenerateReport: Report saved and set');
      } else {
        console.warn('handleGenerateReport: No report in result', result);
        const res = result as { reason?: string; dataStats?: { totalDurationMs: number } };
        if (res.reason === 'insufficient_data' && res.dataStats) {
          toast.error('数据不足，无法生成报告', {
            description: `当前仅记录了 ${formatDuration(res.dataStats.totalDurationMs)}，需要至少 5 分钟`,
          });
        } else {
          toast.error('无法生成报告');
        }
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
      toast.error('生成报告失败');
    } finally {
      setGenerating(false);
      console.log('=== handleGenerateReport END ===');
    }
  };

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const result = await api.exportDailyReportPDF({ date: currentDate });
      if (result.success) {
        toast.success('PDF 导出成功', {
          description: result.filePath,
        });
      } else if (result.error !== 'User cancelled') {
        toast.error('PDF 导出失败');
      }
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error('PDF 导出失败');
    } finally {
      setExporting(false);
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

  const isToday = currentDate === new Date().toISOString().split('T')[0];
  const isFuture = new Date(currentDate) > new Date();

  return (
    <div className="h-screen flex flex-col bg-white print:h-auto print:overflow-visible">
      <DragArea />

      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">每日报告</h1>
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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleGenerateReport}
            disabled={generating || isFuture}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`}
            />
            {generating ? '生成中...' : '生成报告'}
          </Button>
          {report && (
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={exporting}
            >
              <Download
                className={`h-4 w-4 mr-2 ${exporting ? 'animate-pulse' : ''}`}
              />
              {exporting ? '导出中...' : '导出 PDF'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              navigate(`/daily-report/screenshots?date=${currentDate}`)
            }
            title="查看截图"
          >
            <Images className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>每日报告设置</DialogTitle>
          </DialogHeader>
          <DailyReportSettingsPanel />
        </DialogContent>
      </Dialog>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : report ? (
            <>
              <ReportSummary report={report} />
              <ActivityTimeline
                activities={report.activities}
                agentInteractions={report.agentInteractions}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <p className="mb-4">该日期暂无报告</p>
              {!isFuture && (
                <>
                  <Button onClick={handleGenerateReport} disabled={generating}>
                    <RefreshCw
                      className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`}
                    />
                    生成报告
                  </Button>
                  <p className="mt-3 text-xs text-gray-400">
                    需要至少 5 分钟的应用使用记录才能生成报告
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export { DailyReportPage as Component };
