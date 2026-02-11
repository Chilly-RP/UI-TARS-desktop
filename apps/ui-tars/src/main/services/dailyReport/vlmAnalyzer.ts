/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { logger } from '@main/logger';
import { SettingStore } from '@main/store/setting';
import { DailyReportStore } from '@main/store/dailyReportStore';
import { TerminalActivityContext, DeepInsights } from '@main/store/types';
import { CapturedScreenshot } from './screenshotCapture';

export interface ScreenshotAnalysis {
  screenshotId: string;
  timestamp: number;
  summary: string;
  topics: string[];
  activeApp: string;
  project?: string;
  workPhase?: string;
  blockerSignal?: string;
}

export interface BatchAnalysisResult {
  timeRange: string;
  summary: string;
  topics: string[];
  analyses: ScreenshotAnalysis[];
  keyAccomplishments?: string[];
  blockers?: string[];
}

const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export class VLMAnalyzer {
  private readonly BATCH_SIZE = 10;
  private readonly FETCH_TIMEOUT_MS = 120_000; // 2 分钟超时
  private readonly MAX_RETRIES = 2;
  private readonly RETRY_BASE_DELAY_MS = 2000;

  /**
   * Get model config based on daily report VLM settings
   */
  private getModelConfig(): { baseUrl: string; apiKey: string; modelName: string; extraBody?: Record<string, unknown> } | null {
    const drSettings = DailyReportStore.getSettings();
    const mainSettings = SettingStore.getStore();

    if (drSettings.vlmModelName === 'default' || !drSettings.vlmModelName) {
      if (!mainSettings.vlmBaseUrl || !mainSettings.vlmApiKey) return null;
      return {
        baseUrl: mainSettings.vlmBaseUrl,
        // secretlint-disable-next-line
        apiKey: mainSettings.vlmApiKey,
        modelName: mainSettings.vlmModelName,
      };
    }

    // qwen3-vl-plus / qwen3-vl-flash
    if (!drSettings.vlmApiKey) return null;
    return {
      baseUrl: QWEN_BASE_URL,
      // secretlint-disable-next-line
      apiKey: drSettings.vlmApiKey,
      modelName: drSettings.vlmModelName,
      extraBody: { enable_thinking: false, thinking_budget: 81920 },
    };
  }

  /**
   * Analyze screenshots in batches using VLM
   */
  async analyzeScreenshots(
    screenshots: CapturedScreenshot[],
    getBase64Fn: (filePath: string) => string | null,
    terminalContext?: TerminalActivityContext,
    insights?: DeepInsights,
    onBatchProgress?: (batchIndex: number, totalBatches: number) => void,
    signal?: AbortSignal,
  ): Promise<BatchAnalysisResult[]> {
    if (screenshots.length === 0) {
      return [];
    }

    logger.log(
      `VLMAnalyzer: Analyzing ${screenshots.length} screenshots`,
    );

    // Split into batches
    const batches: CapturedScreenshot[][] = [];
    for (let i = 0; i < screenshots.length; i += this.BATCH_SIZE) {
      batches.push(screenshots.slice(i, i + this.BATCH_SIZE));
    }

    const results: BatchAnalysisResult[] = [];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      if (signal?.aborted) break;
      onBatchProgress?.(batchIdx, batches.length);
      let success = false;
      for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
        try {
          if (attempt > 0) {
            const delay = this.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            logger.log(`VLMAnalyzer: 批次 ${batchIdx + 1}/${batches.length} 第 ${attempt + 1} 次重试，等待 ${delay}ms`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
          logger.log(`VLMAnalyzer: 处理批次 ${batchIdx + 1}/${batches.length}（${batches[batchIdx].length} 张截图）`);
          const batchResult = await this.analyzeBatch(
            batches[batchIdx],
            getBase64Fn,
            terminalContext,
            insights,
            batchIdx,
            batches.length,
            signal,
          );
          if (batchResult) {
            results.push(batchResult);
          }
          success = true;
          break;
        } catch (error) {
          logger.error(`VLMAnalyzer: 批次 ${batchIdx + 1}/${batches.length} 失败（尝试 ${attempt + 1}/${this.MAX_RETRIES + 1}）`, error);
        }
      }
      if (!success) {
        logger.warn(`VLMAnalyzer: 批次 ${batchIdx + 1}/${batches.length} 所有重试均失败，使用 fallback`);
        results.push(this.createFallbackResult(batches[batchIdx]));
      }
    }

    return results;
  }

  /**
   * Analyze a batch of screenshots
   */
  private async analyzeBatch(
    batch: CapturedScreenshot[],
    getBase64Fn: (filePath: string) => string | null,
    terminalContext?: TerminalActivityContext,
    insights?: DeepInsights,
    batchIndex: number = 0,
    totalBatches: number = 1,
    externalSignal?: AbortSignal,
  ): Promise<BatchAnalysisResult | null> {
    const modelConfig = this.getModelConfig();

    if (!modelConfig) {
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

    // Build context sections
    let contextText = '';

    // Terminal context
    if (terminalContext) {
      const cmdsForVlm = terminalContext.shellHistoryHasTimestamps
        ? [...terminalContext.windowTitleCommands, ...terminalContext.shellHistoryCommands]
        : [...terminalContext.windowTitleCommands];

      const merged = new Map<string, { count: number; examples: Set<string> }>();
      for (const cmd of cmdsForVlm) {
        const existing = merged.get(cmd.baseCommand);
        if (existing) {
          existing.count += cmd.count;
          for (const ex of cmd.examples) {
            if (existing.examples.size < 3) existing.examples.add(ex);
          }
        } else {
          merged.set(cmd.baseCommand, { count: cmd.count, examples: new Set(cmd.examples) });
        }
      }

      if (merged.size > 0) {
        const lines = Array.from(merged.entries())
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 10)
          .map(([base, { count, examples }]) => {
            const exList = Array.from(examples).slice(0, 2).map((e) => `"${e}"`).join(', ');
            return `- ${base}: ${count}次，示例: ${exList}`;
          });
        contextText += `\n\n用户今日的终端命令活动：\n${lines.join('\n')}`;
      }
    }

    // Project context from insights
    if (insights && insights.projects.length > 0) {
      const topProjects = insights.projects
        .filter((p) => p.projectName !== '其他')
        .slice(0, 5);
      if (topProjects.length > 0) {
        const projectLines = topProjects.map((p) => {
          const mins = Math.floor(p.totalDuration / (1000 * 60));
          let line = `- ${p.projectName}（${mins}分钟，涉及: ${p.apps.join('、')}`;
          if (p.subModules && p.subModules.length > 0) {
            line += `，子模块: ${p.subModules.join('、')}`;
          }
          line += '）';
          return line;
        });
        contextText += `\n\n用户今日的项目上下文：\n${projectLines.join('\n')}`;
      }
    }

    // Efficiency context from insights
    if (insights) {
      const { focusMetrics } = insights;
      const effLines: string[] = [];
      if (focusMetrics.totalDeepWorkMs > 0) {
        const ratio = Math.round(focusMetrics.deepWorkRatio * 100);
        effLines.push(`- 深度工作占比：${ratio}%`);
      }
      if (focusMetrics.distractionSources.length > 0) {
        const distractions = focusMetrics.distractionSources
          .slice(0, 3)
          .map((d) => `${d.appName}(${d.interruptions}次)`)
          .join('、');
        effLines.push(`- 主要干扰源：${distractions}`);
      }
      for (const signal of focusMetrics.frustrationSignals.slice(0, 2)) {
        effLines.push(`- ${signal.description}（${signal.timeRange}）`);
      }
      if (effLines.length > 0) {
        contextText += `\n\n用户今日的效率数据：\n${effLines.join('\n')}`;
      }
    }

    const batchHint = totalBatches > 1
      ? `\n\n这是第 ${batchIndex + 1}/${totalBatches} 批截图。`
      : '';

    const prompt = `你是一个工作效率分析专家。分析以下 ${imageContents.length} 张来自电脑用户日常活动的截图，结合上下文信息，提供深度工作洞察。
${contextText}${batchHint}

请分析每张截图并提供结构化洞察。

重要：
- 对于每张截图的 activity 描述，请尽量具体（如具体文件名、页面内容、操作类型），不要只说"编码"或"浏览"
- 根据终端命令的完整内容推断用户的具体活动意图
- overallSummary 聚焦本批截图特有的工作内容，重点描述"做了什么"而非"在用什么工具"
- keyAccomplishments 请关联到具体文件或功能模块
- blockerSignal 请包含完整的错误信息文本（如截图中可见），识别错误信息、异常堆栈、构建失败等

请用中文回复，使用以下 JSON 格式：
{
  "analyses": [
    {
      "index": 0,
      "activeApp": "应用名称",
      "activity": "详细描述（具体文件/页面/操作）",
      "project": "关联项目名或null",
      "workPhase": "coding|debugging|documentation|research|communication|other",
      "topics": ["话题1", "话题2"],
      "blockerSignal": "截图中可见的错误/异常信息，或null"
    }
  ],
  "overallSummary": "本批截图的叙事性总结",
  "keyAccomplishments": ["完成的关键事项（关联具体文件/模块）"],
  "blockers": ["遇到的困难或阻塞"],
  "mainTopics": ["主要话题1", "主要话题2"]
}`;

    const timeoutSignal = AbortSignal.timeout(this.FETCH_TIMEOUT_MS);
    const combinedSignal = externalSignal
      ? AbortSignal.any([timeoutSignal, externalSignal])
      : timeoutSignal;

    const response = await fetch(`${modelConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // secretlint-disable-next-line
        Authorization: `Bearer ${modelConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: modelConfig.modelName,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: prompt }, ...imageContents],
          },
        ],
        max_tokens: 3000,
        temperature: 0.3,
        ...(modelConfig.extraBody || {}),
      }),
      signal: combinedSignal,
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
          project: analysis?.project || undefined,
          workPhase: analysis?.workPhase || undefined,
          blockerSignal: analysis?.blockerSignal || undefined,
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
        keyAccomplishments: parsed.keyAccomplishments || undefined,
        blockers: parsed.blockers || undefined,
      };
    } catch (error) {
      logger.error('VLMAnalyzer: Failed to parse VLM response', error);
      return this.createFallbackResult(batch);
    }
  }

  /**
   * Refine narrative by calling LLM to merge multiple batch summaries into one cohesive text
   */
  async refineNarrative(results: BatchAnalysisResult[], signal?: AbortSignal): Promise<string | null> {
    const summaries = results
      .map((r) => r.summary)
      .filter((s) => s && s !== '已记录活动（分析不可用）');

    if (summaries.length <= 1) {
      return null;
    }

    const modelConfig = this.getModelConfig();
    if (!modelConfig) {
      return null;
    }

    const prompt = `你是一个工作效率分析专家。以下是对用户一天工作截图的多段分批摘要，请将它们合并为一段 3-5 句的简洁叙述。

要求：
- 突出关键工作成果和主要活动
- 去除重复内容，保持语言简洁
- 不要使用"本批截图"等分析性措辞，直接描述用户做了什么
- 使用中文

多段摘要：
${summaries.map((s, i) => `[${i + 1}] ${s}`).join('\n')}

请直接输出合并后的摘要文本，不要使用 JSON 格式。`;

    const timeoutSignal = AbortSignal.timeout(this.FETCH_TIMEOUT_MS);
    const combinedSignal = signal
      ? AbortSignal.any([timeoutSignal, signal])
      : timeoutSignal;

    try {
      const response = await fetch(`${modelConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // secretlint-disable-next-line
          Authorization: `Bearer ${modelConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: modelConfig.modelName,
          messages: [
            { role: 'user', content: prompt },
          ],
          max_tokens: 500,
          temperature: 0.3,
          ...(modelConfig.extraBody || {}),
        }),
        signal: combinedSignal,
      });

      if (!response.ok) {
        throw new Error(`VLM API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error('No content in refine narrative response');
      }

      logger.log('VLMAnalyzer: Narrative refined successfully');
      return content;
    } catch (error) {
      logger.error('VLMAnalyzer: Failed to refine narrative', error);
      return null;
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
