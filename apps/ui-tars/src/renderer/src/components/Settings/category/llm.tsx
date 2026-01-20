/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, EyeOff, Eye } from 'lucide-react';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
import { Input } from '@renderer/components/ui/input';
import { Switch } from '@renderer/components/ui/switch';
import { Alert, AlertDescription } from '@renderer/components/ui/alert';
import { cn } from '@renderer/utils';
import { api } from '@/renderer/src/api';

const formSchema = z.object({
  llmBaseUrl: z.string().url().optional().or(z.literal('')),
  llmApiKey: z.string().optional(),
  llmModelName: z.string().optional(),
  llmReasoningEffort: z.enum(['minimal', 'low', 'medium', 'high']).optional(),
  llmUseResponsesApi: z.boolean().optional(),
});

interface LLMSettingsProps {
  className?: string;
}

export function LLMSettings({ className }: LLMSettingsProps) {
  const { settings, updateSetting } = useSetting();
  const [showPassword, setShowPassword] = useState(false);
  const [llmCheckState, setLlmCheckState] = useState<{
    status: 'idle' | 'checking' | 'success' | 'error';
    message?: string;
    responseApiSupported?: boolean;
  }>({ status: 'idle' });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      llmBaseUrl: '',
      llmApiKey: '',
      llmModelName: '',
      llmReasoningEffort: 'low',
      llmUseResponsesApi: false,
    },
  });

  useEffect(() => {
    if (Object.keys(settings).length) {
      form.reset({
        llmBaseUrl: settings.llmBaseUrl || '',
        llmApiKey: settings.llmApiKey || '',
        llmModelName: settings.llmModelName || '',
        llmReasoningEffort: settings.llmReasoningEffort || 'low',
        llmUseResponsesApi: settings.llmUseResponsesApi || false,
      });
    }
  }, [settings, form]);

  const [newBaseUrl, newApiKey, newModelName, newReasoningEffort, newUseResponsesApi] =
    form.watch([
      'llmBaseUrl',
      'llmApiKey',
      'llmModelName',
      'llmReasoningEffort',
      'llmUseResponsesApi',
    ]);

  useEffect(() => {
    const hasChanged =
      newBaseUrl !== (settings.llmBaseUrl || '') ||
      newApiKey !== (settings.llmApiKey || '') ||
      newModelName !== (settings.llmModelName || '') ||
      newReasoningEffort !== (settings.llmReasoningEffort || 'low') ||
      newUseResponsesApi !== (settings.llmUseResponsesApi || false);

    if (hasChanged) {
      const values = form.getValues();
      updateSetting(values);
    }
  }, [
    newBaseUrl,
    newApiKey,
    newModelName,
    newReasoningEffort,
    newUseResponsesApi,
  ]);

  const handleCheckModelAvailability = async () => {
    const llmBaseUrl = form.getValues('llmBaseUrl');
    const llmApiKey = form.getValues('llmApiKey');
    const llmModelName = form.getValues('llmModelName');

    if (!llmBaseUrl || !llmApiKey || !llmModelName) {
      toast.error('Please fill in all required fields before checking model availability');
      return;
    }

    setLlmCheckState({ status: 'checking' });

    try {
      const modelConfig = {
        baseUrl: llmBaseUrl,
        apiKey: llmApiKey,
        modelName: llmModelName,
      };
      const [isAvailable, responseApiSupported] = await Promise.all([
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
  };

  return (
    <div className={cn('space-y-6', className)}>
      <Form {...form}>
        <form className="space-y-6">
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

          {/* API Key */}
          <FormField
            control={form.control}
            name="llmApiKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>API Key</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter API Key"
                      {...field}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <Eye className="h-4 w-4 text-gray-500" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-500" />
                      )}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Model Name */}
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
                <FormMessage />
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
                <div className="flex items-center justify-between space-y-0">
                  <FormLabel>Use Response API</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </div>
                <p className="text-sm text-muted-foreground">
                  Use OpenAI Response API instead of Chat Completions API
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Check Model Availability */}
          <div className="space-y-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCheckModelAvailability}
              disabled={llmCheckState.status === 'checking'}
              className="w-full"
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
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  {llmCheckState.message}
                </AlertDescription>
              </Alert>
            )}

            {llmCheckState.status === 'error' && (
              <Alert className="border-red-200 bg-red-50">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {llmCheckState.message}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
