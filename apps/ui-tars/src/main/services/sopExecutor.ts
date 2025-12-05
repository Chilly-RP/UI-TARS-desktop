/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@main/logger';
import { StatusEnum } from '@ui-tars/shared/types';
import { type ConversationWithSoM, type Message } from '@main/shared/types';
import { SOPManager } from './sopManager';
import {
  showWidgetWindow,
  showScreenWaterFlow,
  showHumanInterventionWindow,
} from '../window/ScreenMarker';
import { hideMainWindow, showMainWindow } from '../window';
import { NutJSElectronOperator } from '../agent/operator';
import {
  DefaultBrowserOperator,
  RemoteBrowserOperator,
} from '@ui-tars/operator-browser';
import { RemoteComputerOperator } from '../remote/operators';
import { AppState } from '@main/store/types';

export interface SOPExecutionResult {
  success: boolean;
  userAborted: boolean;
  messages: ConversationWithSoM[];
  historyMessages: Message[];
}

/**
 * SOPExecutor 负责管理 SOP 执行逻辑
 */
export class SOPExecutor {
  /**
   * 执行 SOP
   * @param instructions 用户指令
   * @param operator 操作员实例
   * @param getState 获取当前状态的函数
   * @param setState 更新状态的函数
   * @param abortController 中止控制器
   * @returns SOPExecutionResult 执行结果
   */
  static async executeSOP(
    instructions: string,
    operator:
      | NutJSElectronOperator
      | DefaultBrowserOperator
      | RemoteComputerOperator
      | RemoteBrowserOperator,
    getState: () => AppState,
    setState: (state: AppState) => void,
    abortController?: AbortController,
  ): Promise<SOPExecutionResult> {
    logger.info('[SOPExecutor] 开始执行 SOP 流程');

    // 初始化 SOP 管理器并尝试匹配 SOP
    const sopManager = SOPManager.getInstance();
    await sopManager.loadSOPIndex();

    const sopFilePath = sopManager.findMatchingSOP(instructions);

    // 如果没有找到匹配的 SOP，返回空结果
    if (!sopFilePath) {
      logger.info('[SOPExecutor] 未找到匹配的 SOP');
      return {
        success: false,
        userAborted: false,
        messages: [],
        historyMessages: [],
      };
    }

    // 创建一个临时数组来存储SOP执行过程中的消息
    const sopExecutionMessages: ConversationWithSoM[] = [];
    let sopTitle = ''; // 用于存储SOP标题，在catch块中使用

    try {
      logger.info(`[SOPExecutor] 找到匹配的 SOP: ${sopFilePath}，开始执行`);
      const sop = await sopManager.loadSOP(sopFilePath);
      sopTitle = sop?.title || ''; // 保存SOP标题

      if (!sop) {
        throw new Error(`无法加载 SOP: ${sopFilePath}`);
      }

      // SOP 命中匹配后，隐藏主窗口
      this._prepareSOPExecutionUI();

      // 添加 SOP 执行开始的消息
      const startMessage = this._createSOPMessage(
        `正在执行标准操作程序: ${sop.title}`,
      );
      sopExecutionMessages.push(startMessage);
      setState({
        ...getState(),
        messages: [...getState().messages, startMessage],
      });

      // 定义回调函数，用于在执行每个动作时收集thought和action信息
      const onActionExecute = (action: any, index: number, total: number) => {
        logger.info(
          `[SOPExecutor] 执行SOP动作 ${index + 1}/${total}: ${action.action_type}`,
        );

        const actionMessage = this._createActionMessage(action);
        sopExecutionMessages.push(actionMessage);

        // 实时更新状态，让widget窗口能够显示当前执行的action
        setState({
          ...getState(),
          messages: [...getState().messages, actionMessage],
        });
      };

      // 执行SOP，传入回调函数和abortController
      await sopManager.executeSOP(
        sop,
        operator,
        onActionExecute,
        abortController || undefined,
      );

      // SOP 执行完成后，等待 1000ms 再进行截图
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 添加 SOP 执行完成的消息
      const endMessage = this._createSOPMessage(
        `标准操作程序执行完成: ${sop.title}`,
      );
      sopExecutionMessages.push(endMessage);
      setState({
        ...getState(),
        messages: [...getState().messages, endMessage],
      });

      // 将SOP执行过程中的消息转换为Message格式
      const sopMessagesAsHistory =
        this._convertToHistoryMessages(sopExecutionMessages);

      logger.info(`[SOPExecutor] SOP执行完成: ${sop.title}`);

      return {
        success: true,
        userAborted: false,
        messages: sopExecutionMessages,
        historyMessages: sopMessagesAsHistory,
      };
    } catch (error) {
      logger.error(`[SOPExecutor] SOP 执行失败:`, error);

      // SOP 执行失败时，确保显示主窗口
      showMainWindow();

      // 检查是否是用户终止的情况
      const isUserAborted =
        error instanceof Error && error.message === 'SOP执行被用户终止';

      // 添加 SOP 执行失败的消息
      const failureMessage = this._createSOPMessage(
        isUserAborted
          ? '标准操作程序已被用户终止'
          : '标准操作程序执行失败，将使用常规模式继续执行任务',
      );

      // 首先获取当前状态，然后移除可能已经添加的开始消息
      const currentMessages = getState().messages;
      const messagesWithoutSop = currentMessages.filter(
        (msg) => msg.value !== `正在执行标准操作程序: ${sopTitle}`,
      );

      setState({
        ...getState(),
        messages: [...messagesWithoutSop, failureMessage],
        // 如果是用户终止，设置状态为END
        status: isUserAborted ? StatusEnum.END : getState().status,
      });

      return {
        success: false,
        userAborted: isUserAborted,
        messages: [failureMessage],
        historyMessages: [],
      };
    }
  }

  /**
   * 准备 SOP 执行时的 UI 状态
   */
  private static _prepareSOPExecutionUI(): void {
    showWidgetWindow();
    showScreenWaterFlow();
    showHumanInterventionWindow();
    hideMainWindow();
  }

  /**
   * 创建 SOP 相关的消息
   */
  private static _createSOPMessage(value: string): ConversationWithSoM {
    return {
      from: 'gpt',
      value,
      timing: {
        start: Date.now(),
        end: Date.now(),
        cost: 0,
      },
    };
  }

  /**
   * 创建动作相关的消息
   */
  private static _createActionMessage(action: any): ConversationWithSoM {
    // 将SOPAction转换为PredictionParsed格式
    const predictionParsed = {
      reflection: action.reflection || null,
      thought: action.thought || '',
      action_type: action.action_type,
      action_inputs: action.action_inputs || {},
    };

    return {
      from: 'gpt',
      value: '', // 这个值会被ThoughtChain组件忽略
      timing: {
        start: Date.now(),
        end: Date.now(),
        cost: 0,
      },
      predictionParsed: [predictionParsed], // 将SOP动作转换为predictionParsed格式
    };
  }

  /**
   * 将 SOP 执行消息转换为历史消息格式
   */
  private static _convertToHistoryMessages(
    messages: ConversationWithSoM[],
  ): Message[] {
    return messages.map((msg) => ({
      from: msg.from,
      value:
        msg.value ||
        (msg.predictionParsed && msg.predictionParsed[0]
          ? `Thought: ${msg.predictionParsed[0].thought}\nAction: ${msg.predictionParsed[0].action_type}(${JSON.stringify(msg.predictionParsed[0].action_inputs)})`
          : ''),
    }));
  }
}
