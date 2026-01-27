/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Message,
  GUIAgentData,
  PredictionParsed,
  UITarsModelVersion,
  ScreenshotResult,
  GUIAgentError,
  StatusEnum,
} from '@ui-tars/shared/types';

import { BaseOperator, BaseModel } from './base';
import { UITarsModel } from './Model';
import { Factors } from './constants';

export interface ExecuteParams {
  prediction: string;
  parsedPrediction: PredictionParsed;
  /** Device Physical Resolution */
  screenWidth: number;
  /** Device Physical Resolution */
  screenHeight: number;
  /** Device DPR */
  scaleFactor: number;
  /** model coordinates scaling factor [widthFactor, heightFactor] */
  factors: Factors;
}

export interface ExecuteOutput {
  status: StatusEnum;
  /** Tool execution output (e.g., bash command output, file content) to be added to conversation context */
  toolOutput?: string;
}

export interface ScreenshotOutput extends ScreenshotResult {}

/** Streaming chunk data */
export interface StreamChunk {
  /** Accumulated text so far */
  text: string;
  /** Incremental text for this chunk */
  delta: string;
  /** Whether streaming is complete */
  isComplete: boolean;
}

/** Callback for streaming chunks */
export type OnStreamChunk = (chunk: StreamChunk) => void;

export interface InvokeParams {
  conversations: Message[];
  images: string[];
  /** logical size */
  screenContext: {
    /** screenshot width */
    width: number;
    /** screenshot height */
    height: number;
  };
  /** physicalSize = screenshotSize * scaleFactor */
  scaleFactor?: number;
  /** the ui-tars's version */
  uiTarsVersion?: UITarsModelVersion;
  headers?: Record<string, string>;
  /** == Response API only == */
  /** previous response id */
  previousResponseId?: string;
  /** PNG quality for image preprocessing (1-100), @default 60 */
  preprocessPngQuality?: number;
  /** Callback for streaming output chunks */
  onStreamChunk?: OnStreamChunk;
}

export interface InvokeOutput {
  prediction: string;
  parsedPredictions: PredictionParsed[];
  costTime?: number;
  costTokens?: number;
  /** == Response API only == */
  /** response id */
  responseId?: string;
  // TODO: status: StatusEnum, status should be provided by model
}
export abstract class Operator extends BaseOperator {
  static MANUAL: {
    ACTION_SPACES: string[];
    EXAMPLES?: string[];
  };
  static SUPPORTS_SCREENSHOT?: boolean;
  abstract screenshot(): Promise<ScreenshotOutput>;
  abstract execute(params: ExecuteParams): Promise<ExecuteOutput>;
}

export abstract class Model extends BaseModel<InvokeParams, InvokeOutput> {
  /** [widthFactor, heightFactor] */
  abstract get factors(): Factors;
  abstract get modelName(): string;
  abstract reset(): void;
  abstract invoke(params: InvokeParams): Promise<InvokeOutput>;
}

export type Logger = Pick<Console, 'log' | 'error' | 'warn' | 'info'>;

export interface RetryConfig {
  maxRetries: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/** Parameters for onData callback */
export interface OnDataParams {
  data: GUIAgentData;
  /** Whether this is a streaming update (should replace last message instead of appending) */
  isStreamingUpdate?: boolean;
}

export interface GUIAgentConfig<TOperator> {
  operator: TOperator;
  model: Model | ConstructorParameters<typeof UITarsModel>[0];

  // ===== Optional =====
  systemPrompt?: string;
  signal?: AbortSignal;
  onData?: (params: OnDataParams) => void;
  onError?: (params: { data: GUIAgentData; error: GUIAgentError }) => void;
  logger?: Logger;
  retry?: {
    model?: RetryConfig;
    /** TODO: whether need to provider retry config in SDK?, should be provided with operator? */
    screenshot?: RetryConfig;
    execute?: RetryConfig;
  };
  /** Maximum number of turns for Agent to execute, @default 25 */
  maxLoopCount?: number;
  /** Time interval between two loop iterations (in milliseconds), @default 0 */
  loopIntervalInMs?: number;
  uiTarsVersion?: UITarsModelVersion;
  /** PNG quality for image preprocessing (1-100), @default 60 */
  preprocessPngQuality?: number;
}

export interface AgentContext<T = Operator> extends GUIAgentConfig<T> {
  logger: NonNullable<GUIAgentConfig<T>['logger']>;
  /** [widthFactor, heightFactor] */
  factors: [number, number];
  model: Model;
}
