/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import OpenAI, { type ClientOptions } from 'openai';
import {
  type ChatCompletionCreateParamsNonStreaming,
  type ChatCompletionCreateParamsBase,
  type ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { actionParser } from '@ui-tars/action-parser';

import { useContext } from './context/useContext';
import { Model, type InvokeParams, type InvokeOutput } from './types';

import {
  preprocessResizeImage,
  convertToOpenAIMessages,
  convertToResponseApiInput,
  isMessageImage,
} from './utils';
import { DEFAULT_FACTORS } from './constants';
import {
  UITarsModelVersion,
  MAX_PIXELS_V1_0,
  MAX_PIXELS_V1_5,
  MAX_PIXELS_DOUBAO,
} from '@ui-tars/shared/types';
import type {
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
} from 'openai/resources/responses/responses';

type OpenAIChatCompletionCreateParams = Omit<ClientOptions, 'maxRetries'> &
  Pick<
    ChatCompletionCreateParamsBase,
    'model' | 'max_tokens' | 'temperature' | 'top_p'
  >;

export interface UITarsModelConfig extends OpenAIChatCompletionCreateParams {
  /** Whether to use OpenAI Response API instead of Chat Completions API */
  useResponsesApi?: boolean;
}

export interface ThinkingVisionProModelConfig extends ChatCompletionCreateParamsNonStreaming {
  thinking?: {
    type: 'enabled' | 'disabled';
  };
}

export interface DoubaoSeedModelConfig extends OpenAIChatCompletionCreateParams {
  /** Whether to use OpenAI Response API instead of Chat Completions API */
  useResponsesApi?: boolean;
  /** Reasoning effort level: 'minimal' | 'low' | 'medium' | 'high' */
  reasoning_effort?: 'minimal' | 'low' | 'medium' | 'high';
  /** Enable web search for response API */
  enableWebSearch?: boolean;
}

export class DoubaoSeedModel extends Model {
  constructor(protected readonly modelConfig: DoubaoSeedModelConfig) {
    super();
    this.modelConfig = modelConfig;
  }

  get useResponsesApi(): boolean {
    return this.modelConfig.useResponsesApi ?? false;
  }

  /** [widthFactor, heightFactor] */
  get factors(): [number, number] {
    return DEFAULT_FACTORS;
  }

  get modelName(): string {
    return this.modelConfig.model ?? 'doubao-seed-1-8-251228';
  }

  /**
   * reset the model state
   */
  reset() {
    // No state to reset for this model
  }

  /**
   * call DoubaoSeed model using Chat API or Response API
   */
  protected async invokeModelProvider(
    params: {
      messages: Array<ChatCompletionMessageParam>;
      previousResponseId?: string;
    },
    options: {
      signal?: AbortSignal;
    },
    headers?: Record<string, string>,
  ): Promise<{
    prediction: string;
    costTime?: number;
    costTokens?: number;
    responseId?: string;
  }> {
    const { logger } = useContext();
    const { messages, previousResponseId } = params;
    const {
      baseURL,
      apiKey,
      model,
      max_tokens = 4096,
      temperature = 0.7,
      top_p = 0.7,
      reasoning_effort = 'low',
      enableWebSearch = false,
      ...restOptions
    } = this.modelConfig;

    const openai = new OpenAI({
      ...restOptions,
      maxRetries: 0,
      baseURL,
      apiKey,
    });

    const startTime = Date.now();

    // 过滤掉图片内容，只保留文本
    const filteredMessages = messages.map((msg) => {
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.filter((item: any) => item.type === 'text'),
        };
      }
      return msg;
    });

    if (this.modelConfig.useResponsesApi) {
      // Use Response API
      logger.info('[DoubaoSeed ResponseAPI] Calling with reasoning_effort:', reasoning_effort);

      // 转换消息格式为 Response API 的 input 格式
      const inputs = filteredMessages.map((msg): ResponseInputItem => {
        if (msg.role === 'user') {
          const content = Array.isArray(msg.content)
            ? msg.content
            : [{ type: 'input_text' as const, text: msg.content }];

          const formattedContent = content.map((item: any) => {
            if (item.type === 'text') {
              return { type: 'input_text' as const, text: item.text };
            }
            // 保留 image_url 参数但不实际使用
            if (item.type === 'image_url') {
              return { type: 'input_image' as const, image_url: '' };
            }
            return item;
          });

          return {
            role: 'user',
            content: formattedContent,
          };
        }
        return msg as ResponseInputItem;
      });

      // 构建 tools 参数
      const tools = enableWebSearch
        ? [
            {
              type: 'web_search' as const,
            },
          ]
        : undefined;

      const responseParams: ResponseCreateParamsNonStreaming = {
        input: inputs,
        model,
        temperature,
        top_p,
        stream: false,
        max_output_tokens: max_tokens,
        ...(previousResponseId && {
          previous_response_id: previousResponseId,
        }),
        ...(tools && { tools }),
        // @ts-expect-error - reasoning_effort is a custom parameter
        reasoning_effort,
      };

      const result = await openai.responses.create(responseParams, {
        ...options,
        timeout: 1000 * 60,
        headers,
      });

      logger.info('[DoubaoSeed ResponseAPI] Result:', result);

      return {
        prediction: result?.output_text ?? '',
        costTime: Date.now() - startTime,
        costTokens: result?.usage?.total_tokens ?? 0,
        responseId: result?.id,
      };
    } else {
      // Use Chat Completions API
      logger.info('[DoubaoSeed ChatAPI] Calling with reasoning_effort:', reasoning_effort);

      const createCompletionParams = {
        model,
        messages: filteredMessages,
        stream: false,
        max_tokens,
        temperature,
        top_p,
        reasoning_effort,
      } as ChatCompletionCreateParamsNonStreaming & { reasoning_effort: string };

      const result = await openai.chat.completions.create(createCompletionParams, {
        ...options,
        timeout: 1000 * 60,
        headers,
      });

      return {
        prediction: result.choices?.[0]?.message?.content ?? '',
        costTime: Date.now() - startTime,
        costTokens: result.usage?.total_tokens ?? 0,
      };
    }
  }

  async invoke(params: InvokeParams): Promise<InvokeOutput> {
    const {
      conversations,
      screenContext,
      scaleFactor,
      uiTarsVersion,
      headers,
      previousResponseId,
    } = params;
    const { logger, signal } = useContext();

    logger?.info(
      `[DoubaoSeedModel] invoke: screenContext=${JSON.stringify(screenContext)}, scaleFactor=${scaleFactor}, uiTarsVersion=${uiTarsVersion}, useResponsesApi=${this.modelConfig.useResponsesApi}, reasoning_effort=${this.modelConfig.reasoning_effort}`,
    );

    // 不传图片，只使用对话内容
    const messages = convertToOpenAIMessages({
      conversations,
      images: [],
    });

    const startTime = Date.now();
    const result = await this.invokeModelProvider(
      {
        messages,
        previousResponseId,
      },
      {
        signal,
      },
      headers,
    )
      .catch((e) => {
        logger?.error('[DoubaoSeedModel] error', e);
        throw e;
      })
      .finally(() => {
        logger?.info(`[DoubaoSeedModel cost]: ${Date.now() - startTime}ms`);
      });

    if (!result.prediction) {
      const err = new Error();
      err.name = 'DoubaoSeed response error';
      err.stack = JSON.stringify(result) ?? 'no message';
      logger?.error(err);
      throw err;
    }

    const { prediction, costTime, costTokens, responseId } = result;

    // DoubaoSeed 模型主要用于对话，不需要解析操作
    return {
      prediction,
      parsedPredictions: [],
      costTime,
      costTokens,
      responseId,
    };
  }
}

