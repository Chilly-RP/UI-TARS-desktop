/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, FolderOpen, ArrowLeft } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import FileList, { type FileInfo } from './FileList';
import FileViewer from './FileViewer';

type ViewMode = 'list' | 'preview';

const FilePreview: React.FC = () => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isHtmlContent, setIsHtmlContent] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Load workspace path
  useEffect(() => {
    window.electron.file.getWorkspacePath().then(setWorkspacePath);
  }, []);

  // Load files list
  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    try {
      const result = await window.electron.file.listWorkspace();
      if (result.success) {
        // Filter out hidden files (starting with .)
        const visibleFiles = result.files.filter(
          (file) => !file.name.startsWith('.'),
        );
        setFiles(visibleFiles);
      } else {
        console.error('Failed to load files:', result.error);
        setFiles([]);
      }
    } catch (error) {
      console.error('Error loading files:', error);
      setFiles([]);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Load file content when entering preview mode
  const handlePreviewFile = useCallback(async (file: FileInfo) => {
    setSelectedFile(file);
    setViewMode('preview');
    setIsLoadingContent(true);
    setContentError(null);
    setIsHtmlContent(false);

    try {
      const result = await window.electron.file.readFile(file.fullPath);
      if (result.success) {
        setFileContent(result.content || '');
        setIsHtmlContent(result.isHtml || false);
      } else {
        setContentError(result.error || 'Failed to load file');
        setFileContent(null);
      }
    } catch (error) {
      setContentError(String(error));
      setFileContent(null);
    } finally {
      setIsLoadingContent(false);
    }
  }, []);

  // Back to list view
  const handleBackToList = useCallback(() => {
    setViewMode('list');
    setSelectedFile(null);
    setFileContent(null);
    setContentError(null);
    setIsHtmlContent(false);
  }, []);

  // Open file location
  const handleOpenLocation = useCallback(async (file: FileInfo) => {
    try {
      await window.electron.file.openFileLocation(file.fullPath);
    } catch (error) {
      console.error('Error opening file location:', error);
    }
  }, []);

  // Open workspace folder
  const handleOpenWorkspace = useCallback(async () => {
    if (workspacePath) {
      await window.electron.file.openFileLocation(workspacePath);
    }
  }, [workspacePath]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          {viewMode === 'preview' ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBackToList}
                className="gap-1"
              >
                <ArrowLeft className="h-4 w-4" />
                返回
              </Button>
              <span className="text-sm font-medium truncate max-w-[200px]">
                {selectedFile?.name}
              </span>
            </>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">
              文件 ({files.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {viewMode === 'list' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleOpenWorkspace}
                title="打开工作区文件夹"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadFiles}
                disabled={isLoadingFiles}
                title="刷新文件列表"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoadingFiles ? 'animate-spin' : ''}`}
                />
              </Button>
            </>
          )}
          {viewMode === 'preview' && selectedFile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenLocation(selectedFile)}
              title="在文件夹中显示"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Main content area - single view with navigation */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'list' ? (
          <FileList
            files={files}
            selectedFile={selectedFile}
            onPreviewFile={handlePreviewFile}
            onOpenLocation={handleOpenLocation}
            isLoading={isLoadingFiles}
          />
        ) : (
          <FileViewer
            file={selectedFile}
            content={fileContent}
            isLoading={isLoadingContent}
            error={contentError}
            isHtml={isHtmlContent}
          />
        )}
      </div>
    </div>
  );
};

export default FilePreview;
