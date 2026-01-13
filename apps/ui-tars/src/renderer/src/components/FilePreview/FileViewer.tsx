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
        <p className="text-sm">Select a file to preview</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="animate-pulse">Loading content...</div>
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
        <p className="text-sm">Unable to load file content</p>
      </div>
    );
  }

  const isMarkdown = file.extension === '.md';

  return (
    <div className="h-full flex flex-col">
      {/* File header */}
      <div className="flex-shrink-0 px-4 py-2 border-b bg-muted/30">
        <h3 className="text-sm font-medium truncate" title={file.name}>
          {file.name}
        </h3>
        <p className="text-xs text-muted-foreground">{file.path}</p>
      </div>

      {/* Content area */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isMarkdown ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <Markdown>{content}</Markdown>
            </div>
          ) : (
            <pre className="text-sm font-mono whitespace-pre-wrap break-words text-gray-700 dark:text-gray-300">
              {content}
            </pre>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FileViewer;