export class UITarsModel extends Model {
  constructor(protected readonly modelConfig: UITarsModelConfig) {
    super();
    this.modelConfig = modelConfig;
  }

  get useResponsesApi(): boolean {
    return this.modelConfig.useResponsesApi ?? false;
  }
  private headImageContext: {
    messageIndex: number;
    responseIds: string[];
  } | null = null;

  /** [widthFactor, heightFactor] */
  get factors(): [number, number] {
    return DEFAULT_FACTORS;
  }

  get modelName(): string {
    return this.modelConfig.model ?? 'unknown';
  }

  /**
   * reset the model state
   */
  reset() {
    this.headImageContext = null;
  }

  /**
   * call real LLM / VLM Model
   * @param params
   * @param options
   * @returns
   */
  protected async invokeModelProvider(
    uiTarsVersion: UITarsModelVersion = UITarsModelVersion.V1_0,
    params: {
      messages: Array<ChatCompletionMessageParam>;
      previousResponseId?: string;
    },
    options: {
      signal?: AbortSignal;
    },
    headers?: Record<string, string>,
  ): Promise<{
    prediction: string;
    costTime?: number;
    costTokens?: number;
    responseId?: string;
  }> {
    const { logger } = useContext();
    const { messages, previousResponseId } = params;
    const {
      baseURL,
      apiKey,
      model,
      max_tokens = uiTarsVersion == UITarsModelVersion.V1_5 ? 65535 : 1000,
      temperature = 0,
      top_p = 0.7,
      ...restOptions
    } = this.modelConfig;

    const openai = new OpenAI({
      ...restOptions,
      maxRetries: 0,
      baseURL,
      apiKey,
    });

    const createCompletionPrams: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      stream: false,
      seed: null,
      stop: null,
      frequency_penalty: null,
      presence_penalty: null,
      // custom options
      max_tokens,
      temperature,
      top_p,
    };

