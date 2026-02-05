# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TARS is a Multimodal AI Agent stack with two main projects:
- **Agent TARS**: General multimodal AI agent with CLI and Web UI for browser automation via GUI Agent, DOM, or hybrid strategies
- **UI-TARS Desktop**: Native Electron desktop app for local GUI automation using the UI-TARS vision-language model

## Development Commands

```bash
# Install dependencies
pnpm install

# Start UI-TARS Desktop in development
pnpm run dev:ui-tars

# Development with main process hot reload
pnpm run dev:w

# Run unit tests
pnpm run test

# Run E2E tests (from apps/ui-tars)
pnpm run test:e2e

# Lint and format
pnpm run lint
pnpm run format

# Build for current platform
pnpm run build

# Platform-specific builds
pnpm run publish:mac-x64
pnpm run publish:mac-arm64
pnpm run publish:win32
pnpm run publish:win32-arm64
```

## Architecture

### Monorepo Structure

This is a pnpm workspace monorepo with Turbo for task orchestration.

**apps/ui-tars/** - Main Electron application
- `src/main/` - Electron main process (Node.js backend)
- `src/preload/` - Context bridge scripts
- `src/renderer/` - React UI built with Vite

**packages/agent-infra/** - Agent infrastructure
- `browser/` - Browser automation
- `mcp-client/` - MCP client implementation
- `mcp-servers/` - MCP server implementations
- `search/` - Search functionality
- `logger/` - Logging utilities

**packages/ui-tars/** - UI-TARS core packages
- `sdk/` - Cross-platform GUI automation toolkit
- `action-parser/` - Parse and execute UI-TARS model actions
- `electron-ipc/` - Type-safe IPC communication between main/renderer
- `operators/` - System and browser operators for controlling computer/browser
- `utio/` - UI automation I/O
- `visualizer/` - Visualization tools
- `cli/` - Agent TARS CLI

**packages/common/** - Shared configurations
- `configs/` - ESLint, Prettier, secretlint configs
- `electron-build/` - Electron build utilities

### Key Technologies

- **Desktop**: Electron 34 with electron-vite and electron-forge
- **UI**: React 19, TypeScript 5.9, Tailwind CSS 4, Zustand (state management)
- **Automation**: nut.js (@computer-use/nut-js) for cross-platform UI automation
- **Testing**: Vitest (unit), Playwright (E2E)
- **IPC**: Custom `@ui-tars/electron-ipc` for type-safe main/renderer communication

### Electron IPC Pattern

The `@ui-tars/electron-ipc` package provides type-safe communication:
- Define IPC channels with TypeScript interfaces
- Main process handlers are registered with type checking
- Renderer invokes channels with full type inference

## Code Style

- Conventional commits required (feat, fix, docs, chore, refactor, ci, test, revert, perf, release, tweak)
- Pre-commit hooks run Prettier formatting and TypeScript type checking
- Apache 2.0 license with copyright headers required on all files:
  ```
  Copyright (c) 2025 Bytedance, Inc. and its affiliates.
  SPDX-License-Identifier: Apache-2.0
  ```

## Testing

Unit tests use Vitest with workspace configuration that discovers tests in `src/` and `packages/` directories. E2E tests use Playwright targeting the full Electron app.

To run a specific test file:
```bash
pnpm run test -- path/to/test.spec.ts
```

## MacOS Permissions

When developing on MacOS, grant accessibility permissions to your terminal application (iTerm2, Terminal, etc.) for the automation features to work.
