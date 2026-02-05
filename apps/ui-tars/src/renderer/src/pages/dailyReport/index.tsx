/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Settings } from 'lucide-react';
import { useNavigate } from 'react-router';

import { api } from '@renderer/api';
import { DailyReport } from '@main/store/types';
import { dailyReportManager } from '@renderer/db/dailyReport';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { DragArea } from '@renderer/components/Common/drag';
import { ReportSummary } from '@renderer/components/DailyReport/ReportSummary';
import { AppUsageChart } from '@renderer/components/DailyReport/AppUsageChart';
import { ActivityTimeline } from '@renderer/components/DailyReport/ActivityTimeline';

export default function DailyReportPage() {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

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
    try {
      const result = await api.generateDailyReport({ date: currentDate });
      if (result.success && result.report) {
        // Save to IndexedDB
        await dailyReportManager.saveReport(result.report);
        setReport(result.report);
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
    } finally {
      setGenerating(false);
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

  const isToday = currentDate === new Date().toISOString().split('T')[0];
  const isFuture = new Date(currentDate) > new Date();

  return (
    <div className="h-screen flex flex-col bg-white">
      <DragArea />

      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">Daily Report</h1>
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
            {generating ? 'Generating...' : 'Generate Report'}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/settings')}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
              <AppUsageChart appUsage={report.appUsage} />
              <ActivityTimeline
                activities={report.activities}
                agentInteractions={report.agentInteractions}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <p className="mb-4">No report available for this date</p>
              {!isFuture && (
                <Button onClick={handleGenerateReport} disabled={generating}>
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`}
                  />
                  Generate Report
                </Button>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export { DailyReportPage as Component };
