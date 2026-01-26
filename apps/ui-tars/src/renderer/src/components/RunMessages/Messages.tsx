/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { AlertCircle, Camera, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { ErrorStatusEnum } from '@ui-tars/shared/types';

import { Button } from '@renderer/components/ui/button';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@renderer/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible';
import { cn } from '@renderer/utils';
import { Markdown } from '../markdown';

export const HumanTextMessage = ({ text }: { text: string }) => {
  return (
    <div className="flex gap-2 my-4 ml-4 items-center">
      <div className="ml-auto p-3 rounded-md bg-secondary">{text}</div>
    </div>
  );
};

export const AssistantTextMessage = ({ text }: { text: string }) => {
  return (
    <div className="flex gap-2 mb-4 items-center">
      <div className="mr-auto px-3 pt-3 pb-1 rounded-md bg-sky-100">
        <Markdown>{text.replace(/\\n/g, '\n')}</Markdown>
      </div>
    </div>
  );
};

interface ScreenshotMessageProps {
  onClick?: () => void;
}

export const ScreenshotMessage = ({ onClick }: ScreenshotMessageProps) => {
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-full"
      onClick={onClick}
    >
      <Camera className="w-4 h-4" />
      <span>Screenshot</span>
    </Button>
  );
};

const getError = (text: string) => {
  let error: { message: string; stack: string };
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.status) {
      const errorStatus = ErrorStatusEnum[parsed.status] || 'Error';
      error = {
        message: `${errorStatus}: ${parsed.message}`,
        stack: parsed.stack || text,
      };
    } else {
      error = {
        message: `Error: ${parsed.message || ''}`,
        stack: parsed.stack || text,
      };
    }
  } catch (e) {
    error = {
      message: 'Error:',
      stack: text,
    };
  }

  return error;
};

export const ErrorMessage = ({ text }: { text: string }) => {
  const error = getError(text);
  const [isExpanded, setIsExpanded] = useState(false);

  const MAX_LINE = 2;
  const stackLines = error.stack.split('\n') || [];
  const hasMoreLines = stackLines.length > MAX_LINE;
  const displayedStack = isExpanded
    ? error.stack
    : stackLines.slice(0, MAX_LINE).join('\n');

  return (
    <Alert variant="destructive" className="my-4 border-destructive/50">
      <AlertCircle />
      <AlertTitle className="break-all">{error.message}</AlertTitle>
      <AlertDescription className="break-all whitespace-pre-wrap">
        {displayedStack}
        {hasMoreLines && (
          <Button
            variant="outline"
            size="icon"
            className="absolute right-2 bottom-2 w-7 h-7 cursor-pointer hover:bg-red-50 hover:text-red-500"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <ChevronDown className={isExpanded ? 'rotate-180' : ''} />
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
};

export const LoadingText = ({ text }: { text: string }) => {
  return (
    <div className="mt-4">
      <div className="inline-flex items-center gap-2 text-muted-foreground animate-pulse">
        <Loader2 className="h-4 w-4 animate-spin" />
        {text}
      </div>
    </div>
  );
};

interface ToolOutputMessageProps {
  text: string;
}

export const ToolOutputMessage = ({ text }: ToolOutputMessageProps) => {
  const [isOpen, setIsOpen] = useState(false);

  // Parse the tool output format: "[Tool Output] actionType: output"
  const parseToolOutput = (rawText: string) => {
    const match = rawText.match(/^\[Tool Output\]\s*(\w+):\s*([\s\S]*)$/);
    if (match) {
      return {
        actionType: match[1],
        output: match[2],
      };
    }
    return {
      actionType: 'unknown',
      output: rawText,
    };
  };

  const { actionType, output } = parseToolOutput(text);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="my-2">
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">
        <ChevronRight
          className={cn(
            'h-3 w-3 transition-transform duration-200',
            isOpen && 'rotate-90',
          )}
        />
        <span className="font-medium">Tool Output</span>
        <span className="text-gray-400">({actionType})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-4 mt-1">
        <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono bg-gray-50 p-2 rounded border border-gray-100 max-h-48 overflow-y-auto">
          {output}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
};
