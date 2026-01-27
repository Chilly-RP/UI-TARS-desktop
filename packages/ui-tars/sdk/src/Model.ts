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
import { Model, type InvokeParams, type InvokeOutput, type OnStreamChunk } from './types';

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
  /** Enable streaming output for Response API (default: true when useResponsesApi is true) */
  enableStreaming?: boolean;
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
    onStreamChunk?: OnStreamChunk,
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
      enableStreaming = true,
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

      // Determine which messages to send based on whether we have a previous response ID
      // When using previous_response_id, the API automatically retrieves conversation history,
      // so we only need to send messages after the last assistant response
      let messagesToSend = filteredMessages;

      if (previousResponseId) {
        // Find last assistant message index
        let lastAssistantIndex = -1;
        for (let i = filteredMessages.length - 1; i >= 0; i--) {
          if (filteredMessages[i].role === 'assistant') {
            lastAssistantIndex = i;
            break;
          }
        }
        messagesToSend = lastAssistantIndex > -1
          ? filteredMessages.slice(lastAssistantIndex + 1)
          : filteredMessages;

        logger.info('[DoubaoSeed ResponseAPI] Using incremental input, sending', messagesToSend.length, 'messages');
      }

      // 转换消息格式为 Response API 的 input 格式
      const inputs = messagesToSend.map((msg): ResponseInputItem => {
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

      // 构建基础请求参数
      const useStream = enableStreaming && !!onStreamChunk;
      const baseParams = {
        input: inputs,
        model,
        temperature,
        top_p,
        stream: useStream,
        ...(previousResponseId && {
          previous_response_id: previousResponseId,
        }),
        ...(tools && { tools }),
      };

      // 火山方舟扩展参数需要通过 body 字段传递
      // thinking 必须开启才能让 reasoning_effort 生效
      // body 会替换整个请求体，所以需要包含所有参数

      if (useStream) {
        // Streaming mode
        logger.info('[DoubaoSeed ResponseAPI] Using streaming mode');

        const response = await openai.responses.create(
          { ...baseParams, stream: true } as any,
          {
            ...options,
            timeout: 1000 * 60 * 5, // Longer timeout for streaming
            headers,
            body: {
              ...baseParams,
              stream: true,
              thinking: { type: 'disabled' },
              max_output_tokens: max_tokens,
            },
          },
        );

        let accumulatedText = '';
        let totalTokens = 0;
        let responseId = '';

        // Process streaming events
        for await (const event of response as unknown as AsyncIterable<any>) {
          // Debug: log event details to diagnose streaming issues
          // logger.info('[DoubaoSeed ResponseAPI] Event received:', JSON.stringify({
          //   type: event.type,
          //   keys: Object.keys(event),
          //   delta: event.delta,
          //   data: event.data,
          //   text: event.text,
          // }));

          // Handle output text delta - this is the main content we want to show
          if (event.type === 'response.output_text.delta') {
            accumulatedText += event.delta;
            onStreamChunk({
              text: accumulatedText,
              delta: event.delta,
              isComplete: false,
            });
          }

          // Handle completion event to get usage info
          if (event.type === 'response.completed') {
            totalTokens = event.response?.usage?.total_tokens ?? 0;
            responseId = event.response?.id ?? '';
            logger.info('[DoubaoSeed ResponseAPI] Stream completed, tokens:', totalTokens);
            logger.info('[DoubaoSeed ResponseAPI] Completed event response:', JSON.stringify(event.response));
          }
        }

        // Send final completion notification
        onStreamChunk({
          text: accumulatedText,
          delta: '',
          isComplete: true,
        });

        logger.info('[DoubaoSeed ResponseAPI] Streaming finished, text length:', accumulatedText.length);

        return {
          prediction: accumulatedText,
          costTime: Date.now() - startTime,
          costTokens: totalTokens,
          responseId,
        };
      } else {
        // Non-streaming mode (original behavior)
        const result = await openai.responses.create(
          baseParams as ResponseCreateParamsNonStreaming,
          {
            ...options,
            timeout: 1000 * 60,
            headers,
            body: {
              ...baseParams,
              //reasoning_effort: reasoning_effort,
              thinking: { type: 'disabled' },
              max_output_tokens: max_tokens,
            },
          },
        );

        logger.info('[DoubaoSeed ResponseAPI] Result:', result);

        return {
          prediction: result?.output_text ?? '',
          costTime: Date.now() - startTime,
          costTokens: result?.usage?.total_tokens ?? 0,
          responseId: result?.id,
        };
      }
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

  async invoke(params: InvokeParams & { onStreamChunk?: OnStreamChunk }): Promise<InvokeOutput> {
    const {
      conversations,
      screenContext,
      scaleFactor,
      uiTarsVersion,
      headers,
      previousResponseId,
      onStreamChunk,
    } = params;
    const { logger, signal } = useContext();

    logger?.info(
      `[DoubaoSeedModel] invoke: screenContext=${JSON.stringify(screenContext)}, scaleFactor=${scaleFactor}, uiTarsVersion=${uiTarsVersion}, useResponsesApi=${this.modelConfig.useResponsesApi}, reasoning_effort=${this.modelConfig.reasoning_effort}, streaming=${!!onStreamChunk}`,
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
      onStreamChunk,
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

    // Strip markdown code blocks if present
    let cleanPrediction = prediction;
    const codeBlockMatch = prediction.match(/```[\s\S]*?\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      cleanPrediction = codeBlockMatch[1].trim();
    }

    // Parse the response to extract structured actions
    try {
      const { parsed: parsedPredictions } = actionParser({
        prediction: cleanPrediction,
        factor: this.factors,
        screenContext,
        scaleFactor,
        modelVer: uiTarsVersion,
      });
      return {
        prediction: cleanPrediction,
        parsedPredictions,
        costTime,
        costTokens,
        responseId,
      };
    } catch (error) {
      logger?.error('[DoubaoSeedModel] parsing error', error);
      return {
        prediction: cleanPrediction,
        parsedPredictions: [],
        costTime,
        costTokens,
        responseId,
      };
    }
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
