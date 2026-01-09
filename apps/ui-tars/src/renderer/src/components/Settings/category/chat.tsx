/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect } from 'react';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { useSetting } from '@renderer/hooks/useSetting';
import {
  Form,
  FormControl,
  FormDescription,
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

const formSchema = z.object({
  language: z.enum(['en', 'zh']),
  maxLoopCount: z.number().min(25).max(200),
  loopIntervalInMs: z.number().min(0).max(3000),
  // Image Compression Settings
  resolutionScaleFactor: z.number().min(0.1).max(1),
  screenshotJpegQuality: z.number().min(1).max(100),
  preprocessPngQuality: z.number().min(1).max(100),
});

export function ChatSettings() {
  const { settings, updateSetting } = useSetting();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      language: undefined,
      maxLoopCount: 25,
      loopIntervalInMs: 1000,
      resolutionScaleFactor: 0.7,
      screenshotJpegQuality: 75,
      preprocessPngQuality: 60,
    },
  });

  const [
    newLanguage,
    newCount,
    newInterval,
    newResolutionScale,
    newJpegQuality,
    newPngQuality,
  ] = form.watch([
    'language',
    'maxLoopCount',
    'loopIntervalInMs',
    'resolutionScaleFactor',
    'screenshotJpegQuality',
    'preprocessPngQuality',
  ]);

  useEffect(() => {
    if (Object.keys(settings).length) {
      form.reset({
        language: settings.language,
        maxLoopCount: settings.maxLoopCount,
        loopIntervalInMs: settings.loopIntervalInMs,
        resolutionScaleFactor: settings.resolutionScaleFactor ?? 0.7,
        screenshotJpegQuality: settings.screenshotJpegQuality ?? 75,
        preprocessPngQuality: settings.preprocessPngQuality ?? 60,
      });
    }
  }, [settings, form]);

  useEffect(() => {
    if (!Object.keys(settings).length) {
      return;
    }
    // Check if all values are at their initial defaults (before settings are loaded)
    const isAtInitialDefaults =
      newLanguage === undefined &&
      newCount === 25 &&
      newInterval === 1000 &&
      newResolutionScale === 0.7 &&
      newJpegQuality === 75 &&
      newPngQuality === 60;
    if (isAtInitialDefaults) {
      return;
    }

    const validAndSave = async () => {
      if (newLanguage !== settings.language) {
        updateSetting({ ...settings, language: newLanguage });
      }

      const isLoopValid = await form.trigger('maxLoopCount');
      if (isLoopValid && newCount !== settings.maxLoopCount) {
        updateSetting({ ...settings, maxLoopCount: newCount });
      }

      const isIntervalValid = await form.trigger('loopIntervalInMs');
      if (isIntervalValid && newInterval !== settings.loopIntervalInMs) {
        updateSetting({ ...settings, loopIntervalInMs: newInterval });
      }

      // Image compression settings
      const isResolutionScaleValid = await form.trigger(
        'resolutionScaleFactor',
      );
      if (
        isResolutionScaleValid &&
        newResolutionScale !== settings.resolutionScaleFactor
      ) {
        updateSetting({
          ...settings,
          resolutionScaleFactor: newResolutionScale,
        });
      }

      const isJpegQualityValid = await form.trigger('screenshotJpegQuality');
      if (
        isJpegQualityValid &&
        newJpegQuality !== settings.screenshotJpegQuality
      ) {
        updateSetting({ ...settings, screenshotJpegQuality: newJpegQuality });
      }

      const isPngQualityValid = await form.trigger('preprocessPngQuality');
      if (
        isPngQualityValid &&
        newPngQuality !== settings.preprocessPngQuality
      ) {
        updateSetting({ ...settings, preprocessPngQuality: newPngQuality });
      }
    };

    validAndSave();
  }, [
    newLanguage,
    newCount,
    newInterval,
    newResolutionScale,
    newJpegQuality,
    newPngQuality,
    settings,
    updateSetting,
    form,
  ]);

  return (
    <>
      <Form {...form}>
        <form className="space-y-8">
          <FormField
            control={form.control}
            name="language"
            render={({ field }) => {
              return (
                <FormItem>
                  <FormLabel>Language</FormLabel>
                  <FormDescription>
                    Control the language used in LLM conversations
                  </FormDescription>
                  <Select onValueChange={field.onChange} value={field.value}>
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
          <FormField
            control={form.control}
            name="maxLoopCount"
            render={({ field }) => {
              // console.log('field', field);
              return (
                <FormItem>
                  <FormLabel>Max Loop</FormLabel>
                  <FormDescription>
                    Enter a number between 25-200
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
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
                <FormDescription>Enter a number between 0-3000</FormDescription>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Enter a number between 0-3000"
                    {...field}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Image Compression Settings */}
          <div className="pt-4 border-t">
            <h3 className="text-lg font-medium mb-4">Image Compression</h3>

            <FormField
              control={form.control}
              name="resolutionScaleFactor"
              render={({ field }) => (
                <FormItem className="mb-6">
                  <FormLabel>Resolution Scale Factor</FormLabel>
                  <FormDescription>
                    Scale factor for screenshot resolution (0.1-1.0). Lower
                    values produce smaller images and faster inference, but may
                    reduce accuracy. Default: 0.7
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="1"
                      placeholder="0.7"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="screenshotJpegQuality"
              render={({ field }) => (
                <FormItem className="mb-6">
                  <FormLabel>Screenshot JPEG Quality</FormLabel>
                  <FormDescription>
                    JPEG compression quality for screenshots (1-100). Lower
                    values produce smaller file sizes but may reduce image
                    clarity. Default: 75
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="75"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="preprocessPngQuality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Preprocess PNG Quality</FormLabel>
                  <FormDescription>
                    PNG quality for image preprocessing before sending to model
                    (1-100). Lower values produce smaller file sizes. Default:
                    60
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      placeholder="60"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </>
  );
}
