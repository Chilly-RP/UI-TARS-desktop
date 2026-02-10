/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useCallback } from 'react';
import { Clock, Camera, Trash2, Bell, Plus, X, Terminal, Info } from 'lucide-react';

import { api } from '@renderer/api';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import { Switch } from '@renderer/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { DailyReportSettings } from '@main/store/types';

export function DailyReportSettingsPanel() {
  const [settings, setSettings] = useState<DailyReportSettings | null>(null);
  const [status, setStatus] = useState<{
    enabled: boolean;
    isTracking: boolean;
    isCapturing: boolean;
    lastReportDate: string | null;
  } | null>(null);
  const [newExcludedApp, setNewExcludedApp] = useState('');
  const [loading, setLoading] = useState(true);
  const [shellHistoryStatus, setShellHistoryStatus] = useState<{
    exists: boolean;
    extendedHistoryEnabled: boolean;
    lineCount: number;
    path: string;
  } | null>(null);
  const [setupGuide, setSetupGuide] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const loadShellHistoryStatus = useCallback(async () => {
    try {
      const historyStatus = await api.checkShellHistoryStatus();
      setShellHistoryStatus(historyStatus);
    } catch (error) {
      console.error('Failed to check shell history status:', error);
    }
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [loadedSettings, loadedStatus] = await Promise.all([
          api.getDailyReportSettings(),
          api.getDailyReportStatus(),
        ]);
        setSettings(loadedSettings);
        setStatus(loadedStatus);

        if (loadedSettings.enableShellHistory) {
          loadShellHistoryStatus();
        }
      } catch (error) {
        console.error('Failed to load daily report settings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();

    // Listen for settings updates
    const unsubscribe = window.electron.dailyReport.onSettingsUpdated(
      (newSettings) => {
        setSettings(newSettings);
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const updateSettings = async (updates: Partial<DailyReportSettings>) => {
    if (!settings) return;

    try {
      await api.updateDailyReportSettings(updates);
      setSettings({ ...settings, ...updates });

      // Refresh status after settings change
      const newStatus = await api.getDailyReportStatus();
      setStatus(newStatus);
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
  };

  const handleAddExcludedApp = () => {
    if (!settings || !newExcludedApp.trim()) return;

    const trimmedApp = newExcludedApp.trim();
    if (settings.excludedApps.includes(trimmedApp)) return;

    updateSettings({
      excludedApps: [...settings.excludedApps, trimmedApp],
    });
    setNewExcludedApp('');
  };

  const handleRemoveExcludedApp = (appName: string) => {
    if (!settings) return;

    updateSettings({
      excludedApps: settings.excludedApps.filter((a) => a !== appName),
    });
  };

  if (loading || !settings) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-medium">每日报告设置</h2>
        <div className="text-sm text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">每日报告设置</h2>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="daily-report-enabled">启用每日报告</Label>
          <p className="text-sm text-gray-500">
            追踪应用使用并截取屏幕截图以生成每日活动报告
          </p>
        </div>
        <Switch
          id="daily-report-enabled"
          checked={settings.enabled}
          onCheckedChange={(checked) => updateSettings({ enabled: checked })}
        />
      </div>

      {/* Status Indicator */}
      {status && settings.enabled && (
        <div className="rounded-lg border p-4 bg-gray-50 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                status.isTracking ? 'bg-green-500' : 'bg-gray-300'
              }`}
            />
            <span>App追踪: {status.isTracking ? 'Active' : 'Inactive'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                status.isCapturing ? 'bg-green-500' : 'bg-gray-300'
              }`}
            />
            <span>屏幕截图: {status.isCapturing ? 'Active' : 'Inactive'}</span>
          </div>
          {status.lastReportDate && (
            <div className="text-sm text-gray-500">
              最后报告：{status.lastReportDate}
            </div>
          )}
        </div>
      )}

      {/* Screenshot Interval */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Camera className="h-4 w-4" />
          截图间隔
        </Label>
        <Select
          value={settings.screenshotIntervalMinutes.toString()}
          onValueChange={(value) =>
            updateSettings({ screenshotIntervalMinutes: parseInt(value, 10) })
          }
          disabled={!settings.enabled}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">每 1 分钟</SelectItem>
            <SelectItem value="2">每 2 分钟</SelectItem>
            <SelectItem value="5">每 5 分钟</SelectItem>
            <SelectItem value="10">每 10 分钟</SelectItem>
            <SelectItem value="15">每 15 分钟</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-gray-500">截取屏幕截图的频率</p>
      </div>

      {/* Data Retention */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          数据保留
        </Label>
        <Select
          value={settings.retentionDays.toString()}
          onValueChange={(value) =>
            updateSettings({ retentionDays: parseInt(value, 10) })
          }
          disabled={!settings.enabled}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">1 天</SelectItem>
            <SelectItem value="3">3 天</SelectItem>
            <SelectItem value="5">5 天</SelectItem>
            <SelectItem value="7">7 天</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-gray-500">保留应用使用数据和截图的时长</p>
      </div>

      {/* Notification Time */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          每日报告通知
        </Label>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <Input
            type="time"
            value={settings.notificationTime}
            onChange={(e) =>
              updateSettings({ notificationTime: e.target.value })
            }
            className="w-32"
            disabled={!settings.enabled}
          />
        </div>
        <p className="text-sm text-gray-500">接收每日报告通知的时间</p>
      </div>

      {/* Terminal Shell History */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              终端命令历史
            </Label>
            <p className="text-sm text-gray-500">
              读取 Shell 历史记录以丰富每日报告中的终端活动描述
            </p>
          </div>
          <Switch
            checked={settings.enableShellHistory}
            onCheckedChange={(checked) => {
              updateSettings({ enableShellHistory: checked });
              if (checked) {
                loadShellHistoryStatus();
              }
            }}
            disabled={!settings.enabled}
          />
        </div>

        {settings.enableShellHistory && shellHistoryStatus && (
          <div className="rounded-lg border p-3 bg-gray-50 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  shellHistoryStatus.exists ? 'bg-green-500' : 'bg-red-400'
                }`}
              />
              <span>
                历史文件：
                {shellHistoryStatus.exists
                  ? `已找到（${shellHistoryStatus.lineCount} 条记录）`
                  : '未找到'}
              </span>
            </div>
            {shellHistoryStatus.exists && (
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    shellHistoryStatus.extendedHistoryEnabled
                      ? 'bg-green-500'
                      : 'bg-yellow-400'
                  }`}
                />
                <span>
                  扩展历史（含时间戳）：
                  {shellHistoryStatus.extendedHistoryEnabled
                    ? '已启用'
                    : '未启用（将使用最近记录作为参考）'}
                </span>
              </div>
            )}
            {shellHistoryStatus.exists &&
              !shellHistoryStatus.extendedHistoryEnabled && (
                <div>
                  <button
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                    onClick={async () => {
                      if (!setupGuide) {
                        try {
                          const guide = await api.getShellHistorySetupGuide();
                          setSetupGuide(guide);
                        } catch (error) {
                          console.error('Failed to get setup guide:', error);
                        }
                      }
                      setShowSetupGuide(!showSetupGuide);
                    }}
                  >
                    <Info className="h-3 w-3" />
                    {showSetupGuide ? '隐藏设置向导' : '如何启用扩展历史'}
                  </button>
                  {showSetupGuide && setupGuide && (
                    <pre className="mt-2 p-2 rounded bg-gray-100 text-xs whitespace-pre-wrap font-mono">
                      {setupGuide}
                    </pre>
                  )}
                </div>
              )}
          </div>
        )}
      </div>

      {/* Excluded Apps */}
      <div className="space-y-2">
        <Label>排除的应用</Label>
        <p className="text-sm text-gray-500">这些应用不会被追踪</p>
        <div className="flex gap-2">
          <Input
            placeholder="应用名称（例如：Finder）"
            value={newExcludedApp}
            onChange={(e) => setNewExcludedApp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddExcludedApp();
              }
            }}
            disabled={!settings.enabled}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddExcludedApp}
            disabled={!settings.enabled || !newExcludedApp.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {settings.excludedApps.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {settings.excludedApps.map((app) => (
              <div
                key={app}
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-sm"
              >
                <span>{app}</span>
                <button
                  onClick={() => handleRemoveExcludedApp(app)}
                  className="hover:text-red-500"
                  disabled={!settings.enabled}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test Notification Button */}
      {settings.enabled && (
        <div className="pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await api.triggerDailyReportNotification();
              } catch (error) {
                console.error('Failed to trigger notification:', error);
              }
            }}
          >
            <Bell className="h-4 w-4 mr-2" />
            测试通知
          </Button>
        </div>
      )}
    </div>
  );
}