    const createCompletionPramsThinkingVp: ThinkingVisionProModelConfig = {
      ...createCompletionPrams,
      thinking: {
        type: 'disabled',
      },
    };

    const startTime = Date.now();

    if (this.modelConfig.useResponsesApi) {
      // Find last index of assistant message (compatible with older ES versions)
      let lastAssistantIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          lastAssistantIndex = i;
          break;
        }
      }
      logger.info('[ResponseAPI] lastAssistantIndex: ', lastAssistantIndex);
      // incremental messages
      const inputs = convertToResponseApiInput(
        lastAssistantIndex > -1
          ? messages.slice(lastAssistantIndex + 1)
          : messages,
      );

      // find the first image message
      const headImageMessageIndex = messages.findIndex(isMessageImage);
      if (
        this.headImageContext?.responseIds.length &&
        this.headImageContext?.messageIndex !== headImageMessageIndex
      ) {
        // The image window has slid. Delete the first image message.
        logger.info(
          '[ResponseAPI] should [delete]: ',
          this.headImageContext,
          'headImageMessageIndex',
          headImageMessageIndex,
        );
        const headImageResponseId = this.headImageContext.responseIds.shift();

        if (headImageResponseId) {
          const deletedResponse = await openai.responses.delete(
            headImageResponseId,
            {
              headers,
            },
          );
          logger.info(
            '[ResponseAPI] [deletedResponse]: ',
            headImageResponseId,
            deletedResponse,
          );
        }
      }

      let result;
      let responseId = previousResponseId;
      for (const input of inputs) {
        const truncated = JSON.stringify(
          [input],
          (key, value) => {
            if (typeof value === 'string' && value.startsWith('data:image/')) {
              return value.slice(0, 50) + '...[truncated]';
            }
            return value;
          },
          2,
        );
        const responseParams: ResponseCreateParamsNonStreaming = {
          input: [input],
          model,
          temperature,
          top_p,
          stream: false,
          max_output_tokens: max_tokens,
          ...(responseId && {
            previous_response_id: responseId,
          }),
          // @ts-expect-error
          thinking: {
            type: 'disabled',
          },
        };
        logger.info(
          '[ResponseAPI] [input]: ',
          truncated,
          'previous_response_id',
          responseParams?.previous_response_id,
          'headImageMessageIndex',
          headImageMessageIndex,
        );

        result = await openai.responses.create(responseParams, {
          ...options,
          timeout: 1000 * 30,
          headers,
        });
        logger.info('[ResponseAPI] [result]: ', result);
        responseId = result?.id;
        logger.info('[ResponseAPI] [responseId]: ', responseId);

        // head image changed
        if (responseId && isMessageImage(input)) {
          this.headImageContext = {
            messageIndex: headImageMessageIndex,
            responseIds: [
              ...(this.headImageContext?.responseIds || []),
              responseId,
            ],
          };
        }

        logger.info(
          '[ResponseAPI] [headImageContext]: ',
          this.headImageContext,
        );
      }

      return {
        prediction: result?.output_text ?? '',
        costTime: Date.now() - startTime,
        costTokens: result?.usage?.total_tokens ?? 0,
        responseId,
      };
    }

    // Use Chat Completions API if not using Response API
    const result = await openai.chat.completions.create(
      createCompletionPramsThinkingVp,
      {
        ...options,
        timeout: 1000 * 30,
        headers,
      },
    );

    return {
      prediction: result.choices?.[0]?.message?.content ?? '',
      costTime: Date.now() - startTime,
      costTokens: result.usage?.total_tokens ?? 0,
    };
  }

  async invoke(params: InvokeParams): Promise<InvokeOutput> {
    const {
      conversations,
      images,
      screenContext,
      scaleFactor,
      uiTarsVersion,
      headers,
      previousResponseId,
      preprocessPngQuality,
    } = params;
    const { logger, signal } = useContext();

    logger?.info(
      `[UITarsModel] invoke: screenContext=${JSON.stringify(screenContext)}, scaleFactor=${scaleFactor}, uiTarsVersion=${uiTarsVersion}, useResponsesApi=${this.modelConfig.useResponsesApi}, preprocessPngQuality=${preprocessPngQuality}`,
    );

    const maxPixels =
      uiTarsVersion === UITarsModelVersion.V1_5
        ? MAX_PIXELS_V1_5
        : uiTarsVersion === UITarsModelVersion.DOUBAO_1_5_15B ||
            uiTarsVersion === UITarsModelVersion.DOUBAO_1_5_20B
          ? MAX_PIXELS_DOUBAO
          : MAX_PIXELS_V1_0;
    const compressedImages = await Promise.all(
      // maxPixels 为最大像素数，这里可以根据情况压缩
      // preprocessPngQuality 为 PNG 质量，如果传入则使用，否则使用默认值 60
      images.map((image) =>
        preprocessResizeImage(image, maxPixels, preprocessPngQuality),
      ),
    );

    const messages = convertToOpenAIMessages({
      conversations,
      images: compressedImages,
    });

    const startTime = Date.now();
    const result = await this.invokeModelProvider(
      uiTarsVersion,
      {
        messages,
        previousResponseId,
      },
      {
        signal,
      },
      headers,
    )
      .catch((e) => {
        logger?.error('[UITarsModel] error', e);
        throw e;
      })
      .finally(() => {
        logger?.info(`[UITarsModel cost]: ${Date.now() - startTime}ms`);
      });

    if (!result.prediction) {
      const err = new Error();
      err.name = 'vlm response error';
      err.stack = JSON.stringify(result) ?? 'no message';
      logger?.error(err);
      throw err;
    }

    const { prediction, costTime, costTokens, responseId } = result;

    try {
      const { parsed: parsedPredictions } = actionParser({
        prediction,
        factor: this.factors,
        screenContext,
        scaleFactor,
        modelVer: uiTarsVersion,
      });
      return {
        prediction,
        parsedPredictions,
        costTime,
        costTokens,
        responseId,
      };
    } catch (error) {
      logger?.error('[UITarsModel] error', error);
      return {
        prediction,
        parsedPredictions: [],
        responseId,
      };
    }
  }
}
