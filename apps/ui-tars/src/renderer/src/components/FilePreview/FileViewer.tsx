/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Markdown } from '@renderer/components/markdown';
import type { FileInfo } from './FileList';

interface FileViewerProps {
  file: FileInfo | null;
  content: string | null;
  isLoading: boolean;
  error: string | null;
}

const FileViewer: React.FC<FileViewerProps> = ({
  file,
  content,
  isLoading,
  error,
}) => {
  // Empty state
  if (!file) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
        <FileText className="w-16 h-16 text-gray-200" />
        <p className="text-sm">选择文件以预览</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="animate-pulse">加载中...</div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-destructive gap-2">
        <AlertCircle className="w-12 h-12" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // No content
  if (content === null) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">无法加载文件内容</p>
      </div>
    );
  }

  const isMarkdown = file.extension === '.md';

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        {isMarkdown ? (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <pre className="text-sm font-mono whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300 leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </ScrollArea>
  );
};

export default FileViewer;
