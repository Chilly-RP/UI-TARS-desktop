/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@main/logger';
import { type ConversationWithSoM } from '@main/shared/types';
import { UITarsModelConfig } from '@ui-tars/sdk/core';
import OpenAI from 'openai';
import { StateManager } from './stateManager';

/**
 * ActionPredictor 负责管理动作预测逻辑
 */
export class ActionPredictor {
  /**
   * 预测下一个动作
   * @param stateManager 状态管理器
   * @param modelConfig 模型配置
   * @param modelAuthHdrs 模型认证头
   * @param settings 应用设置
   */
  static async predictNextActions(
    stateManager: StateManager,
    modelConfig: UITarsModelConfig,
    modelAuthHdrs: Record<string, string>,
    settings: any,
  ): Promise<void> {
    logger.info('[ActionPredictor] 开始预测下一个动作');

    // 检查最后一个动作是否是 finished
    const currentMessages = stateManager.getCurrentState().messages;
    const lastMessage = currentMessages[currentMessages.length - 1];

    if (!this._hasFinishedAction(lastMessage)) {
      logger.info('[ActionPredictor] 最后一个动作不是 finished，跳过预测');
      return;
    }

    logger.info(
      '[ActionPredictor] 检测到 finished 动作，开始预测下一个用户动作',
    );

    try {
      // 获取 finished 动作的 content
      const finishedAction = lastMessage.predictionParsed?.find(
        (pred) => pred.action_type === 'finished',
      );
      const finishedContent =
        finishedAction?.action_inputs?.content || '任务已完成';

      logger.info('[ActionPredictor] Finished content:', finishedContent);

      // 构建新的 system prompt
      const predictionSystemPrompt =
        this._buildPredictionPrompt(finishedContent);

      // 创建 OpenAI 客户端，使用与 guiAgent 相同的配置
      const openai = this._createOpenAIClient(modelConfig);

      logger.info('[ActionPredictor] 调用模型进行预测（纯文本模式）');

      // 调用模型（纯文本模式，不带图片）
      const predictionResult = await openai.chat.completions.create(
        {
          model: modelConfig.model || settings.vlmModelName,
          messages: [
            {
              role: 'system',
              content: predictionSystemPrompt,
            },
            {
              role: 'user',
              content: '请预测用户接下来可能的操作',
            },
          ],
        },
        {
          timeout: 300000,
          headers: modelAuthHdrs,
        },
      );

      logger.info(
        '[ActionPredictor] 模型预测响应已接收:',
        JSON.stringify(predictionResult),
      );

      const predictionContent = predictionResult.choices?.[0]?.message?.content;

      if (predictionContent) {
        logger.info('[ActionPredictor] 预测的下一个动作:', predictionContent);

        // 将预测结果加入对话框
        const predictionMessage =
          this._createPredictionMessage(predictionContent);
        stateManager.addMessage(predictionMessage);

        logger.info('[ActionPredictor] 预测消息已添加到状态');
      } else {
        logger.warn('[ActionPredictor] 响应中没有预测内容');
      }
    } catch (error) {
      logger.error('[ActionPredictor] 预测下一个动作时出错:', error);
      if (error instanceof Error) {
        logger.error('[ActionPredictor] 错误详情:', {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }
    }
  }

  /**
   * 检查消息是否包含 finished 动作
   */
  private static _hasFinishedAction(
    message: ConversationWithSoM | undefined,
  ): boolean {
    if (!message?.predictionParsed) {
      return false;
    }

    return message.predictionParsed.some(
      (pred) => pred.action_type === 'finished',
    );
  }

  /**
   * 构建预测提示词
   */
  private static _buildPredictionPrompt(finishedContent: string): string {
    return `你是一个GUI Agent，帮助用户来执行任务，用户已经完成了${finishedContent}\n\n
    你需要根据当前已经完成的任务来预测用户接下来可能的1-4个动作，每个动作都用\n分开,动作内容保持精简。
    请按照下面的格式回复：
    接下来要不要我帮您：\n
    xxxx\nxxxx\nxxxx\nxxxx
    例如：用户刚才完成了创建日程，接下来你需要这样回复：
    接下来要不要我帮您：\n
    添加会议参与者\n修改日程时间\n修改日程内容\n删除日程`;
  }

  /**
   * 创建 OpenAI 客户端
   */
  private static _createOpenAIClient(modelConfig: UITarsModelConfig): OpenAI {
    /* secretlint-disable */
    return new OpenAI({
      baseURL: modelConfig.baseURL,
      // secretlint-disable-next-line
      apiKey: modelConfig.apiKey,
      maxRetries: 0,
    });
    /* secretlint-enable */
  }

  /**
   * 创建预测消息
   */
  private static _createPredictionMessage(
    content: string,
  ): ConversationWithSoM {
    return {
      from: 'gpt',
      value: content,
      timing: {
        start: Date.now(),
        end: Date.now(),
        cost: 0,
      },
      // 添加标记，表示这是可点击的建议动作
      isPredictionSuggestions: true,
    };
  }
}
