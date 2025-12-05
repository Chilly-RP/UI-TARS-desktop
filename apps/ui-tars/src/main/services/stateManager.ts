/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@main/logger';
import { StatusEnum } from '@ui-tars/shared/types';
import { type ConversationWithSoM, type Message } from '@main/shared/types';
import { AppState } from '@main/store/types';

/**
 * StateManager 负责统一管理状态更新
 */
export class StateManager {
  private getState: () => AppState;
  private setState: (state: AppState) => void;

  constructor(getState: () => AppState, setState: (state: AppState) => void) {
    this.getState = getState;
    this.setState = setState;
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): AppState {
    return this.getState();
  }

  /**
   * 更新状态
   */
  updateState(newState: Partial<AppState>): void {
    const currentState = this.getCurrentState();
    this.setState({
      ...currentState,
      ...newState,
    });
  }

  /**
   * 添加消息到状态
   */
  addMessages(messages: ConversationWithSoM[]): void {
    const currentState = this.getCurrentState();
    this.updateState({
      messages: [...currentState.messages, ...messages],
    });
  }

  /**
   * 添加单个消息到状态
   */
  addMessage(message: ConversationWithSoM): void {
    this.addMessages([message]);
  }

  /**
   * 添加历史消息到状态
   */
  addHistoryMessages(messages: Message[]): void {
    const currentState = this.getCurrentState();
    this.updateState({
      sessionHistoryMessages: [
        ...currentState.sessionHistoryMessages,
        ...messages,
      ],
    });
  }

  /**
   * 设置错误状态
   */
  setError(errorMsg: string): void {
    logger.error(`[StateManager] 设置错误状态: ${errorMsg}`);
    this.updateState({
      status: StatusEnum.ERROR,
      errorMsg,
    });
  }

  /**
   * 设置状态
   */
  setStatus(status: StatusEnum): void {
    this.updateState({ status });
  }

  /**
   * 清空消息
   */
  clearMessages(): void {
    this.updateState({ messages: [] });
  }

  /**
   * 清空历史消息
   */
  clearHistoryMessages(): void {
    this.updateState({ sessionHistoryMessages: [] });
  }

  /**
   * 设置思考状态
   */
  setThinking(thinking: boolean): void {
    this.updateState({ thinking });
  }

  /**
   * 设置浏览器可用性
   */
  setBrowserAvailable(available: boolean): void {
    this.updateState({ browserAvailable: available });
  }

  /**
   * 设置指令
   */
  setInstructions(instructions: string | null): void {
    this.updateState({ instructions });
  }

  /**
   * 设置中止控制器
   */
  setAbortController(abortController: AbortController | null): void {
    this.updateState({ abortController });
  }

  /**
   * 设置用户数据
   */
  setRestUserData(restUserData: any): void {
    this.updateState({ restUserData });
  }

  /**
   * 移除特定值的消息
   */
  removeMessagesByValue(value: string): void {
    const currentState = this.getCurrentState();
    const filteredMessages = currentState.messages.filter(
      (msg) => msg.value !== value,
    );
    this.updateState({ messages: filteredMessages });
  }

  /**
   * 获取最后一条消息
   */
  getLastMessage(): ConversationWithSoM | undefined {
    const currentState = this.getCurrentState();
    const messages = currentState.messages;
    return messages.length > 0 ? messages[messages.length - 1] : undefined;
  }

  /**
   * 检查最后一条消息是否包含特定动作类型
   */
  hasLastMessageActionType(actionType: string): boolean {
    const lastMessage = this.getLastMessage();
    if (!lastMessage?.predictionParsed) {
      return false;
    }

    return lastMessage.predictionParsed.some(
      (pred) => pred.action_type === actionType,
    );
  }
}
