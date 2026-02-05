/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect } from 'react';
import { Clock, Camera, Trash2, Bell, Plus, X } from 'lucide-react';

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
        <h2 className="text-lg font-medium">Daily Report Settings</h2>
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Daily Report Settings</h2>

      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="daily-report-enabled">Enable Daily Report</Label>
          <p className="text-sm text-gray-500">
            Track app usage and capture screenshots for daily activity reports
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
            <span>
              App Tracking: {status.isTracking ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                status.isCapturing ? 'bg-green-500' : 'bg-gray-300'
              }`}
            />
            <span>
              Screenshot Capture: {status.isCapturing ? 'Active' : 'Inactive'}
            </span>
          </div>
          {status.lastReportDate && (
            <div className="text-sm text-gray-500">
              Last report: {status.lastReportDate}
            </div>
          )}
        </div>
      )}

      {/* Screenshot Interval */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Screenshot Interval
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
            <SelectItem value="1">Every 1 minute</SelectItem>
            <SelectItem value="2">Every 2 minutes</SelectItem>
            <SelectItem value="5">Every 5 minutes</SelectItem>
            <SelectItem value="10">Every 10 minutes</SelectItem>
            <SelectItem value="15">Every 15 minutes</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-gray-500">
          How often to capture screenshots for activity analysis
        </p>
      </div>

      {/* Data Retention */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          Data Retention
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
            <SelectItem value="1">1 day</SelectItem>
            <SelectItem value="3">3 days</SelectItem>
            <SelectItem value="5">5 days</SelectItem>
            <SelectItem value="7">7 days</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-gray-500">
          How long to keep app usage data and screenshots
        </p>
      </div>

      {/* Notification Time */}
      <div className="space-y-2">
        <Label className="flex items-center gap-2">
          <Bell className="h-4 w-4" />
          Daily Report Notification
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
        <p className="text-sm text-gray-500">
          Time to receive the daily report notification
        </p>
      </div>

      {/* Excluded Apps */}
      <div className="space-y-2">
        <Label>Excluded Apps</Label>
        <p className="text-sm text-gray-500">
          These apps will not be tracked in your daily report
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="App name (e.g., Finder)"
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
            Test Notification
          </Button>
        </div>
      )}
    </div>
  );
}
