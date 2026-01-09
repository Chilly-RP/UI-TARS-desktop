/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Key, keyboard } from '@computer-use/nut-js';
import {
  type ScreenshotOutput,
  type ExecuteParams,
  type ExecuteOutput,
  StatusEnum,
} from '@ui-tars/sdk/core';
import { NutJSOperator } from '@ui-tars/operator-nut-js';
import { clipboard } from 'electron';
import { desktopCapturer } from 'electron';

import * as env from '@main/env';
import { logger } from '@main/logger';
import { sleep } from '@ui-tars/shared/utils';
import { getScreenSize } from '@main/utils/screen';
import { SettingStore } from '@main/store/setting';
import { BashExecutor, FileExecutor } from '@main/tools';

// Local type definitions for tool inputs
// These mirror the types in @ui-tars/shared/types/agent.ts
interface BashActionInputs {
  command: string;
  args?: string[];
  timeout?: number;
}

type FileOperation = 'read' | 'write' | 'append' | 'list' | 'delete';

interface FileActionInputs {
  operation: FileOperation;
  path: string;
  content?: string;
}

export class NutJSElectronOperator extends NutJSOperator {
  static MANUAL = {
    ACTION_SPACES: [
      `click(start_box='[x1, y1, x2, y2]')`,
      `left_double(start_box='[x1, y1, x2, y2]')`,
      `right_single(start_box='[x1, y1, x2, y2]')`,
      `drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')`,
      `hotkey(key='')`,
      `type(content='') #If you want to submit your input, use "\\n" at the end of \`content\`.`,
      `scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')`,
      `wait() #Sleep for 5s and take a screenshot to check for any changes.`,
      `finished()`,
      `call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.`,
      // Extended tools for Skills support
      `bash(command='<cmd>', args='[arg1, arg2]') # Execute whitelisted bash commands (cat, ls, grep, etc). No file modifications allowed.`,
      `file(operation='read|write|append|list|delete', path='<path>', content='<text>') # File operations in sandbox (~/Documents/ui-tars-workspace).`,
    ],
  };

  // Tool executors for extended capabilities
  private bashExecutor: BashExecutor | null = null;
  private fileExecutor: FileExecutor | null = null;

  private getBashExecutor(): BashExecutor {
    if (!this.bashExecutor) {
      this.bashExecutor = new BashExecutor();
    }
    return this.bashExecutor;
  }

  private getFileExecutor(): FileExecutor {
    if (!this.fileExecutor) {
      this.fileExecutor = new FileExecutor();
    }
    return this.fileExecutor;
  }

  // Screenshot compression parameters - now read from settings
  private get screenshotJpegQuality(): number {
    return SettingStore.get('screenshotJpegQuality') ?? 75;
  }

  // Resolution scaling factor for screenshots (1.0 = original size, 0.5 = half size)
  // Reducing resolution can significantly improve inference latency
  protected get resolutionScaleFactor(): number {
    return SettingStore.get('resolutionScaleFactor') ?? 0.7;
  }

