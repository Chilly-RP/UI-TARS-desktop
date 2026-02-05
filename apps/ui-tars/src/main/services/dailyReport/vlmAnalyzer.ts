/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { logger } from '@main/logger';
import { SettingStore } from '@main/store/setting';
import { CapturedScreenshot } from './screenshotCapture';

export interface ScreenshotAnalysis {
  screenshotId: string;
  timestamp: number;
  summary: string;
  topics: string[];
  activeApp: string;
}

export interface BatchAnalysisResult {
  timeRange: string;
  summary: string;
  topics: string[];
  analyses: ScreenshotAnalysis[];
}

export class VLMAnalyzer {
  private readonly BATCH_SIZE = 10;
  private readonly MAX_SAMPLES = 50;

  /**
   * Analyze screenshots in batches using VLM
   */
  async analyzeScreenshots(
    screenshots: CapturedScreenshot[],
    getBase64Fn: (filePath: string) => string | null,
  ): Promise<BatchAnalysisResult[]> {
    if (screenshots.length === 0) {
      return [];
    }

    // Sample if too many screenshots
    const sampled = this.sampleScreenshots(screenshots);
    logger.log(
      `VLMAnalyzer: Analyzing ${sampled.length} screenshots (from ${screenshots.length} total)`,
    );

    // Split into batches
    const batches: CapturedScreenshot[][] = [];
    for (let i = 0; i < sampled.length; i += this.BATCH_SIZE) {
      batches.push(sampled.slice(i, i + this.BATCH_SIZE));
    }

    const results: BatchAnalysisResult[] = [];

    for (const batch of batches) {
      try {
        const batchResult = await this.analyzeBatch(batch, getBase64Fn);
        if (batchResult) {
          results.push(batchResult);
        }
      } catch (error) {
        logger.error('VLMAnalyzer: Failed to analyze batch', error);
      }
    }

    return results;
  }

  /**
   * Sample screenshots if there are too many
   */
  private sampleScreenshots(
    screenshots: CapturedScreenshot[],
  ): CapturedScreenshot[] {
    if (screenshots.length <= this.MAX_SAMPLES) {
      return screenshots;
    }

    // Sample evenly distributed screenshots
    const interval = Math.floor(screenshots.length / this.MAX_SAMPLES);
    const sampled: CapturedScreenshot[] = [];

    for (
      let i = 0;
      i < screenshots.length && sampled.length < this.MAX_SAMPLES;
      i += interval
    ) {
      sampled.push(screenshots[i]);
    }

    return sampled;
  }

  /**
   * Analyze a batch of screenshots
   */
  private async analyzeBatch(
    batch: CapturedScreenshot[],
    getBase64Fn: (filePath: string) => string | null,
  ): Promise<BatchAnalysisResult | null> {
    const settings = SettingStore.getStore();

    if (!settings.vlmBaseUrl || !settings.vlmApiKey) {
      logger.warn('VLMAnalyzer: VLM settings not configured');
      return this.createFallbackResult(batch);
    }

    // Build messages with images
    const imageContents: Array<{
      type: 'image_url';
      image_url: { url: string };
    }> = [];

    for (const screenshot of batch) {
      const base64 = getBase64Fn(screenshot.filePath);
      if (base64) {
        imageContents.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${base64}` },
        });
      }
    }

    if (imageContents.length === 0) {
      return null;
    }

    const prompt = `分析这 ${imageContents.length} 张来自电脑用户日常活动的截图。
对于每张截图，请识别：
1. 当前活跃的应用程序/网站
2. 用户正在做什么
3. 可见的关键话题或主题

然后提供所有活动的简要总结。

请用中文回复，使用以下 JSON 格式：
{
  "analyses": [
    {
      "index": 0,
      "activeApp": "应用名称",
      "activity": "简要描述",
      "topics": ["话题1", "话题2"]
    }
  ],
  "overallSummary": "所有活动的简要总结",
  "mainTopics": ["主要话题1", "主要话题2"]
}`;

    try {
      const response = await fetch(`${settings.vlmBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // secretlint-disable-next-line
          Authorization: `Bearer ${settings.vlmApiKey}`,
        },
        body: JSON.stringify({
          model: settings.vlmModelName,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: prompt }, ...imageContents],
            },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`VLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in VLM response');
      }

      return this.parseVLMResponse(content, batch);
    } catch (error) {
      logger.error('VLMAnalyzer: API call failed', error);
      return this.createFallbackResult(batch);
    }
  }

  /**
   * Parse VLM response into structured result
   */
  private parseVLMResponse(
    content: string,
    batch: CapturedScreenshot[],
  ): BatchAnalysisResult {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());

      const analyses: ScreenshotAnalysis[] = batch.map((screenshot, index) => {
        const analysis = parsed.analyses?.find((a: any) => a.index === index);
        return {
          screenshotId: screenshot.id,
          timestamp: screenshot.timestamp,
          summary: analysis?.activity || '未知活动',
          topics: analysis?.topics || [],
          activeApp: analysis?.activeApp || '未知',
        };
      });

      const startTime = new Date(batch[0].timestamp);
      const endTime = new Date(batch[batch.length - 1].timestamp);
      const timeRange = `${startTime.toLocaleTimeString('zh-CN')} - ${endTime.toLocaleTimeString('zh-CN')}`;

      return {
        timeRange,
        summary: parsed.overallSummary || '活动分析',
        topics: parsed.mainTopics || [],
        analyses,
      };
    } catch (error) {
      logger.error('VLMAnalyzer: Failed to parse VLM response', error);
      return this.createFallbackResult(batch);
    }
  }

  /**
   * Create fallback result when VLM analysis fails
   */
  private createFallbackResult(
    batch: CapturedScreenshot[],
  ): BatchAnalysisResult {
    const startTime = new Date(batch[0].timestamp);
    const endTime = new Date(batch[batch.length - 1].timestamp);
    const timeRange = `${startTime.toLocaleTimeString('zh-CN')} - ${endTime.toLocaleTimeString('zh-CN')}`;

    return {
      timeRange,
      summary: '已记录活动（分析不可用）',
      topics: [],
      analyses: batch.map((s) => ({
        screenshotId: s.id,
        timestamp: s.timestamp,
        summary: '已截取屏幕截图',
        topics: [],
        activeApp: '未知',
      })),
    };
  }
}
