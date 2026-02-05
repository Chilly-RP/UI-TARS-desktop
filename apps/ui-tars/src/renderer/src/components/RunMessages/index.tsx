/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@renderer/utils';
import { Button } from '@renderer/components/ui/button';

import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import Prompts from '../Prompts';
import ThoughtChain from '../ThoughtChain';
import { api } from '@renderer/api';

// import ChatInput from '@renderer/components/ChatInput';

import { SidebarTrigger } from '@renderer/components/ui/sidebar';
import { ShareOptions } from '@/renderer/src/components/RunMessages/ShareOptions';
import { ClearHistory } from '@/renderer/src/components/RunMessages/ClearHistory';
import { useStore } from '@renderer/hooks/useStore';
import { useSession } from '@renderer/hooks/useSession';

import ImageGallery from '../ImageGallery';
import {
  ErrorMessage,
  HumanTextMessage,
  AssistantTextMessage,
  ScreenshotMessage,
  LoadingText,
  ToolOutputMessage,
} from './Messages';

const RunMessages = () => {
  const { messages = [], thinking, errorMsg } = useStore();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const suggestions: string[] = [];
  const [selectImg, setSelectImg] = useState<number | undefined>(undefined);
  const { currentSessionId, chatMessages, updateMessages } = useSession();
  const isWelcome = currentSessionId === '';
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(!isWelcome);

  // console.log('currentSessionId', currentSessionId);
  const lastMessage = messages[messages.length - 1];
  const lastMessageKey = lastMessage
    ? `${lastMessage.value}-${lastMessage.from}-${lastMessage.timing?.start}-${lastMessage.isStreaming ? 'streaming' : 'final'}`
    : '';

  useEffect(() => {
    if (!currentSessionId || !messages.length || lastMessage?.isStreaming) {
      return;
    }

    const existingMessagesSet = new Set(
      chatMessages.map(
        (msg) => `${msg.value}-${msg.from}-${msg.timing?.start}`,
      ),
    );
    const newMessages = messages.filter(
      (msg) =>
        !existingMessagesSet.has(
          `${msg.value}-${msg.from}-${msg.timing?.start}`,
        ),
    );

    if (!newMessages.length) {
      const lastChatMessage = chatMessages[chatMessages.length - 1];
      if (lastChatMessage?.isStreaming) {
        updateMessages(currentSessionId, [
          ...chatMessages.slice(0, -1),
          lastMessage,
        ]);
      }
      return;
    }

    const baseMessages = chatMessages[chatMessages.length - 1]?.isStreaming
      ? chatMessages.slice(0, -1)
      : chatMessages;
    updateMessages(currentSessionId, [...baseMessages, ...newMessages]);
  }, [currentSessionId, chatMessages.length, messages.length, lastMessageKey]);

  const displayMessages = useMemo(() => {
    if (!lastMessage) {
      return chatMessages;
    }
    if (!chatMessages.length) {
      return messages;
    }

    const lastChatMessage = chatMessages[chatMessages.length - 1];
    const lastChatKey = lastChatMessage
      ? `${lastChatMessage.value}-${lastChatMessage.from}-${lastChatMessage.timing?.start}`
      : '';
    const lastMessageKey = `${lastMessage.value}-${lastMessage.from}-${lastMessage.timing?.start}`;

    if (lastMessage.isStreaming) {
      const shouldReplace =
        lastChatMessage?.isStreaming ||
        (lastChatMessage?.timing?.start === lastMessage?.timing?.start &&
          lastMessage?.timing?.start !== undefined);
      return shouldReplace
        ? [...chatMessages.slice(0, -1), lastMessage]
        : [...chatMessages, lastMessage];
    }

    if (lastChatMessage?.isStreaming || lastChatKey !== lastMessageKey) {
      const baseMessages = lastChatMessage?.isStreaming
        ? chatMessages.slice(0, -1)
        : chatMessages;
      return [...baseMessages, lastMessage];
    }

    return chatMessages;
  }, [chatMessages, lastMessage, messages]);

  useEffect(() => {
    if (!currentSessionId.length) {
      setIsRightPanelOpen(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (chatMessages.length) {
      setIsRightPanelOpen(true);
    }
  }, [chatMessages.length]);

  useEffect(() => {
    setTimeout(() => {
      containerRef.current?.scrollIntoView(false);
    }, 100);
  }, [messages, thinking, errorMsg]);

  const handleSelect = async (suggestion: string) => {
    await api.setInstructions({ instructions: suggestion });
  };

  const handleImageSelect = async (index: number) => {
    setIsRightPanelOpen(true);
    setSelectImg(index);
  };

  const renderChatList = () => {
    return (
      <div className="flex-1 w-full px-12 py-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
        <div ref={containerRef}>
          {!displayMessages?.length && suggestions?.length > 0 && (
            <Prompts suggestions={suggestions} onSelect={handleSelect} />
          )}

          {displayMessages?.map((message, idx) => {
            // Handle tool output messages - require system origin and tool output prefix
            const isToolOutput =
              message?.from === 'system' &&
              message?.value?.startsWith('[Tool Output]');
            if (isToolOutput) {
              return (
                <ToolOutputMessage
                  key={`message-${idx}`}
                  text={message?.value}
                />
              );
            }

            if (message?.from === 'human') {
              if (message?.value === IMAGE_PLACEHOLDER) {
                // screen shot
                return (
                  <ScreenshotMessage
                    key={`message-${idx}`}
                    onClick={() => handleImageSelect(idx)}
                  />
                );
              }

              return (
                <HumanTextMessage
                  key={`message-${idx}`}
                  text={message?.value}
                />
              );
            }

            const {
              predictionParsed,
              screenshotBase64WithElementMarker,
              value,
            } = message;
            // Cast to access isStreaming which is defined in base Conversation type
            const isStreaming = (message as { isStreaming?: boolean })
              .isStreaming;

            // Find the finished step
            const finishedStep = predictionParsed?.find(
              (step) =>
                step.action_type === 'finished' &&
                step.action_inputs?.content &&
                typeof step.action_inputs.content === 'string' &&
                step.action_inputs.content.trim().length > 0,
            );

            // If there is a finished step, render the thought chain and the final result.
            // Otherwise, render the thought chain.
            return (
              <div key={idx}>
                {predictionParsed?.length ? (
                  <ThoughtChain
                    steps={predictionParsed}
                    hasSomImage={!!screenshotBase64WithElementMarker}
                    onClick={() => handleImageSelect(idx)}
                    isStreaming={isStreaming}
                  />
                ) : null}

                {finishedStep?.action_inputs?.content ? (
                  <AssistantTextMessage
                    text={finishedStep.action_inputs.content}
                  />
                ) : null}

                {/* 显示没有 predictionParsed 但有 value 的 gpt 消息（如预测的下一步动作） */}
                {(!predictionParsed || predictionParsed.length === 0) &&
                  value &&
                  !finishedStep && <AssistantTextMessage text={value} />}
              </div>
            );
          })}

          {thinking && <LoadingText text={'Thinking...'} />}
          {errorMsg && <ErrorMessage text={errorMsg} />}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex h-full justify-center">
      {/* Left Panel */}
      <div
        className={cn(
          'flex flex-col transition-all duration-300 ease-in-out',
          isRightPanelOpen ? 'w-1/2' : 'w-2/3 mx-auto',
        )}
      >
        <div className="flex w-full items-center mb-1">
          <SidebarTrigger className="ml-2 mr-auto size-9" />
          <ClearHistory />
          <ShareOptions />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className="mr-4"
          >
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isRightPanelOpen ? 'rotate-0' : 'rotate-180',
              )}
            />
          </Button>
        </div>
        {!isWelcome && renderChatList()}
        {/* <ChatInput /> */}
      </div>

      {/* Right Panel */}
      <div
        className={cn(
          'h-full border-l border-border bg-background transition-all duration-300 ease-in-out',
          isRightPanelOpen
            ? 'w-1/2 opacity-100'
            : 'w-0 opacity-0 overflow-hidden',
        )}
      >
        <ImageGallery messages={displayMessages} selectImgIndex={selectImg} />
      </div>
    </div>
  );
};

export default RunMessages;
