/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { FileText, FolderOpen, Eye, Download } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { cn } from '@renderer/utils';

export interface FileInfo {
  name: string;
  path: string;
  fullPath: string;
  size: number;
  modifiedTime: number;
  type: 'file' | 'directory';
  extension: string;
}

interface FileListProps {
  files: FileInfo[];
  selectedFile: FileInfo | null;
  onSelectFile: (file: FileInfo) => void;
  onOpenLocation: (file: FileInfo) => void;
  isLoading?: boolean;
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getFileIcon = (extension: string) => {
  const iconClass = 'w-4 h-4 flex-shrink-0';
  switch (extension) {
    case '.md':
    case '.txt':
    case '.json':
    case '.html':
      return <FileText className={cn(iconClass, 'text-blue-500')} />;
    default:
      return <FileText className={cn(iconClass, 'text-gray-500')} />;
  }
};

const FileList: React.FC<FileListProps> = ({
  files,
  selectedFile,
  onSelectFile,
  onOpenLocation,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="animate-pulse">Loading files...</div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-4">
        <FolderOpen className="w-12 h-12 text-gray-300" />
        <p className="text-sm text-center">No files in workspace</p>
        <p className="text-xs text-center text-gray-400">
          Generated files will appear here
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {files.map((file) => (
          <div
            key={file.fullPath}
            className={cn(
              'group flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
              selectedFile?.fullPath === file.fullPath
                ? 'bg-primary/10 border border-primary/20'
                : 'hover:bg-accent',
            )}
            onClick={() => onSelectFile(file)}
          >
            {getFileIcon(file.extension)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)} · {formatDate(file.modifiedTime)}
              </p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFile(file);
                }}
                title="Preview"
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLocation(file);
                }}
                title="Open in Finder"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default FileList;