  public async screenshot(): Promise<ScreenshotOutput> {
    const {
      physicalSize,
      logicalSize,
      scaleFactor,
      id: primaryDisplayId,
    } = getScreenSize(); // Logical = Physical / scaleX

    logger.info(
      '[screenshot] [primaryDisplay]',
      'logicalSize:',
      logicalSize,
      'scaleFactor:',
      scaleFactor,
    );

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(logicalSize.width),
        height: Math.round(logicalSize.height),
      },
    });
    const primarySource =
      sources.find(
        (source) => source.display_id === primaryDisplayId.toString(),
      ) || sources[0];

    if (!primarySource) {
      logger.error('[screenshot] Primary display source not found', {
        primaryDisplayId,
        availableSources: sources.map((s) => s.display_id),
      });
      // fallback to default screenshot
      return await super.screenshot();
    }

    const screenshot = primarySource.thumbnail;

    // Log original screenshot dimensions before compression
    const originalWidth = screenshot.getSize().width;
    const originalHeight = screenshot.getSize().height;
    logger.info(
      '[screenshot] Original size before compression:',
      `${originalWidth}x${originalHeight} (${originalWidth * originalHeight} pixels)`,
    );

    // Apply resolution scaling to reduce image size for faster inference
    const scaledWidth = Math.round(
      physicalSize.width * this.resolutionScaleFactor,
    );
    const scaledHeight = Math.round(
      physicalSize.height * this.resolutionScaleFactor,
    );

    const resized = screenshot.resize({
      width: scaledWidth,
      height: scaledHeight,
    });

    // Convert to JPEG with configurable quality
    const jpegBuffer = resized.toJPEG(this.screenshotJpegQuality);
    const compressedBase64 = jpegBuffer.toString('base64');

    // Log compressed image dimensions and size
    logger.info(
      '[screenshot] Compressed size after JPEG compression:',
      `${scaledWidth}x${scaledHeight} (${scaledWidth * scaledHeight} pixels),`,
      `Resolution scale: ${this.resolutionScaleFactor},`,
      `Quality: ${this.screenshotJpegQuality}%,`,
      `Base64 length: ${compressedBase64.length} characters`,
    );

    // Return original scaleFactor (DPI scale), not modified by resolution scale
    // Coordinate restoration will be handled in execute() method
    return {
      base64: compressedBase64,
      scaleFactor,
    };
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { action_type, action_inputs } = params.parsedPrediction;

    // Handle extended tool actions
    if (action_type === 'bash') {
      return await this.executeBash(action_inputs);
    }

    if (action_type === 'file') {
      return await this.executeFile(action_inputs);
    }

    // Restore coordinates to original resolution
    // Since screenshot was scaled down by resolutionScaleFactor,
    // we need to scale the screen dimensions back up for correct coordinate calculation
    const restoredParams = {
      ...params,
      screenWidth: Math.round(params.screenWidth / this.resolutionScaleFactor),
      screenHeight: Math.round(
        params.screenHeight / this.resolutionScaleFactor,
      ),
    };

    logger.info(
      '[NutJSElectronOperator] Coordinate restoration:',
      `Scaled screen: ${params.screenWidth}x${params.screenHeight}`,
      `Original screen: ${restoredParams.screenWidth}x${restoredParams.screenHeight}`,
      `Resolution scale factor: ${this.resolutionScaleFactor}`,
    );

    if (action_type === 'type' && env.isWindows && action_inputs?.content) {
      const content = action_inputs.content?.trim();

      logger.info('[device] type', content);
      const stripContent = content.replace(/\\n$/, '').replace(/\n$/, '');
      const originalClipboard = clipboard.readText();
      clipboard.writeText(stripContent);
      await keyboard.pressKey(Key.LeftControl, Key.V);
      await sleep(50);
      await keyboard.releaseKey(Key.LeftControl, Key.V);
      await sleep(50);
      clipboard.writeText(originalClipboard);
    } else {
      return await super.execute(restoredParams);
    }
  }

  /**
   * Execute bash command action
   */
  private async executeBash(
    actionInputs: Record<string, unknown>,
  ): Promise<ExecuteOutput> {
    const bashInputs = actionInputs.bash as BashActionInputs | undefined;

    if (!bashInputs || !bashInputs.command) {
      logger.error('[NutJSElectronOperator] Invalid bash action inputs');
      return { status: StatusEnum.ERROR };
    }

    logger.info(
      '[NutJSElectronOperator] Executing bash command:',
      bashInputs.command,
    );

    const result = await this.getBashExecutor().execute(bashInputs);

    if (!result.success) {
      logger.error(
        '[NutJSElectronOperator] Bash execution failed:',
        result.error,
      );
      return { status: StatusEnum.ERROR };
    }

    logger.info('[NutJSElectronOperator] Bash execution succeeded');
    return { status: StatusEnum.RUNNING };
  }

  /**
   * Execute file operation action
   */
  private async executeFile(
    actionInputs: Record<string, unknown>,
  ): Promise<ExecuteOutput> {
    const fileInputs = actionInputs.file as FileActionInputs | undefined;

    if (!fileInputs || !fileInputs.operation || !fileInputs.path) {
      logger.error('[NutJSElectronOperator] Invalid file action inputs');
      return { status: StatusEnum.ERROR };
    }

    logger.info(
      '[NutJSElectronOperator] Executing file operation:',
      fileInputs.operation,
      'on',
      fileInputs.path,
    );

    const result = await this.getFileExecutor().execute(fileInputs);

    if (!result.success) {
      logger.error(
        '[NutJSElectronOperator] File operation failed:',
        result.error,
      );
      return { status: StatusEnum.ERROR };
    }

    logger.info('[NutJSElectronOperator] File operation succeeded');
    return { status: StatusEnum.RUNNING };
  }
}
