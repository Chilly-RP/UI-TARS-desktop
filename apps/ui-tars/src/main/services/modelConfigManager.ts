/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@main/logger';
import { UITarsModelVersion } from '@ui-tars/shared/constants';
import { Operator } from '@main/store/types';
import { getModelVersion, getSpByModelVersion } from '../utils/agent';
import { FREE_MODEL_BASE_URL } from '../remote/shared';
import { getAuthHeader } from '../remote/auth';
import { ProxyClient } from '../remote/proxyClient';
import { UITarsModel, type UITarsModelConfig } from '@ui-tars/sdk/core';

export interface ModelConfigResult {
  modelConfig: UITarsModelConfig;
  modelAuthHdrs: Record<string, string>;
  modelVersion: UITarsModelVersion;
  systemPrompt: string;
  customModel: UITarsModel;
}

/**
 * ModelConfigManager 负责管理模型配置
 */
export class ModelConfigManager {
  /**
   * 创建模型配置
   * @param settings 应用设置
   * @param operatorType 操作员类型
   * @param language 语言设置
   * @returns ModelConfigResult 模型配置结果
   */
  static async createModelConfig(
    settings: any,
    operatorType: 'computer' | 'browser',
    language: string,
  ): Promise<ModelConfigResult> {
    logger.info('[ModelConfigManager] 创建模型配置');

    let modelVersion = getModelVersion(settings.vlmProvider);
    let modelConfig: UITarsModelConfig = {
      baseURL: settings.vlmBaseUrl,
      // secretlint-disable-next-line
      apiKey: settings.vlmApiKey,
      model: settings.vlmModelName,
      useResponsesApi: settings.useResponsesApi,
    };
    let modelAuthHdrs: Record<string, string> = {};

    // 如果是远程操作员，使用远程模型配置
    if (
      settings.operator === Operator.RemoteComputer ||
      settings.operator === Operator.RemoteBrowser
    ) {
      const useResponsesApi =
        await ProxyClient.getRemoteVLMResponseApiSupport();
      modelConfig = {
        baseURL: FREE_MODEL_BASE_URL,
        // secretlint-disable-next-line
        apiKey: '',
        model: '',
        useResponsesApi,
      };
      modelAuthHdrs = await getAuthHeader();
      modelVersion = await ProxyClient.getRemoteVLMProvider();
    }

    const systemPrompt = getSpByModelVersion(
      modelVersion,
      language as 'zh' | 'en',
      operatorType,
    );

    // 创建自定义的UITarsModel实例
    const customModel = new RequestSavingUITarsModel(modelConfig);

    return {
      modelConfig,
      modelAuthHdrs,
      modelVersion,
      systemPrompt,
      customModel,
    };
  }
}

// 创建一个自定义的UITarsModel子类，用于保存模型请求
class RequestSavingUITarsModel extends UITarsModel {
  constructor(modelConfig: UITarsModelConfig) {
    super(modelConfig);
  }

  async invoke(params: any): Promise<any> {
    // 在调用父类方法之前保存请求
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    saveModelRequest(requestId, params.conversations);

    // 调用父类方法
    return super.invoke(params);
  }
}

// 工具函数：保存模型请求到JSON文件
const saveModelRequest = (requestId: string, messages: any[]) => {
  try {
    // 检查是否启用了保存请求到JSON的设置
    const { SettingStore } = require('@main/store/setting');
    const settings = SettingStore.getStore();
    if (!settings.saveRequestsToJson) {
      return;
    }

    const fs = require('fs');
    const path = require('path');

    const tempPath = path.join(__dirname, '..', '..', 'temp');

    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }

    // 过滤消息，只保留文本内容，移除base64图片
    const textOnlyMessages = messages.map((msg) => {
      const textMsg = { ...msg };

      if (Array.isArray(textMsg.content)) {
        textMsg.content = textMsg.content.filter((item: any) => {
          return item.type === 'text';
        });
      }

      return textMsg;
    });

    const requestData = {
      id: requestId,
      timestamp: new Date().toISOString(),
      messages: textOnlyMessages,
    };

    const fileName = `request_${requestId}_${Date.now()}.json`;
    const filePath = path.join(tempPath, fileName);

    fs.writeFileSync(filePath, JSON.stringify(requestData, null, 2));
  } catch (error) {
    logger.error('[saveModelRequest] Error:', error);
  }
};
