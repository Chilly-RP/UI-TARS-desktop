/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@main/logger';
import { StatusEnum } from '@ui-tars/shared/types';
import { NutJSElectronOperator } from '../agent/operator';
import { LocalAgentOperator } from '../agent/localAgentOperator';
import {
  createRemoteBrowserOperator,
  RemoteComputerOperator,
} from '../remote/operators';
import {
  DefaultBrowserOperator,
  RemoteBrowserOperator,
} from '@ui-tars/operator-browser';
import { checkBrowserAvailability } from './browserCheck';
import { Operator } from '@main/store/types';
import { AppState } from '@main/store/types';
import { getLocalBrowserSearchEngine } from '../utils/agent';

export interface OperatorResult {
  operator:
    | NutJSElectronOperator
    | DefaultBrowserOperator
    | RemoteComputerOperator
    | RemoteBrowserOperator;
  operatorType: 'computer' | 'browser';
}

/**
 * OperatorFactory 负责创建不同类型的 Operator
 */
export class OperatorFactory {
  /**
   * 创建 Operator 实例
   * @param operatorType 操作员类型
   * @param getState 获取当前状态的函数
   * @param setState 更新状态的函数
   * @param settings 应用设置
   * @returns OperatorResult 包含操作员实例和类型
   */
  static async createOperator(
    operatorType: Operator,
    getState: () => AppState,
    setState: (state: AppState) => void,
    settings: any,
  ): Promise<OperatorResult | null> {
    logger.info(`[OperatorFactory] Creating operator of type: ${operatorType}`);

    switch (operatorType) {
      case Operator.LocalComputer:
        return {
          operator: new NutJSElectronOperator(),
          operatorType: 'computer',
        };

      case Operator.LocalBrowser:
        await checkBrowserAvailability();
        const { browserAvailable } = getState();
        if (!browserAvailable) {
          setState({
            ...getState(),
            status: StatusEnum.ERROR,
            errorMsg:
              'Browser is not available. Please install Chrome and try again.',
          });
          return null;
        }

        return {
          operator: await DefaultBrowserOperator.getInstance(
            false,
            false,
            false,
            getState().status === StatusEnum.CALL_USER,
            getLocalBrowserSearchEngine(settings.searchEngineForBrowser),
          ),
          operatorType: 'browser',
        };

      case Operator.RemoteComputer:
        return {
          operator: await RemoteComputerOperator.create(),
          operatorType: 'computer',
        };

      case Operator.RemoteBrowser:
        return {
          operator: await createRemoteBrowserOperator(),
          operatorType: 'browser',
        };

      case Operator.LocalAgent:
        return {
          operator: new LocalAgentOperator(),
          operatorType: 'computer',
        };

      default:
        setState({
          ...getState(),
          status: StatusEnum.ERROR,
          errorMsg: `不支持的 operator 类型: ${operatorType}`,
        });
        return null;
    }
  }
}
