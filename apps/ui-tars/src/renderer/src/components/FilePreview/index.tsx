/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, FolderOpen } from 'lucide-react';
import { Button } from '@renderer/components/ui/button';
import FileList, { type FileInfo } from './FileList';
import FileViewer from './FileViewer';

const FilePreview: React.FC = () => {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [workspacePath, setWorkspacePath] = useState<string>('');

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
        setFiles(result.files);
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

  // Load file content when selection changes
  useEffect(() => {
    if (!selectedFile) {
      setFileContent(null);
      setContentError(null);
      return;
    }

    const loadContent = async () => {
      setIsLoadingContent(true);
      setContentError(null);
      try {
        const result = await window.electron.file.readFile(
          selectedFile.fullPath,
        );
        if (result.success) {
          setFileContent(result.content || '');
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
    };

    loadContent();
  }, [selectedFile]);

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
      {/* Header with refresh button */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Files ({files.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenWorkspace}
            title="Open workspace folder"
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadFiles}
            disabled={isLoadingFiles}
            title="Refresh file list"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoadingFiles ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </div>

      {/* Main content area - split view */}
      <div className="flex-1 flex min-h-0">
        {/* File list - left side */}
        <div className="w-[35%] border-r flex-shrink-0">
          <FileList
            files={files}
            selectedFile={selectedFile}
            onSelectFile={setSelectedFile}
            onOpenLocation={handleOpenLocation}
            isLoading={isLoadingFiles}
          />
        </div>

        {/* File viewer - right side */}
        <div className="flex-1 min-w-0">
          <FileViewer
            file={selectedFile}
            content={fileContent}
            isLoading={isLoadingContent}
            error={contentError}
          />
        </div>
      </div>
    </div>
  );
};

export default FilePreview;
