/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
// /apps/ui-tars/src/renderer/src/pages/settings/index.tsx
import {
  RefreshCcw,
  Trash,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { api } from '@renderer/api';
import { SearchEngineForSettings, VLMProviderV2 } from '@main/store/types';
import { useSetting } from '@renderer/hooks/useSetting';
import { Button } from '@renderer/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@renderer/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Input } from '@renderer/components/ui/input';
import { DragArea } from '@renderer/components/Common/drag';
import { BROWSER_OPERATOR } from '@renderer/const';

import { PresetImport } from './PresetImport';
import { Tabs, TabsList, TabsTrigger } from '@renderer/components/ui/tabs';
import { PresetBanner } from './PresetBanner';

import googleIcon from '@resources/icons/google-color.svg?url';
import bingIcon from '@resources/icons/bing-color.svg?url';
import baiduIcon from '@resources/icons/baidu-color.svg?url';
import { REPO_OWNER, REPO_NAME } from '@main/shared/constants';
import { DailyReportSettingsPanel } from '@renderer/components/Settings/category/dailyReport';

// 定义表单验证 schema
const formSchema = z.object({
  language: z.enum(['en', 'zh']),
  vlmProvider: z.nativeEnum(VLMProviderV2, {
    message: 'Please select a VLM Provider to enhance resolution',
  }),
  vlmBaseUrl: z.string().url(),
  vlmApiKey: z.string().min(1),
  vlmModelName: z.string().min(1),
  maxLoopCount: z.number().min(25).max(200),
  loopIntervalInMs: z.number().min(0).max(3000),
  searchEngineForBrowser: z.nativeEnum(SearchEngineForSettings),
  reportStorageBaseUrl: z.string().optional(),
  utioBaseUrl: z.string().optional(),
  // ASR Settings
  asrAppKey: z.string().optional(),
  asrAccessKey: z.string().optional(),
  asrWsUrl: z.string().optional(),
  // LLM Settings
  llmBaseUrl: z.string().url().optional().or(z.literal('')),
  llmApiKey: z.string().optional(),
  llmModelName: z.string().optional(),
  llmReasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  llmUseResponsesApi: z.boolean().optional(),
});

const SECTIONS = {
  vlm: 'VLM Settings',
  llm: 'LLM Settings',
  chat: 'Chat Settings',
  asr: 'ASR Settings',
  report: 'Report Settings',
  dailyReport: 'Daily Report',
  general: 'General',
} as const;

export default function Settings() {
  const navigate = useNavigate();
  const { settings, updateSetting, clearSetting, updatePresetFromRemote } =
    useSetting();
  const [isPresetModalOpen, setPresetModalOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('vlm');
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateDetail, setUpdateDetail] = useState<{
    currentVersion: string;
    version: string;
    link: string | null;
  } | null>();
  // LLM Settings states
  const [showLLMPassword, setShowLLMPassword] = useState(false);
  const [llmCheckState, setLlmCheckState] = useState<{
    status: 'idle' | 'checking' | 'success' | 'error';
    message?: string;
    responseApiSupported?: boolean;
  }>({ status: 'idle' });

  const handleCheckForUpdates = async () => {
    setUpdateLoading(true);
    try {
      const detail = await api.checkForUpdatesDetail();
      console.log('detail', detail);

      if (detail.updateInfo) {
        setUpdateDetail({
          currentVersion: detail.currentVersion,
          version: detail.updateInfo.version,
          link: `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${detail.updateInfo.version}`,
        });
        return;
      } else if (!detail.isPackaged) {
        toast.info('Unpackaged version does not support update check!');
      } else {
        toast.success('No update available', {
          description: `current version: ${detail.currentVersion} is the latest version`,
          position: 'top-right',
          richColors: true,
        });
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setUpdateLoading(false);
    }
  };

  const isRemoteAutoUpdatedPreset =
    settings?.presetSource?.type === 'remote' &&
    settings.presetSource.autoUpdate;

  console.log('initialValues', settings);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      language: 'en',
      vlmBaseUrl: '',
      vlmApiKey: '',
      vlmModelName: '',
      maxLoopCount: 100,
      loopIntervalInMs: 1000,
      reportStorageBaseUrl: '',
      searchEngineForBrowser: SearchEngineForSettings.GOOGLE,
      utioBaseUrl: '',
      asrAppKey: '',
      asrAccessKey: '',
      asrWsUrl: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
      // LLM Settings
      llmBaseUrl: '',
      llmApiKey: '',
      llmModelName: '',
      llmReasoningEffort: 'low',
      llmUseResponsesApi: false,
      ...settings,
    },
  });
  useEffect(() => {
    if (Object.keys(settings)) {
      form.reset({
        language: settings.language,
        vlmProvider: settings.vlmProvider,
        vlmBaseUrl: settings.vlmBaseUrl,
        vlmApiKey: settings.vlmApiKey,
        vlmModelName: settings.vlmModelName,
        maxLoopCount: settings.maxLoopCount,
        loopIntervalInMs: settings.loopIntervalInMs,
        searchEngineForBrowser: settings.searchEngineForBrowser,
        reportStorageBaseUrl: settings.reportStorageBaseUrl,
        utioBaseUrl: settings.utioBaseUrl,
        asrAppKey: settings.asrAppKey,
        asrAccessKey: settings.asrAccessKey,
        asrWsUrl:
          settings.asrWsUrl ||
          'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel',
        // LLM Settings
        llmBaseUrl: settings.llmBaseUrl || '',
        llmApiKey: settings.llmApiKey || '',
        llmModelName: settings.llmModelName || '',
        llmReasoningEffort: settings.llmReasoningEffort || 'low',
        llmUseResponsesApi: settings.llmUseResponsesApi || false,
      });
    }
  }, [settings, form]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.5 },
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (section: string) => {
    sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth' });
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    console.log('onSubmit', values);

    updateSetting(values);
    toast.success('Settings saved successfully');
    navigate(-1);
  };

  const onCancel = () => {
    navigate(-1);
  };

  const handlePresetModal = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setPresetModalOpen(true);
  };

  const handleUpdatePreset = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await updatePresetFromRemote();
      toast.success('Preset updated successfully');
    } catch (error) {
      toast.error('Failed to update preset', {
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };

  const handleResetPreset = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    await window.electron.setting.resetPreset();
    toast.success('Reset to manual mode successfully', {
      duration: 1500,
    });
  };

  const handleClearSettings = async () => {
    try {
      await clearSetting();
      toast.success('All settings cleared successfully');
    } catch (error) {
      toast.error('Failed to clear settings', {
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white">
      <DragArea />

      <div className="flex-1 flex gap-4 p-6 overflow-hidden">
        <Tabs
          orientation="vertical"
          value={activeSection}
          onValueChange={scrollToSection}
          className="w-34 shrink-0"
        >
          <TabsList className="flex flex-col h-auto bg-transparent p-0">
            {Object.entries(SECTIONS).map(([key, label]) => (
              <TabsTrigger
                key={key}
                value={key}
                className="justify-start w-full rounded-none border-0 border-l-4 data-[state=active]:shadow-none data-[state=active]:border-primary mb-1"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <ScrollArea className="flex-1">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div
                id="vlm"
                ref={(el) => {
                  sectionRefs.current.vlm = el;
                }}
                className="space-y-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.vlm}</h2>
                {!isRemoteAutoUpdatedPreset && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePresetModal}
                  >
                    Import Preset Config
                  </Button>
                )}
                {isRemoteAutoUpdatedPreset && (
                  <PresetBanner
                    url={settings.presetSource?.url}
                    date={settings.presetSource?.lastUpdated}
                    handleUpdatePreset={handleUpdatePreset}
                    handleResetPreset={handleResetPreset}
                  />
                )}
                {/* Model Settings Fields */}
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel>Language</FormLabel>
                        <Select
                          disabled={isRemoteAutoUpdatedPreset}
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select language" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="en">English</SelectItem>
                            <SelectItem value="zh">中文</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    );
                  }}
                />
                {/* VLM Provider */}
                <FormField
                  control={form.control}
                  name="vlmProvider"
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel>VLM Provider</FormLabel>
                        <Select
                          disabled={isRemoteAutoUpdatedPreset}
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select VLM provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.values(VLMProviderV2).map((provider) => (
                              <SelectItem key={provider} value={provider}>
                                {provider}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                {/* VLM Base URL */}
                <FormField
                  control={form.control}
                  name="vlmBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VLM Base URL</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="Enter VLM Base URL"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* VLM API Key */}
                <FormField
                  control={form.control}
                  name="vlmApiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VLM API Key</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="Enter VLM API_Key"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {/* VLM Model Name */}
                <FormField
                  control={form.control}
                  name="vlmModelName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>VLM Model Name</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="Enter VLM Model Name"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* LLM Settings */}
              <div
                id="llm"
                ref={(el) => {
                  sectionRefs.current.llm = el;
                }}
                className="space-y-6 pt-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.llm}</h2>
                {/* LLM Base URL */}
                <FormField
                  control={form.control}
                  name="llmBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>LLM Base URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter LLM Base URL (e.g., https://ark.cn-beijing.volces.com/api/v3)"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* LLM API Key */}
                <FormField
                  control={form.control}
                  name="llmApiKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>API Key</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showLLMPassword ? 'text' : 'password'}
                            placeholder="Enter API Key"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                            onClick={() => setShowLLMPassword(!showLLMPassword)}
                          >
                            {showLLMPassword ? (
                              <Eye className="h-4 w-4 text-gray-500" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-gray-500" />
                            )}
                          </Button>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
                {/* LLM Model Name */}
                <FormField
                  control={form.control}
                  name="llmModelName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter Model Name (e.g., doubao-seed-1-8)"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                {/* Reasoning Effort */}
                <FormField
                  control={form.control}
                  name="llmReasoningEffort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reasoning Effort</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select reasoning effort" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minimal">Minimal</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Use Response API */}
                <FormField
                  control={form.control}
                  name="llmUseResponsesApi"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Use Response API</FormLabel>
                      <FormControl>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={(e) => field.onChange(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-500">
                            Use OpenAI Response API instead of Chat Completions
                            API
                          </span>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
                {/* Check Model Availability */}
                <div className="space-y-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={async (e) => {
                      e.preventDefault();
                      const llmBaseUrl = form.getValues('llmBaseUrl');
                      const llmApiKey = form.getValues('llmApiKey');
                      const llmModelName = form.getValues('llmModelName');

                      if (!llmBaseUrl || !llmApiKey || !llmModelName) {
                        toast.error(
                          'Please fill in all required fields before checking model availability',
                        );
                        return;
                      }

                      setLlmCheckState({ status: 'checking' });

                      try {
                        const modelConfig = {
                          baseUrl: llmBaseUrl,
                          apiKey: llmApiKey,
                          modelName: llmModelName,
                        };
                        const [isAvailable, responseApiSupported] =
                          await Promise.all([
                            api.checkLLMModelAvailability(modelConfig),
                            api.checkLLMResponseApiSupport(modelConfig),
                          ]);

                        if (isAvailable) {
                          setLlmCheckState({
                            status: 'success',
                            message: `Model "${llmModelName}" is available${
                              responseApiSupported
                                ? '. Response API is supported.'
                                : '. Response API is not supported.'
                            }`,
                            responseApiSupported,
                          });
                        } else {
                          setLlmCheckState({
                            status: 'error',
                            message: `Model "${llmModelName}" is not responding correctly`,
                          });
                        }
                      } catch (error) {
                        setLlmCheckState({
                          status: 'error',
                          message: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        });
                      }
                    }}
                    disabled={llmCheckState.status === 'checking'}
                    className="w-50"
                  >
                    {llmCheckState.status === 'checking' ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Checking Model...
                      </>
                    ) : (
                      'Check Model Availability'
                    )}
                  </Button>

                  {llmCheckState.status === 'success' && (
                    <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3">
                      <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                      <p className="text-sm text-green-800">
                        {llmCheckState.message}
                      </p>
                    </div>
                  )}

                  {llmCheckState.status === 'error' && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                      <p className="text-sm text-red-800">
                        {llmCheckState.message}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Chat Settings */}
              <div
                id="chat"
                ref={(el) => {
                  sectionRefs.current.chat = el;
                }}
                className="space-y-6 pt-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.chat}</h2>
                <FormField
                  control={form.control}
                  name="maxLoopCount"
                  render={({ field }) => {
                    // console.log('field', field);
                    return (
                      <FormItem>
                        <FormLabel>Max Loop</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            // disabled={isRemoteAutoUpdatedPreset}
                            placeholder="Enter a number between 25-200"
                            {...field}
                            value={field.value === 0 ? '' : field.value}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
                <FormField
                  control={form.control}
                  name="loopIntervalInMs"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loop Wait Time (ms)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          // disabled={isRemoteAutoUpdatedPreset}
                          placeholder="Enter a number between 0-3000"
                          {...field}
                          value={field.value === 0 ? '' : field.value}
                          onChange={(e) =>
                            field.onChange(Number(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="searchEngineForBrowser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Search engine for {BROWSER_OPERATOR}:
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-[124px]">
                            <SelectValue placeholder="Select a search engine" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={SearchEngineForSettings.GOOGLE}>
                            <div className="flex items-center gap-2">
                              <img
                                src={googleIcon}
                                alt="Google"
                                className="w-4 h-4"
                              />
                              <span>Google</span>
                            </div>
                          </SelectItem>
                          <SelectItem value={SearchEngineForSettings.BING}>
                            <div className="flex items-center gap-2">
                              <img
                                src={bingIcon}
                                alt="Bing"
                                className="w-4 h-4"
                              />
                              <span>Bing</span>
                            </div>
                          </SelectItem>
                          <SelectItem value={SearchEngineForSettings.BAIDU}>
                            <div className="flex items-center gap-2">
                              <img
                                src={baiduIcon}
                                alt="Baidu"
                                className="w-4 h-4"
                              />
                              <span>Baidu</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ASR Settings */}
              <div
                id="asr"
                ref={(el) => {
                  sectionRefs.current.asr = el;
                }}
                className="space-y-6 pt-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.asr}</h2>
                {/* ASR APP Key */}
                <FormField
                  control={form.control}
                  name="asrAppKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>APP Key</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter ASR APP Key" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* ASR Access Key */}
                <FormField
                  control={form.control}
                  name="asrAccessKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Access Key</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter ASR Access Key"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* ASR WebSocket URL */}
                <FormField
                  control={form.control}
                  name="asrWsUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WebSocket URL</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select ASR WebSocket URL" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="wss://openspeech.bytedance.com/api/v3/sauc/bigmodel">
                            实时识别（bigmodel）
                          </SelectItem>
                          <SelectItem value="wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async">
                            异步识别（bigmodel_async）
                          </SelectItem>
                          <SelectItem value="wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream">
                            非流式识别（bigmodel_nostream）
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div
                id="report"
                ref={(el) => {
                  sectionRefs.current.report = el;
                }}
                className="space-y-6 pt-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.report}</h2>
                {/* Report Settings Fields */}
                <FormField
                  control={form.control}
                  name="reportStorageBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Report Storage Base URL</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="https://your-report-storage-endpoint.com/upload"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* UTIO Base URL */}
                <FormField
                  control={form.control}
                  name="utioBaseUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>UTIO Base URL</FormLabel>
                      <FormControl>
                        <Input
                          disabled={isRemoteAutoUpdatedPreset}
                          placeholder="https://your-utio-endpoint.com/collect"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="h-50"></div>
              </div>

              {/* Daily Report Settings */}
              <div
                id="dailyReport"
                ref={(el) => {
                  sectionRefs.current.dailyReport = el;
                }}
                className="space-y-6 pt-6 ml-1 mr-4"
              >
                <DailyReportSettingsPanel />
                <div className="h-50"></div>
              </div>

              <div
                id="general"
                ref={(el) => {
                  sectionRefs.current.general = el;
                }}
                className="space-y-6 ml-1 mr-4"
              >
                <h2 className="text-lg font-medium">{SECTIONS.general}</h2>
                <Button
                  variant="outline"
                  type="button"
                  disabled={updateLoading}
                  onClick={handleCheckForUpdates}
                >
                  <RefreshCcw
                    className={`h-4 w-4 mr-2 ${updateLoading ? 'animate-spin' : ''}`}
                  />
                  {updateLoading ? 'Checking...' : 'Check Updates'}
                </Button>
                {updateDetail?.version && (
                  <div className="text-sm text-gray-500">
                    {`${updateDetail.currentVersion} -> ${updateDetail.version}(latest)`}
                  </div>
                )}
                {updateDetail?.link && (
                  <div className="text-sm text-gray-500">
                    Release Notes:{' '}
                    <a
                      href={updateDetail.link}
                      target="_blank"
                      className="underline"
                      rel="noreferrer"
                    >
                      {updateDetail.link}
                    </a>
                  </div>
                )}
                <div className="h-50" />
              </div>
            </form>
          </Form>
        </ScrollArea>
      </div>

      <div className="border-t p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            type="button"
            className="text-red-400 border-red-400 hover:bg-red-50 hover:text-red-500"
            onClick={handleClearSettings}
          >
            <Trash className="h-4 w-4" />
            Clear
          </Button>
          <div className="flex gap-4">
            <Button variant="outline" type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" onClick={form.handleSubmit(onSubmit)}>
              Save
            </Button>
          </div>
        </div>
      </div>

      <PresetImport
        isOpen={isPresetModalOpen}
        onClose={() => setPresetModalOpen(false)}
      />
    </div>
  );
}

export { Settings as Component };
