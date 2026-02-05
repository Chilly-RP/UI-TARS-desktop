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

    const prompt = `Analyze these ${imageContents.length} screenshots from a computer user's daily activity.
For each screenshot, identify:
1. The active application/website
2. What the user appears to be doing
3. Key topics or subjects visible

Then provide a brief overall summary of the activities shown.

Respond in JSON format:
{
  "analyses": [
    {
      "index": 0,
      "activeApp": "app name",
      "activity": "brief description",
      "topics": ["topic1", "topic2"]
    }
  ],
  "overallSummary": "brief summary of all activities",
  "mainTopics": ["main topic 1", "main topic 2"]
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
          summary: analysis?.activity || 'Unknown activity',
          topics: analysis?.topics || [],
          activeApp: analysis?.activeApp || 'Unknown',
        };
      });

      const startTime = new Date(batch[0].timestamp);
      const endTime = new Date(batch[batch.length - 1].timestamp);
      const timeRange = `${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}`;

      return {
        timeRange,
        summary: parsed.overallSummary || 'Activity analysis',
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
    const timeRange = `${startTime.toLocaleTimeString()} - ${endTime.toLocaleTimeString()}`;

    return {
      timeRange,
      summary: 'Activity recorded (analysis unavailable)',
      topics: [],
      analyses: batch.map((s) => ({
        screenshotId: s.id,
        timestamp: s.timestamp,
        summary: 'Screenshot captured',
        topics: [],
        activeApp: 'Unknown',
      })),
    };
  }
}
