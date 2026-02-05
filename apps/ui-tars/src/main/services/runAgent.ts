/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert';

import { logger } from '@main/logger';
import { type ConversationWithSoM } from '@main/shared/types';
import { GUIAgent } from '@ui-tars/sdk';
import { GUIAgentData } from '@ui-tars/shared/types';
import { markClickPosition } from '@main/utils/image';
import { UTIOService } from '@main/services/utio';
import { SettingStore } from '@main/store/setting';
import { AppState } from '@main/store/types';
import { GUIAgentManager } from '../ipcRoutes/agent';
import { beforeAgentRun, afterAgentRun } from '../utils/agent';
import { StateManager } from './stateManager';
import { OperatorFactory } from './operatorFactory';
import { SOPExecutor } from './sopExecutor';
import {
  ModelConfigManager,
  type ModelConfigResult,
} from './modelConfigManager';
import { ActionPredictor } from './actionPredictor';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 运行 Agent 的主函数
 * @param setState 设置状态的函数
 * @param getState 获取状态的函数
 */
export const runAgent = async (
  setState: (state: AppState) => void,
  getState: () => AppState,
) => {
  logger.info('[runAgent] 开始运行 Agent');

  // 创建状态管理器
  const stateManager = new StateManager(getState, setState);

  // 清空temp文件夹，为新的任务做准备
  clearTempFolder();

  const settings = SettingStore.getStore();
  const { instructions, abortController } = getState();
  assert(instructions, 'instructions is required');

  const language = settings.language ?? 'en';
  logger.info('[runAgent] settings.operator', settings.operator);

  // 创建 operator 实例
  const operatorResult = await OperatorFactory.createOperator(
    settings.operator,
    getState,
    setState,
    settings,
  );

  if (!operatorResult) {
    logger.error('[runAgent] 无法创建 operator 实例');
    return;
  }

  const { operator, operatorType } = operatorResult;

  // 尝试执行 SOP
  const sopResult = await SOPExecutor.executeSOP(
    instructions,
    operator,
    getState,
    setState,
    abortController || undefined,
  );

  // 如果用户中止了 SOP 执行，则直接返回
  if (sopResult.userAborted) {
    return;
  }

  // 将 SOP 执行过程中的消息添加到历史消息
  if (sopResult.success) {
    stateManager.addHistoryMessages(sopResult.historyMessages);
  }

  // 创建模型配置
  const modelConfigResult = await ModelConfigManager.createModelConfig(
    settings,
    operatorType,
    language,
  );

  // 创建 GUIAgent
  const guiAgent = createGUIAgent(
    operator,
    modelConfigResult,
    stateManager,
    abortController,
    settings,
  );

  GUIAgentManager.getInstance().setAgent(guiAgent);
  UTIOService.getInstance().sendInstruction(instructions);

  // 获取当前的历史消息
  const { sessionHistoryMessages } = getState();

  beforeAgentRun(settings.operator);

  const startTime = Date.now();

  await guiAgent
    .run(instructions, sessionHistoryMessages, modelConfigResult.modelAuthHdrs)
    .catch((e) => {
      logger.error('[runAgentLoop error]', e);
      stateManager.setError(e.message);
    });

  logger.info('[runAgent Total cost]: ', (Date.now() - startTime) / 1000, 's');

  // 执行afterAgentRun，恢复窗口状态
  afterAgentRun(settings.operator);

  // 在afterAgentRun之后执行finished动作预测
  await ActionPredictor.predictNextActions(
    stateManager,
    modelConfigResult.modelConfig,
    modelConfigResult.modelAuthHdrs,
    settings,
  );
};

/**
 * 创建 GUIAgent 实例
 */
const createGUIAgent = (
  operator: any,
  modelConfigResult: ModelConfigResult,
  stateManager: StateManager,
  abortController: AbortController | null,
  settings: any,
): GUIAgent<any> => {
  const handleData = async ({
    data,
    isStreamingUpdate,
  }: {
    data: GUIAgentData;
    isStreamingUpdate?: boolean;
  }) => {
    const lastConv = stateManager.getLastMessage();
    const { status, conversations, ...restUserData } = data;

    // For streaming updates, we update the last message instead of appending
    if (isStreamingUpdate && conversations.length > 0) {
      const streamingConv = conversations[0];
      const currentMessages = stateManager.getCurrentState().messages || [];

      // Find and replace the last streaming message, or append if none exists
      const lastMsgIndex = currentMessages.length - 1;
      const lastMsg = currentMessages[lastMsgIndex];

      let updatedMessages: ConversationWithSoM[];
      if (lastMsg && lastMsg.isStreaming) {
        // Replace the last streaming message
        updatedMessages = [
          ...currentMessages.slice(0, lastMsgIndex),
          { ...streamingConv },
        ];
      } else {
        // Append new streaming message
        updatedMessages = [...currentMessages, { ...streamingConv }];
      }

      stateManager.updateState({
        status,
        restUserData,
        messages: updatedMessages,
      });
      return;
    }

    // add SoM to conversations
    const conversationsWithSoM: ConversationWithSoM[] = await Promise.all(
      conversations.map(async (conv) => {
        const { screenshotContext, predictionParsed } = conv;
        if (
          lastConv?.screenshotBase64 &&
          screenshotContext?.size &&
          predictionParsed
        ) {
          const screenshotBase64WithElementMarker = await markClickPosition({
            screenshotContext,
            base64: lastConv?.screenshotBase64,
            parsed: predictionParsed,
          }).catch((e) => {
            logger.error('[markClickPosition error]:', e);
            return '';
          });
          return {
            ...conv,
            screenshotBase64WithElementMarker,
          };
        }
        return conv;
      }),
    ).catch((e) => {
      logger.error('[conversationsWithSoM error]:', e);
      return conversations;
    });

    const {
      screenshotBase64,
      predictionParsed,
      screenshotContext,
      screenshotBase64WithElementMarker,
      ...rest
    } = conversationsWithSoM?.[conversationsWithSoM.length - 1] || {};
    logger.info(
      '[onGUIAgentData] ======data======\n',
      predictionParsed,
      screenshotContext,
      rest,
      status,
      '\n========',
    );

    // For non-streaming updates, first remove any trailing streaming message
    // then append the final parsed message
    const currentMessages = stateManager.getCurrentState().messages || [];
    const lastMsg = currentMessages[currentMessages.length - 1];
    const messagesWithoutStreaming = lastMsg?.isStreaming
      ? currentMessages.slice(0, -1)
      : currentMessages;

    stateManager.updateState({
      status,
      restUserData,
      messages: [...messagesWithoutStreaming, ...conversationsWithSoM],
    });
  };

  return new GUIAgent({
    model: modelConfigResult.customModel,
    systemPrompt: modelConfigResult.systemPrompt,
    logger,
    signal: abortController?.signal,
    operator,
    onData: handleData,
    onError: (params) => {
      const { error } = params;
      logger.error('[onGUIAgentError]', settings, error);
      stateManager.setError(
        JSON.stringify({
          status: error?.status,
          message: error?.message,
          stack: error?.stack,
        }),
      );
    },
    retry: {
      model: { maxRetries: 5 },
      screenshot: { maxRetries: 5 },
      execute: { maxRetries: 1 },
    },
    maxLoopCount: settings.maxLoopCount,
    loopIntervalInMs: settings.loopIntervalInMs,
    uiTarsVersion: modelConfigResult.modelVersion,
    preprocessPngQuality: settings.preprocessPngQuality,
  });
};

/**
 * 工具函数：清空temp文件夹
 */
const clearTempFolder = () => {
  try {
    const tempPath = path.join(__dirname, '..', '..', 'temp');

    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
      return;
    }

    const files = fs.readdirSync(tempPath);

    files.forEach((file) => {
      const filePath = path.join(tempPath, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        fs.unlinkSync(filePath);
      }
    });
  } catch (error) {
    logger.error('[clearTempFolder] Error:', error);
  }
};
