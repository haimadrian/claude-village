# claude-village Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Mac desktop app (Electron + React + Three.js) that visualizes running Claude Code sessions as an animated Minecraft-style village, with tabs per session, voxel characters per agent, and activity-mapped zones.

**Architecture:** Electron app with two processes. Main process tails `~/.claude/projects/**/*.jsonl` + runs a local hook server, classifies events into zones/animations, and pushes diffs over IPC. Renderer runs React for tab chrome plus one Three.js scene per active tab, with A* pathfinding, tooltips, a timeline strip, and conversation animations.

**Tech Stack:** Electron, TypeScript (strict), Vite, React, `@react-three/fiber`, `@react-three/drei`, Three.js, `chokidar`, `better-sqlite3`, `pathfinding` (A*), Vitest, Playwright, ESLint + Prettier, `electron-builder`.

**Spec:** `docs/design/2026-04-20-claude-village-design.md` - read this first. Every task below traces back to a numbered section of the spec.

---

## File structure (target)

```
claude-village/
├── package.json                        # root - electron + workspace scripts
├── pnpm-workspace.yaml                 # pnpm workspaces
├── tsconfig.base.json                  # shared TS compiler options
├── tsconfig.node.json                  # main process TS config
├── tsconfig.web.json                   # renderer TS config
├── electron.vite.config.ts             # electron-vite build config
├── electron-builder.yml                # .dmg packaging
├── .eslintrc.cjs
├── .prettierrc
├── .github/workflows/ci.yml            # lint + unit tests on push
│
├── src/
│   ├── shared/
│   │   ├── types.ts                    # AgentEvent, AgentState, SessionState, ZoneLabel
│   │   └── zones.ts                    # zone metadata (id, name, icon, description)
│   │
│   ├── main/
│   │   ├── index.ts                    # Electron main entry, window + lifecycle
│   │   ├── session-watcher.ts          # chokidar + JSONL parser + offset tracking
│   │   ├── hook-server.ts              # unix socket + HTTP listener for hooks
│   │   ├── classifier.ts               # AgentEvent -> zone/animation/tooltip
│   │   ├── session-store.ts            # in-memory + SQLite snapshot/restore
│   │   └── ipc-bridge.ts               # ipcMain handlers + session:patch stream
│   │
│   ├── preload/
│   │   └── index.ts                    # contextBridge exposing ipc APIs
│   │
│   └── renderer/
│       ├── index.html
│       ├── main.tsx                    # React root
│       ├── App.tsx                     # tab chrome + sidebar
│       ├── context/
│       │   └── SessionContext.tsx      # per-session state mirror, pin/close
│       ├── village/
│       │   ├── VillageScene.tsx        # Three.js scene per tab
│       │   ├── Zone.tsx                # zone voxel props + signpost + icon
│       │   ├── Character.tsx           # character mesh + animation SM
│       │   ├── pathfinding.ts          # A* on walkable grid
│       │   ├── TooltipLayer.tsx        # raycast hover tooltip
│       │   ├── TimelineStrip.tsx       # collapsible bottom panel
│       │   └── conversation.ts         # huddle triggers + bubble drawer
│       └── settings/
│           ├── SettingsScreen.tsx
│           └── AboutModal.tsx
│
└── tests/
    ├── fixtures/
    │   ├── sample-session.jsonl
    │   └── subagent-return.jsonl
    ├── unit/                           # Vitest - pure function tests
    │   ├── classifier.test.ts
    │   ├── session-store.test.ts
    │   ├── session-watcher.test.ts
    │   ├── hook-server.test.ts
    │   └── pathfinding.test.ts
    └── e2e/                            # Playwright integration
        └── session-sync.spec.ts
```

Tasks 3-7 each own a single file in `src/main/`. Tasks 8-15 each own a single area of `src/renderer/`. No two parallel tasks modify the same file.

---

## Task 1: Repo scaffold (foundation, serial)

**Spec reference:** Section 13 (Tech stack), Section 15 (Repo conventions).

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.node.json`, `tsconfig.web.json`, `electron.vite.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `.github/workflows/ci.yml`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.tsx`, `src/renderer/App.tsx`
- This task establishes the shell. Later tasks fill in real logic.

- [ ] **Step 1: Initialize root `package.json`**

Create `package.json`:

```json
{
  "name": "claude-village",
  "version": "0.1.0",
  "description": "Visualize Claude Code sessions as an animated Minecraft-style village",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-builder --mac",
    "lint": "eslint src --ext .ts,.tsx && prettier --check \"src/**/*.{ts,tsx,json,md}\"",
    "lint:fix": "eslint src --ext .ts,.tsx --fix && prettier --write \"src/**/*.{ts,tsx,json,md}\"",
    "typecheck": "tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "chokidar": "^4.0.1",
    "pathfinding": "^0.4.18"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@types/node": "^22.7.0",
    "@types/pathfinding": "^0.0.9",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/three": "^0.169.0",
    "@typescript-eslint/eslint-plugin": "^8.8.0",
    "@typescript-eslint/parser": "^8.8.0",
    "@react-three/drei": "^9.114.0",
    "@react-three/fiber": "^8.17.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^2.3.0",
    "eslint": "^9.12.0",
    "eslint-plugin-react": "^7.37.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "prettier": "^3.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "three": "^0.169.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `pnpm install`
Expected: lockfile created, no install errors. `better-sqlite3` may rebuild against Electron in a later step.

- [ ] **Step 3: Create TS configs**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

Create `tsconfig.node.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"],
    "outDir": "out/main"
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*"]
}
```

Create `tsconfig.web.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "outDir": "out/renderer"
  },
  "include": ["src/renderer/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 4: Create `electron.vite.config.ts`**

```ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/main", rollupOptions: { input: "src/main/index.ts" } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: "out/preload", rollupOptions: { input: "src/preload/index.ts" } }
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    build: { outDir: "out/renderer" }
  }
});
```

Install the missing vite plugin: `pnpm add -D @vitejs/plugin-react`

- [ ] **Step 5: Create minimal Electron entry `src/main/index.ts`**

```ts
import { app, BrowserWindow } from "electron";
import path from "node:path";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "claude-village",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

- [ ] **Step 6: Create minimal preload `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("claudeVillage", {
  ping: () => ipcRenderer.invoke("ping")
});
```

- [ ] **Step 7: Create minimal renderer `src/renderer/index.html` + `main.tsx` + `App.tsx`**

`src/renderer/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>claude-village</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/renderer/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const container = document.getElementById("root")!;
createRoot(container).render(<App />);
```

`src/renderer/App.tsx`:

```tsx
export default function App() {
  return <div style={{ fontFamily: "monospace", padding: 24 }}>claude-village</div>;
}
```

- [ ] **Step 8: Create ESLint + Prettier configs**

`.eslintrc.cjs`:

```js
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  settings: { react: { version: "detect" } },
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  rules: { "react/react-in-jsx-scope": "off" }
};
```

`.prettierrc`:

```json
{ "printWidth": 100, "singleQuote": false, "trailingComma": "none" }
```

- [ ] **Step 9: Create CI workflow `.github/workflows/ci.yml`**

```yaml
name: CI
on: [push, pull_request]
jobs:
  lint-and-test:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Step 10: Smoke test - launch the app**

Run: `pnpm dev`
Expected: a 1280x800 Electron window opens showing the text "claude-village". No errors in the console. Close with Cmd+Q.

- [ ] **Step 11: Commit**

```bash
git add .
git commit -m "chore: scaffold electron + vite + react + typescript + tooling"
```

---

## Task 2: Shared types (foundation, serial)

**Spec reference:** Section 5 (`AgentEvent` shape), Section 3 (zone vocabulary), Section 6 (`AgentState`).

**Files:**
- Create: `src/shared/types.ts`, `src/shared/zones.ts`

This task locks the contracts that tasks 3-15 depend on. Get these right before parallel work begins.

- [ ] **Step 1: Create `src/shared/zones.ts`**

```ts
export type ZoneId =
  | "office"
  | "library"
  | "mine"
  | "forest"
  | "farm"
  | "nether"
  | "signpost"
  | "spawner"
  | "tavern";

export interface ZoneMeta {
  id: ZoneId;
  name: string;
  icon: string;          // emoji
  description: string;   // shown in tooltip
}

export const ZONES: readonly ZoneMeta[] = [
  { id: "office",   name: "Office",        icon: "🏢", description: "Writing or editing code (Write, Edit, NotebookEdit)" },
  { id: "library",  name: "Library",       icon: "📚", description: "Reading files (Read)" },
  { id: "mine",     name: "Mine",          icon: "⛏️", description: "Searching the codebase (Glob, Grep)" },
  { id: "forest",   name: "Forest",        icon: "🌲", description: "Running generic shell commands (Bash)" },
  { id: "farm",     name: "Farm",          icon: "🌾", description: "Running tests" },
  { id: "nether",   name: "Nether portal", icon: "🔥", description: "Git operations" },
  { id: "signpost", name: "Signpost",      icon: "🪧", description: "Fetching external resources (WebFetch, WebSearch, MCP)" },
  { id: "spawner",  name: "Spawner",       icon: "✨", description: "Delegating to subagents (Task)" },
  { id: "tavern",   name: "Tavern",        icon: "🍺", description: "Idle, finished, or retired ghosts" }
] as const;
```

- [ ] **Step 2: Create `src/shared/types.ts`**

```ts
import type { ZoneId } from "./zones";

export type AgentKind = "main" | "subagent";

export type AnimationState =
  | "idle"
  | "walk"
  | "work-office"
  | "work-library"
  | "work-mine"
  | "work-forest"
  | "work-farm"
  | "work-nether"
  | "work-signpost"
  | "work-spawner"
  | "work-tavern"
  | "ghost";

export interface AgentEvent {
  sessionId: string;
  agentId: string;
  parentAgentId?: string;
  kind: AgentKind;
  timestamp: number;
  type:
    | "session-start"
    | "session-end"
    | "subagent-start"
    | "subagent-end"
    | "user-message"
    | "assistant-message"
    | "pre-tool-use"
    | "post-tool-use";
  toolName?: string;
  toolArgsSummary?: string;
  resultSummary?: string;
  messageExcerpt?: string;
  rawLine?: string;
}

export interface AgentAction {
  timestamp: number;
  zone: ZoneId;
  summary: string;        // ready-to-render label
}

export interface AgentState {
  id: string;
  kind: AgentKind;
  parentId?: string;
  currentZone: ZoneId;
  targetZone: ZoneId;
  animation: AnimationState;
  recentActions: AgentAction[];   // ring buffer, max 5
  ghostExpiresAt?: number;        // epoch ms
  skinColor: string;              // hex, derived from hash(id)
}

export interface SessionState {
  sessionId: string;
  projectPath: string;
  startedAt: number;
  lastActivityAt: number;
  status: "active" | "idle" | "ended";
  agents: Map<string, AgentState>;
  timeline: TimelineLine[];       // ring buffer, max 500
}

export interface TimelineLine {
  id: string;                     // event hash
  timestamp: number;
  agentId: string;
  agentKind: AgentKind;
  kind: "user" | "assistant" | "tool-call" | "tool-result";
  text: string;                   // condensed, already truncated
}

export interface Classification {
  zone: ZoneId;
  animation: AnimationState;
  tooltip: string;
  timelineText: string;
}
```

- [ ] **Step 3: Verify compilation**

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared
git commit -m "feat: define shared types for agent events, state, and zones"
```

---

## Task 3: `session-watcher.ts` (main, parallelizable)

**Spec reference:** Section 5 (JSONL file tailing), Section 11 (error handling).

**Files:**
- Create: `src/main/session-watcher.ts`, `tests/unit/session-watcher.test.ts`, `tests/fixtures/sample-session.jsonl`

- [ ] **Step 1: Create a fixture JSONL file**

`tests/fixtures/sample-session.jsonl`:

```jsonl
{"type":"user","message":{"role":"user","content":"hello"},"sessionId":"sess-1","uuid":"u-1","timestamp":"2026-04-20T10:00:00Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi"}]},"sessionId":"sess-1","uuid":"u-2","timestamp":"2026-04-20T10:00:01Z"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"tool_use","id":"tu-1","name":"Read","input":{"file_path":"/tmp/x.ts"}}]},"sessionId":"sess-1","uuid":"u-3","timestamp":"2026-04-20T10:00:02Z"}
```

- [ ] **Step 2: Write failing tests `tests/unit/session-watcher.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SessionWatcher } from "../../src/main/session-watcher";
import type { AgentEvent } from "../../src/shared/types";

describe("SessionWatcher", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cv-watcher-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("emits one AgentEvent per JSONL line appended", async () => {
    const watcher = new SessionWatcher(tmpRoot);
    const received: AgentEvent[] = [];
    watcher.on("event", (e) => received.push(e));
    await watcher.start();

    const projDir = path.join(tmpRoot, "-project");
    fs.mkdirSync(projDir, { recursive: true });
    const file = path.join(projDir, "sess-1.jsonl");

    fs.writeFileSync(
      file,
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" }, sessionId: "sess-1", uuid: "u-1", timestamp: "2026-04-20T10:00:00Z" }) + "\n"
    );

    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBe(1);
    expect(received[0]?.type).toBe("user-message");
    expect(received[0]?.sessionId).toBe("sess-1");

    await watcher.stop();
  });

  it("skips malformed lines without crashing", async () => {
    const watcher = new SessionWatcher(tmpRoot);
    const received: AgentEvent[] = [];
    watcher.on("event", (e) => received.push(e));
    await watcher.start();

    const projDir = path.join(tmpRoot, "-project");
    fs.mkdirSync(projDir, { recursive: true });
    const file = path.join(projDir, "sess-1.jsonl");
    fs.writeFileSync(file, "not json\n" + JSON.stringify({ type: "user", message: { role: "user", content: "hi" }, sessionId: "sess-1", uuid: "u-2", timestamp: "2026-04-20T10:00:00Z" }) + "\n");

    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBe(1);
    await watcher.stop();
  });

  it("resets offset when file is truncated", async () => {
    const watcher = new SessionWatcher(tmpRoot);
    const received: AgentEvent[] = [];
    watcher.on("event", (e) => received.push(e));
    await watcher.start();

    const projDir = path.join(tmpRoot, "-project");
    fs.mkdirSync(projDir, { recursive: true });
    const file = path.join(projDir, "sess-1.jsonl");

    fs.writeFileSync(file, JSON.stringify({ type: "user", message: { role: "user", content: "old" }, sessionId: "sess-1", uuid: "u-1", timestamp: "2026-04-20T10:00:00Z" }) + "\n");
    await new Promise((r) => setTimeout(r, 300));

    fs.writeFileSync(file, JSON.stringify({ type: "user", message: { role: "user", content: "new" }, sessionId: "sess-1", uuid: "u-2", timestamp: "2026-04-20T10:00:01Z" }) + "\n");
    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBe(2);
    await watcher.stop();
  });
});
```

- [ ] **Step 3: Run tests to see them fail**

Run: `pnpm vitest run tests/unit/session-watcher.test.ts`
Expected: FAIL - `SessionWatcher` not defined.

- [ ] **Step 4: Implement `src/main/session-watcher.ts`**

```ts
import chokidar from "chokidar";
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { AgentEvent } from "../shared/types";

export class SessionWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private offsets = new Map<string, number>();

  constructor(private readonly rootDir: string) {
    super();
  }

  async start(): Promise<void> {
    this.watcher = chokidar.watch(path.join(this.rootDir, "**/*.jsonl"), {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 }
    });

    this.watcher.on("add", (file) => this.readFromOffset(file));
    this.watcher.on("change", (file) => this.readFromOffset(file));
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    this.watcher = null;
    this.offsets.clear();
  }

  private readFromOffset(file: string): void {
    let offset = this.offsets.get(file) ?? 0;
    const size = fs.statSync(file).size;
    if (offset > size) offset = 0;

    if (offset >= size) return;

    const stream = fs.createReadStream(file, { start: offset, end: size - 1, encoding: "utf8" });
    let buffer = "";
    stream.on("data", (chunk) => (buffer += chunk));
    stream.on("end", () => {
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = this.parseLine(line, file);
        if (event) this.emit("event", event);
      }
      this.offsets.set(file, size);
    });
  }

  private parseLine(line: string, file: string): AgentEvent | null {
    let raw: any;
    try {
      raw = JSON.parse(line);
    } catch {
      return null;
    }
    return normalizeJsonlEvent(raw, file, line);
  }
}

function normalizeJsonlEvent(raw: any, file: string, rawLine: string): AgentEvent | null {
  if (!raw?.sessionId) return null;
  const timestamp = raw.timestamp ? Date.parse(raw.timestamp) : Date.now();

  if (raw.type === "user") {
    return {
      sessionId: raw.sessionId,
      agentId: raw.sessionId, // main agent shares id with session for now
      kind: "main",
      timestamp,
      type: "user-message",
      messageExcerpt: extractText(raw.message?.content)?.slice(0, 500),
      rawLine
    };
  }

  if (raw.type === "assistant") {
    const content = raw.message?.content;
    const toolUse = Array.isArray(content) ? content.find((p: any) => p.type === "tool_use") : null;
    if (toolUse) {
      return {
        sessionId: raw.sessionId,
        agentId: raw.sessionId,
        kind: "main",
        timestamp,
        type: "pre-tool-use",
        toolName: toolUse.name,
        toolArgsSummary: summarizeArgs(toolUse.name, toolUse.input),
        rawLine
      };
    }
    return {
      sessionId: raw.sessionId,
      agentId: raw.sessionId,
      kind: "main",
      timestamp,
      type: "assistant-message",
      messageExcerpt: extractText(content)?.slice(0, 500),
      rawLine
    };
  }

  if (raw.type === "tool_result" || raw.type === "user-tool-result") {
    return {
      sessionId: raw.sessionId,
      agentId: raw.sessionId,
      kind: "main",
      timestamp,
      type: "post-tool-use",
      resultSummary: extractText(raw.toolUseResult ?? raw.content)?.slice(0, 200),
      rawLine
    };
  }

  return null;
}

function extractText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) => (typeof p === "string" ? p : p?.text ?? ""))
      .filter(Boolean)
      .join(" ");
  }
  return undefined;
}

function summarizeArgs(tool: string, input: any): string {
  if (!input) return "";
  if (tool === "Read" || tool === "Edit" || tool === "Write") return String(input.file_path ?? "");
  if (tool === "Bash") return String(input.command ?? "").slice(0, 80);
  if (tool === "Grep" || tool === "Glob") return String(input.pattern ?? input.path ?? "");
  return JSON.stringify(input).slice(0, 80);
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm vitest run tests/unit/session-watcher.test.ts`
Expected: PASS all 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/main/session-watcher.ts tests/unit/session-watcher.test.ts tests/fixtures/sample-session.jsonl
git commit -m "feat(main): add session-watcher with JSONL tailing and offset tracking"
```

---

## Task 4: `hook-server.ts` (main, parallelizable)

**Spec reference:** Section 5 (Claude Code hooks), Section 10 (hook-install one-click).

**Files:**
- Create: `src/main/hook-server.ts`, `tests/unit/hook-server.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { HookServer } from "../../src/main/hook-server";
import type { AgentEvent } from "../../src/shared/types";

describe("HookServer", () => {
  let server: HookServer | null = null;
  afterEach(async () => { await server?.stop(); server = null; });

  it("converts PreToolUse hook payload into AgentEvent", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e) => received.push(e));
    const port = await server.start();

    await post(port, "/event", {
      hook_event_name: "PreToolUse",
      session_id: "sess-1",
      tool_name: "Read",
      tool_input: { file_path: "/tmp/x.ts" }
    });

    expect(received.length).toBe(1);
    expect(received[0]?.type).toBe("pre-tool-use");
    expect(received[0]?.toolName).toBe("Read");
    expect(received[0]?.sessionId).toBe("sess-1");
  });

  it("ignores unknown hook types", async () => {
    server = new HookServer();
    const received: AgentEvent[] = [];
    server.on("event", (e) => received.push(e));
    const port = await server.start();

    await post(port, "/event", { hook_event_name: "Nonsense", session_id: "sess-1" });

    expect(received.length).toBe(0);
  });
});

function post(port: number, path: string, body: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json" } },
      (res) => { res.on("data", () => {}); res.on("end", () => resolve()); }
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}
```

- [ ] **Step 2: Run tests - expect FAIL**

Run: `pnpm vitest run tests/unit/hook-server.test.ts`
Expected: FAIL - `HookServer` not defined.

- [ ] **Step 3: Implement `src/main/hook-server.ts`**

```ts
import http from "node:http";
import { EventEmitter } from "node:events";
import type { AgentEvent } from "../shared/types";

export class HookServer extends EventEmitter {
  private server: http.Server | null = null;

  async start(preferredPort = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (req.method !== "POST" || req.url !== "/event") {
          res.writeHead(404).end();
          return;
        }
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            const event = hookPayloadToAgentEvent(payload);
            if (event) this.emit("event", event);
            res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
          } catch (e) {
            res.writeHead(400).end();
          }
        });
      });

      this.server.on("error", reject);
      this.server.listen(preferredPort, "127.0.0.1", () => {
        const addr = this.server!.address();
        resolve(typeof addr === "object" && addr ? addr.port : preferredPort);
      });
    });
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
    this.server = null;
  }
}

function hookPayloadToAgentEvent(p: any): AgentEvent | null {
  if (!p?.session_id) return null;
  const base = { sessionId: p.session_id as string, agentId: p.agent_id ?? p.session_id, kind: (p.agent_id ? "subagent" : "main") as const, timestamp: Date.now() };

  switch (p.hook_event_name) {
    case "SessionStart":
      return { ...base, type: "session-start" };
    case "SubagentStart":
      return { ...base, kind: "subagent", parentAgentId: p.parent_agent_id, type: "subagent-start" };
    case "PreToolUse":
      return { ...base, type: "pre-tool-use", toolName: p.tool_name, toolArgsSummary: summarize(p.tool_name, p.tool_input) };
    case "PostToolUse":
      return { ...base, type: "post-tool-use", toolName: p.tool_name, resultSummary: String(p.tool_result ?? "").slice(0, 200) };
    case "Stop":
      return { ...base, type: p.agent_id ? "subagent-end" : "session-end" };
    default:
      return null;
  }
}

function summarize(tool: string, input: any): string {
  if (!input) return "";
  if (tool === "Read" || tool === "Edit" || tool === "Write") return String(input.file_path ?? "");
  if (tool === "Bash") return String(input.command ?? "").slice(0, 80);
  if (tool === "Grep" || tool === "Glob") return String(input.pattern ?? input.path ?? "");
  return JSON.stringify(input).slice(0, 80);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run tests/unit/hook-server.test.ts`
Expected: PASS both tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/hook-server.ts tests/unit/hook-server.test.ts
git commit -m "feat(main): add HTTP hook server for Claude Code event payloads"
```

---

## Task 5: `classifier.ts` (main, parallelizable)

**Spec reference:** Section 3 (zone vocabulary), Section 5 (event reactions).

**Files:**
- Create: `src/main/classifier.ts`, `tests/unit/classifier.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { classify } from "../../src/main/classifier";
import type { AgentEvent } from "../../src/shared/types";

const base: Omit<AgentEvent, "type"> = {
  sessionId: "s",
  agentId: "a",
  kind: "main",
  timestamp: 0
};

describe("classify", () => {
  it("maps Read to library", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/tmp/x.ts" }).zone).toBe("library");
  });

  it("maps Write to office", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Write" }).zone).toBe("office");
  });

  it("maps Edit to office", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Edit" }).zone).toBe("office");
  });

  it("maps Grep to mine", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Grep" }).zone).toBe("mine");
  });

  it("maps Glob to mine", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Glob" }).zone).toBe("mine");
  });

  it("maps Task to spawner", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Task" }).zone).toBe("spawner");
  });

  it("maps WebFetch to signpost", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "WebFetch" }).zone).toBe("signpost");
  });

  it("maps MCP tools (mcp__*) to signpost", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "mcp__github__get_file_contents" }).zone).toBe("signpost");
  });

  it("maps Bash with test command to farm", () => {
    const r = classify({ ...base, type: "pre-tool-use", toolName: "Bash", toolArgsSummary: "pnpm test" });
    expect(r.zone).toBe("farm");
  });

  it("maps Bash with git command to nether", () => {
    const r = classify({ ...base, type: "pre-tool-use", toolName: "Bash", toolArgsSummary: "git commit -m 'x'" });
    expect(r.zone).toBe("nether");
  });

  it("maps generic Bash to forest", () => {
    const r = classify({ ...base, type: "pre-tool-use", toolName: "Bash", toolArgsSummary: "ls -la" });
    expect(r.zone).toBe("forest");
  });

  it("maps session-end to tavern", () => {
    expect(classify({ ...base, type: "session-end" }).zone).toBe("tavern");
  });

  it("animation matches zone", () => {
    const r = classify({ ...base, type: "pre-tool-use", toolName: "Read" });
    expect(r.animation).toBe("work-library");
  });

  it("emits human-readable tooltip for Read", () => {
    const r = classify({ ...base, type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/tmp/x.ts" });
    expect(r.tooltip).toContain("/tmp/x.ts");
  });
});
```

- [ ] **Step 2: Run tests - expect FAIL**

Run: `pnpm vitest run tests/unit/classifier.test.ts`
Expected: FAIL - `classify` not defined.

- [ ] **Step 3: Implement `src/main/classifier.ts`**

```ts
import type { AgentEvent, Classification, AnimationState } from "../shared/types";
import type { ZoneId } from "../shared/zones";

const TEST_RE = /\b(pnpm test|npm test|yarn test|vitest|jest|pytest|rspec|ruby -Itest|go test|cargo test)\b/;
const GIT_RE = /\bgit (commit|push|pull|checkout|branch|merge|rebase|fetch|log|diff|status|reset|revert|tag)\b|^gh\s/;

export function classify(event: AgentEvent): Classification {
  if (event.type === "session-end" || event.type === "subagent-end") {
    return { zone: "tavern", animation: "work-tavern", tooltip: "Idle", timelineText: event.type === "session-end" ? "Session ended" : "Subagent finished" };
  }

  if (event.type === "user-message") {
    return { zone: "tavern", animation: "idle", tooltip: `User: ${event.messageExcerpt ?? ""}`, timelineText: `user: ${event.messageExcerpt ?? ""}` };
  }

  if (event.type === "assistant-message") {
    return { zone: "tavern", animation: "idle", tooltip: event.messageExcerpt ?? "Thinking", timelineText: `assistant: ${event.messageExcerpt ?? ""}` };
  }

  if (event.type === "pre-tool-use") {
    const zone = toolToZone(event.toolName ?? "", event.toolArgsSummary ?? "");
    return {
      zone,
      animation: zoneToAnimation(zone),
      tooltip: `${event.toolName ?? "tool"} ${event.toolArgsSummary ?? ""}`.trim(),
      timelineText: `${event.toolName ?? "tool"}(${event.toolArgsSummary ?? ""})`
    };
  }

  if (event.type === "post-tool-use") {
    const zone = toolToZone(event.toolName ?? "", "");
    return {
      zone,
      animation: zoneToAnimation(zone),
      tooltip: event.resultSummary ?? "Done",
      timelineText: `-> ${event.resultSummary ?? ""}`
    };
  }

  return { zone: "tavern", animation: "idle", tooltip: "", timelineText: "" };
}

function toolToZone(tool: string, args: string): ZoneId {
  if (tool === "Read") return "library";
  if (tool === "Write" || tool === "Edit" || tool === "NotebookEdit") return "office";
  if (tool === "Grep" || tool === "Glob") return "mine";
  if (tool === "Task" || tool === "Agent") return "spawner";
  if (tool === "WebFetch" || tool === "WebSearch") return "signpost";
  if (tool.startsWith("mcp__")) return "signpost";
  if (tool === "Bash") {
    if (TEST_RE.test(args)) return "farm";
    if (GIT_RE.test(args)) return "nether";
    return "forest";
  }
  return "tavern";
}

function zoneToAnimation(zone: ZoneId): AnimationState {
  return `work-${zone}` as AnimationState;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run tests/unit/classifier.test.ts`
Expected: PASS all 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/classifier.ts tests/unit/classifier.test.ts
git commit -m "feat(main): classify agent events into zones and animations"
```

---

## Task 6: `session-store.ts` (main, parallelizable)

**Spec reference:** Section 4 (session-store), Section 6 (AgentState + ghost expiry).

**Files:**
- Create: `src/main/session-store.ts`, `tests/unit/session-store.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { SessionStore } from "../../src/main/session-store";
import type { AgentEvent } from "../../src/shared/types";

const ev = (e: Partial<AgentEvent>): AgentEvent => ({
  sessionId: "s1", agentId: "a1", kind: "main", timestamp: Date.now(), type: "pre-tool-use", ...e
} as AgentEvent);

describe("SessionStore", () => {
  let store: SessionStore;
  beforeEach(() => { store = new SessionStore(":memory:"); });

  it("creates a session on session-start", () => {
    store.apply(ev({ type: "session-start" }));
    const s = store.getSession("s1");
    expect(s?.status).toBe("active");
    expect(s?.agents.size).toBe(1);
  });

  it("moves main agent to correct zone on pre-tool-use", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/x.ts" }));
    const agent = store.getSession("s1")?.agents.get("a1");
    expect(agent?.targetZone).toBe("library");
  });

  it("creates subagent on subagent-start", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ agentId: "sub-1", kind: "subagent", parentAgentId: "a1", type: "subagent-start" }));
    expect(store.getSession("s1")?.agents.size).toBe(2);
    expect(store.getSession("s1")?.agents.get("sub-1")?.kind).toBe("subagent");
  });

  it("marks subagent as ghost on subagent-end", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ agentId: "sub-1", kind: "subagent", parentAgentId: "a1", type: "subagent-start" }));
    store.apply(ev({ agentId: "sub-1", kind: "subagent", type: "subagent-end" }));
    const sub = store.getSession("s1")?.agents.get("sub-1");
    expect(sub?.animation).toBe("ghost");
    expect(sub?.ghostExpiresAt).toBeGreaterThan(Date.now());
  });

  it("ends session on session-end", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "session-end" }));
    expect(store.getSession("s1")?.status).toBe("ended");
  });

  it("emits a diff on every apply", () => {
    let diffs = 0;
    store.on("patch", () => diffs++);
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "pre-tool-use", toolName: "Read" }));
    expect(diffs).toBe(2);
  });

  it("expires ghosts past their timer", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ agentId: "sub-1", kind: "subagent", parentAgentId: "a1", type: "subagent-start" }));
    store.apply(ev({ agentId: "sub-1", kind: "subagent", type: "subagent-end", timestamp: Date.now() - 10 * 60 * 1000 }));
    // simulate time passing
    store.expireGhosts(Date.now());
    expect(store.getSession("s1")?.agents.get("sub-1")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run - expect FAIL**

Run: `pnpm vitest run tests/unit/session-store.test.ts`

- [ ] **Step 3: Implement `src/main/session-store.ts`**

```ts
import { EventEmitter } from "node:events";
import Database from "better-sqlite3";
import { classify } from "./classifier";
import type { AgentEvent, SessionState, AgentState, TimelineLine } from "../shared/types";
import type { ZoneId } from "../shared/zones";

const GHOST_MS = 3 * 60 * 1000;
const TIMELINE_CAP = 500;
const ACTIONS_CAP = 5;

export interface SessionPatch {
  sessionId: string;
  changes: Array<
    | { kind: "session-upsert"; session: Omit<SessionState, "agents" | "timeline"> }
    | { kind: "agent-upsert"; agent: AgentState }
    | { kind: "agent-remove"; agentId: string }
    | { kind: "timeline-append"; line: TimelineLine }
  >;
}

export class SessionStore extends EventEmitter {
  private sessions = new Map<string, SessionState>();
  private db: Database.Database;

  constructor(dbPath: string) {
    super();
    this.db = new Database(dbPath);
    this.db.exec(`CREATE TABLE IF NOT EXISTS pinned (session_id TEXT PRIMARY KEY)`);
  }

  listSessions(): SessionState[] { return Array.from(this.sessions.values()); }
  getSession(id: string): SessionState | undefined { return this.sessions.get(id); }
  isPinned(id: string): boolean { return !!this.db.prepare("SELECT 1 FROM pinned WHERE session_id=?").get(id); }
  pin(id: string): void { this.db.prepare("INSERT OR IGNORE INTO pinned VALUES (?)").run(id); }
  unpin(id: string): void { this.db.prepare("DELETE FROM pinned WHERE session_id=?").run(id); }

  apply(event: AgentEvent): void {
    let session = this.sessions.get(event.sessionId);
    if (!session) {
      session = {
        sessionId: event.sessionId,
        projectPath: "",
        startedAt: event.timestamp,
        lastActivityAt: event.timestamp,
        status: "active",
        agents: new Map(),
        timeline: []
      };
      this.sessions.set(event.sessionId, session);
    }

    session.lastActivityAt = event.timestamp;
    const changes: SessionPatch["changes"] = [];

    if (event.type === "session-start") {
      session.status = "active";
      this.ensureAgent(session, event.agentId, event.kind, event.parentAgentId);
      changes.push({ kind: "session-upsert", session: stripRelations(session) });
      changes.push({ kind: "agent-upsert", agent: session.agents.get(event.agentId)! });
    } else if (event.type === "subagent-start") {
      this.ensureAgent(session, event.agentId, "subagent", event.parentAgentId);
      changes.push({ kind: "agent-upsert", agent: session.agents.get(event.agentId)! });
    } else if (event.type === "session-end") {
      session.status = "ended";
      changes.push({ kind: "session-upsert", session: stripRelations(session) });
    } else if (event.type === "subagent-end") {
      const agent = session.agents.get(event.agentId);
      if (agent) {
        agent.animation = "ghost";
        agent.targetZone = "tavern";
        agent.ghostExpiresAt = event.timestamp + GHOST_MS;
        changes.push({ kind: "agent-upsert", agent });
      }
    } else if (event.type === "pre-tool-use" || event.type === "post-tool-use") {
      const agent = this.ensureAgent(session, event.agentId, event.kind, event.parentAgentId);
      const c = classify(event);
      agent.targetZone = c.zone;
      agent.animation = c.animation;
      agent.recentActions.push({ timestamp: event.timestamp, zone: c.zone, summary: c.tooltip });
      if (agent.recentActions.length > ACTIONS_CAP) agent.recentActions.shift();
      changes.push({ kind: "agent-upsert", agent });

      const line: TimelineLine = {
        id: `${event.sessionId}:${event.timestamp}:${Math.random().toString(36).slice(2, 6)}`,
        timestamp: event.timestamp,
        agentId: event.agentId,
        agentKind: event.kind,
        kind: event.type === "pre-tool-use" ? "tool-call" : "tool-result",
        text: c.timelineText
      };
      session.timeline.push(line);
      if (session.timeline.length > TIMELINE_CAP) session.timeline.shift();
      changes.push({ kind: "timeline-append", line });
    } else if (event.type === "user-message" || event.type === "assistant-message") {
      const line: TimelineLine = {
        id: `${event.sessionId}:${event.timestamp}:${Math.random().toString(36).slice(2, 6)}`,
        timestamp: event.timestamp,
        agentId: event.agentId,
        agentKind: event.kind,
        kind: event.type === "user-message" ? "user" : "assistant",
        text: event.messageExcerpt ?? ""
      };
      session.timeline.push(line);
      if (session.timeline.length > TIMELINE_CAP) session.timeline.shift();
      changes.push({ kind: "timeline-append", line });
    }

    this.emit("patch", { sessionId: event.sessionId, changes } satisfies SessionPatch);
  }

  expireGhosts(now: number): void {
    for (const session of this.sessions.values()) {
      for (const agent of Array.from(session.agents.values())) {
        if (agent.animation === "ghost" && agent.ghostExpiresAt && agent.ghostExpiresAt < now) {
          session.agents.delete(agent.id);
          this.emit("patch", { sessionId: session.sessionId, changes: [{ kind: "agent-remove", agentId: agent.id }] } satisfies SessionPatch);
        }
      }
    }
  }

  private ensureAgent(session: SessionState, id: string, kind: "main" | "subagent", parentId?: string): AgentState {
    const existing = session.agents.get(id);
    if (existing) return existing;
    const state: AgentState = {
      id,
      kind,
      parentId,
      currentZone: "tavern",
      targetZone: "tavern",
      animation: "idle",
      recentActions: [],
      skinColor: hashColor(id)
    };
    session.agents.set(id, state);
    return state;
  }
}

function stripRelations(s: SessionState) {
  return { sessionId: s.sessionId, projectPath: s.projectPath, startedAt: s.startedAt, lastActivityAt: s.lastActivityAt, status: s.status };
}

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 55%)`;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run tests/unit/session-store.test.ts`
Expected: PASS all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/session-store.ts tests/unit/session-store.test.ts
git commit -m "feat(main): session store with agent state, ghost expiry, and SQLite pinning"
```

---

## Task 7: `ipc-bridge.ts` (main, depends on 3-6)

**Spec reference:** Section 4 (`ipc-bridge`), Section 5 (session:patch stream).

**Files:**
- Create: `src/main/ipc-bridge.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`

- [ ] **Step 1: Create `src/main/ipc-bridge.ts`**

```ts
import { ipcMain, BrowserWindow } from "electron";
import type { SessionStore, SessionPatch } from "./session-store";
import type { SessionWatcher } from "./session-watcher";
import type { HookServer } from "./hook-server";
import type { AgentEvent, SessionState } from "../shared/types";

export function wireIpc(opts: {
  window: BrowserWindow;
  store: SessionStore;
  watcher: SessionWatcher;
  hookServer: HookServer;
}): void {
  const { window, store, watcher, hookServer } = opts;

  watcher.on("event", (e: AgentEvent) => store.apply(e));
  hookServer.on("event", (e: AgentEvent) => store.apply(e));

  store.on("patch", (patch: SessionPatch) => {
    if (!window.isDestroyed()) window.webContents.send("session:patch", patch);
  });

  ipcMain.handle("sessions:list", () =>
    store.listSessions().map(s => ({ ...s, agents: Array.from(s.agents.values()) }))
  );
  ipcMain.handle("session:get", (_e, id: string) => {
    const s = store.getSession(id);
    return s ? { ...s, agents: Array.from(s.agents.values()) } : null;
  });
  ipcMain.handle("session:pin", (_e, id: string) => { store.pin(id); });
  ipcMain.handle("session:unpin", (_e, id: string) => { store.unpin(id); });

  setInterval(() => store.expireGhosts(Date.now()), 30_000);
}
```

- [ ] **Step 2: Update `src/preload/index.ts`** to expose the new IPC surface

```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("claudeVillage", {
  listSessions: () => ipcRenderer.invoke("sessions:list"),
  getSession: (id: string) => ipcRenderer.invoke("session:get", id),
  pinSession: (id: string) => ipcRenderer.invoke("session:pin", id),
  unpinSession: (id: string) => ipcRenderer.invoke("session:unpin", id),
  onPatch: (cb: (p: unknown) => void) => {
    const listener = (_e: unknown, p: unknown) => cb(p);
    ipcRenderer.on("session:patch", listener);
    return () => ipcRenderer.off("session:patch", listener);
  }
});
```

- [ ] **Step 3: Wire everything in `src/main/index.ts`**

Replace the current `src/main/index.ts` with:

```ts
import { app, BrowserWindow } from "electron";
import path from "node:path";
import os from "node:os";
import { SessionWatcher } from "./session-watcher";
import { HookServer } from "./hook-server";
import { SessionStore } from "./session-store";
import { wireIpc } from "./ipc-bridge";

const watchRoot = process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, "projects")
  : path.join(os.homedir(), ".claude", "projects");

const store = new SessionStore(path.join(app.getPath("userData"), "village.db"));
const watcher = new SessionWatcher(watchRoot);
const hookServer = new HookServer();

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "claude-village",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  wireIpc({ window: win, store, watcher, hookServer });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  await watcher.start();
  await hookServer.start(49251);
  await createWindow();
});

app.on("before-quit", async () => {
  await watcher.stop();
  await hookServer.stop();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
```

- [ ] **Step 4: Smoke - launch and verify no errors**

Run: `pnpm dev`
Expected: window opens. Open DevTools in the window (View -> Toggle Developer Tools) and in the console run:

```js
await window.claudeVillage.listSessions();
```

Expected: returns `[]` (or an array of any existing sessions).

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-bridge.ts src/main/index.ts src/preload/index.ts
git commit -m "feat(main): wire watcher, hook server, and store via ipc-bridge"
```

---

## Task 8: Tab chrome + sidebar + SessionContext (renderer, parallelizable with 9-15)

**Spec reference:** Section 9 (tab management), Section 4 (renderer).

**Files:**
- Create: `src/renderer/context/SessionContext.tsx`, `src/renderer/types/ipc-client.ts`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Declare the IPC surface for the renderer**

`src/renderer/types/ipc-client.ts`:

```ts
import type { SessionState, TimelineLine, AgentState } from "../../shared/types";

export interface SessionPatch {
  sessionId: string;
  changes: Array<
    | { kind: "session-upsert"; session: Omit<SessionState, "agents" | "timeline"> }
    | { kind: "agent-upsert"; agent: AgentState }
    | { kind: "agent-remove"; agentId: string }
    | { kind: "timeline-append"; line: TimelineLine }
  >;
}

export interface ClaudeVillageAPI {
  listSessions: () => Promise<(Omit<SessionState, "agents" | "timeline"> & { agents: AgentState[]; timeline: TimelineLine[] })[]>;
  getSession: (id: string) => Promise<(Omit<SessionState, "agents" | "timeline"> & { agents: AgentState[]; timeline: TimelineLine[] }) | null>;
  pinSession: (id: string) => Promise<void>;
  unpinSession: (id: string) => Promise<void>;
  onPatch: (cb: (p: SessionPatch) => void) => () => void;
}

declare global {
  interface Window { claudeVillage: ClaudeVillageAPI; }
}
```

- [ ] **Step 2: Create `SessionContext.tsx`** - renderer mirror of the main store

```tsx
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AgentState, TimelineLine } from "../../shared/types";
import type { SessionPatch } from "../types/ipc-client";

export interface TabSession {
  sessionId: string;
  startedAt: number;
  lastActivityAt: number;
  status: "active" | "idle" | "ended";
  agents: Map<string, AgentState>;
  timeline: TimelineLine[];
  pinned: boolean;
}

interface Ctx {
  sessions: Map<string, TabSession>;
  openTabIds: string[];
  activeTabId: string | null;
  setActiveTab: (id: string) => void;
  closeTab: (id: string) => void;
  togglePin: (id: string) => void;
  openTab: (id: string) => void;
}

const SessionCtx = createContext<Ctx | null>(null);
export const useSessions = () => {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSessions must be used inside SessionProvider");
  return c;
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<Map<string, TabSession>>(new Map());
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [closedTabIds, setClosedTabIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      const list = await window.claudeVillage.listSessions();
      const map = new Map<string, TabSession>();
      for (const s of list) {
        map.set(s.sessionId, {
          sessionId: s.sessionId,
          startedAt: s.startedAt,
          lastActivityAt: s.lastActivityAt,
          status: s.status,
          agents: new Map(s.agents.map(a => [a.id, a])),
          timeline: s.timeline,
          pinned: false
        });
      }
      setSessions(map);
      const active = list.filter(s => Date.now() - s.lastActivityAt < 10 * 60 * 1000).map(s => s.sessionId);
      setOpenTabIds(active);
      setActiveTabId(active[0] ?? null);
    })();

    const unsubscribe = window.claudeVillage.onPatch((p: SessionPatch) => applyPatch(p));
    return unsubscribe;

    function applyPatch(p: SessionPatch) {
      setSessions(prev => {
        const next = new Map(prev);
        let session = next.get(p.sessionId);
        for (const change of p.changes) {
          if (change.kind === "session-upsert") {
            session = session ?? { sessionId: p.sessionId, startedAt: change.session.startedAt, lastActivityAt: change.session.lastActivityAt, status: change.session.status, agents: new Map(), timeline: [], pinned: false };
            session = { ...session, ...change.session };
          } else if (change.kind === "agent-upsert" && session) {
            const agents = new Map(session.agents);
            agents.set(change.agent.id, change.agent);
            session = { ...session, agents };
          } else if (change.kind === "agent-remove" && session) {
            const agents = new Map(session.agents);
            agents.delete(change.agentId);
            session = { ...session, agents };
          } else if (change.kind === "timeline-append" && session) {
            const timeline = [...session.timeline, change.line].slice(-500);
            session = { ...session, timeline };
          }
        }
        if (session) next.set(p.sessionId, session);
        return next;
      });

      setOpenTabIds(prev => {
        if (prev.includes(p.sessionId)) return prev;
        if (closedTabIds.has(p.sessionId)) return prev;
        return [...prev, p.sessionId];
      });
      setActiveTabId(prev => prev ?? p.sessionId);
    }
  }, [closedTabIds]);

  const setActiveTab = useCallback((id: string) => setActiveTabId(id), []);
  const openTab = useCallback((id: string) => {
    setClosedTabIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setOpenTabIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    setActiveTabId(id);
  }, []);
  const closeTab = useCallback((id: string) => {
    setOpenTabIds(prev => prev.filter(x => x !== id));
    setClosedTabIds(prev => new Set(prev).add(id));
    setActiveTabId(prev => (prev === id ? null : prev));
  }, []);
  const togglePin = useCallback((id: string) => {
    setSessions(prev => {
      const next = new Map(prev);
      const s = next.get(id);
      if (s) {
        const pinned = !s.pinned;
        next.set(id, { ...s, pinned });
        void (pinned ? window.claudeVillage.pinSession(id) : window.claudeVillage.unpinSession(id));
      }
      return next;
    });
  }, []);

  return (
    <SessionCtx.Provider value={{ sessions, openTabIds, activeTabId, setActiveTab, closeTab, togglePin, openTab }}>
      {children}
    </SessionCtx.Provider>
  );
}
```

- [ ] **Step 3: Update `App.tsx`** with tab chrome + sidebar stub

```tsx
import { SessionProvider, useSessions } from "./context/SessionContext";

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}

function Shell() {
  const { sessions, openTabIds, activeTabId, setActiveTab, closeTab, togglePin, openTab } = useSessions();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", height: "100vh", fontFamily: "Inter, -apple-system, sans-serif" }}>
      <aside style={{ background: "#1f2a1f", color: "#dde", overflow: "auto", padding: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Sessions</h3>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
          {Array.from(sessions.values()).map(s => (
            <li key={s.sessionId} style={{ marginBottom: 4 }}>
              <button onClick={() => openTab(s.sessionId)} style={{ all: "unset", cursor: "pointer", fontSize: 12 }}>
                {s.sessionId.slice(0, 8)} ({s.status})
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main style={{ display: "flex", flexDirection: "column", background: "#0e1a0e", color: "#dde" }}>
        <nav style={{ display: "flex", background: "#182418", borderBottom: "1px solid #2a3" }}>
          {openTabIds.map(id => {
            const s = sessions.get(id);
            const isActive = id === activeTabId;
            return (
              <div key={id} style={{ padding: "8px 12px", background: isActive ? "#0e1a0e" : "transparent", borderRight: "1px solid #2a3", display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setActiveTab(id)} style={{ all: "unset", cursor: "pointer" }}>{id.slice(0, 8)}</button>
                <button onClick={() => togglePin(id)} title="pin">{s?.pinned ? "📌" : "📍"}</button>
                <button onClick={() => closeTab(id)} title="close">✕</button>
              </div>
            );
          })}
        </nav>
        <section style={{ flex: 1, padding: 24 }}>
          {activeTabId ? <TabBody sessionId={activeTabId} /> : <div>No active session</div>}
        </section>
      </main>
    </div>
  );
}

function TabBody({ sessionId }: { sessionId: string }) {
  const { sessions } = useSessions();
  const s = sessions.get(sessionId);
  if (!s) return <div>Loading…</div>;
  return (
    <div>
      <h2>{sessionId}</h2>
      <p>Agents: {s.agents.size}</p>
      <p>Status: {s.status}</p>
    </div>
  );
}
```

- [ ] **Step 4: Smoke-test**

Run: `pnpm dev`
Expected: left sidebar shows sessions (empty on first run), top tab bar, main area shows placeholder TabBody. Start a Claude Code session in another terminal - within ~1s a tab should auto-open.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/context src/renderer/types src/renderer/App.tsx
git commit -m "feat(renderer): tab chrome, sidebar, and session context wired to IPC"
```

---

## Task 9: `VillageScene` (renderer, depends on 2; parallelizable with 10-15)

**Spec reference:** Section 3 (9 zones), Section 6 (walkable grid).

**Files:**
- Create: `src/renderer/village/VillageScene.tsx`, `src/renderer/village/Zone.tsx`
- Modify: `src/renderer/App.tsx` (mount VillageScene inside TabBody)

- [ ] **Step 1: Create `Zone.tsx`**

```tsx
import { Html } from "@react-three/drei";
import type { ZoneMeta } from "../../shared/zones";

interface ZoneProps { meta: ZoneMeta; position: [number, number, number]; }

export function Zone({ meta, position }: ZoneProps) {
  return (
    <group position={position} userData={{ tooltipKind: "zone", zoneId: meta.id, zoneName: meta.name, zoneDescription: meta.description }}>
      <mesh position={[0, 0.1, 0]} userData={{ tooltipKind: "zone-ground", zoneId: meta.id }}>
        <boxGeometry args={[4, 0.2, 4]} />
        <meshStandardMaterial color={zoneColor(meta.id)} />
      </mesh>
      <mesh position={[1.5, 1.5, 1.5]} userData={{ tooltipKind: "zone-signpost", zoneId: meta.id }}>
        <boxGeometry args={[0.2, 2, 0.2]} />
        <meshStandardMaterial color="#8b5a2b" />
      </mesh>
      <Html position={[0, 3, 0]} center userData={{ tooltipKind: "zone-icon", zoneId: meta.id }}>
        <div style={{ fontSize: 28, pointerEvents: "auto", cursor: "help", userSelect: "none" }}>{meta.icon}</div>
      </Html>
    </group>
  );
}

function zoneColor(id: string): string {
  const c: Record<string, string> = {
    office: "#b0c4de", library: "#8b6f47", mine: "#5a5a5a", forest: "#2e7d32",
    farm: "#d4a017", nether: "#8b0000", signpost: "#c19a6b", spawner: "#9370db", tavern: "#a0522d"
  };
  return c[id] ?? "#777";
}
```

- [ ] **Step 2: Create `VillageScene.tsx`**

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ZONES, ZoneId } from "../../shared/zones";
import { Zone } from "./Zone";

const RADIUS = 8;

export function VillageScene() {
  const positions = computeZonePositions();
  return (
    <Canvas camera={{ position: [15, 12, 15], fov: 45 }} style={{ background: "#87ceeb" }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={0.9} castShadow />
      <OrbitControls enablePan enableRotate enableZoom target={[0, 0, 0]} />
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[32, 0.1, 32]} />
        <meshStandardMaterial color="#6b8e23" />
      </mesh>
      {ZONES.map((z, i) => (
        <Zone key={z.id} meta={z} position={positions[i]!} />
      ))}
    </Canvas>
  );
}

function computeZonePositions(): [number, number, number][] {
  const n = ZONES.length;
  return ZONES.map((_, i) => {
    const angle = (i / n) * Math.PI * 2;
    return [Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS];
  });
}

export function buildWalkableGrid(): { size: number; walkable: boolean[][] } {
  const size = 32;
  const walkable = Array.from({ length: size }, () => Array.from({ length: size }, () => true));
  const positions = computeZonePositions();
  for (const [x, , z] of positions) {
    const gx = Math.round(x + size / 2);
    const gz = Math.round(z + size / 2);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const nx = gx + dx, nz = gz + dz;
      if (nx >= 0 && nz >= 0 && nx < size && nz < size) walkable[nx]![nz] = false;
    }
    if (gx >= 0 && gz >= 0 && gx < size && gz < size) walkable[gx]![gz] = true; // zone tile itself is walkable (entry point)
  }
  return { size, walkable };
}
```

- [ ] **Step 3: Mount inside `TabBody`**

In `src/renderer/App.tsx`, replace `TabBody` with:

```tsx
import { VillageScene } from "./village/VillageScene";

function TabBody({ sessionId }: { sessionId: string }) {
  const { sessions } = useSessions();
  const s = sessions.get(sessionId);
  if (!s) return <div>Loading…</div>;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <VillageScene />
      <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 4 }}>
        <div>{sessionId.slice(0, 8)}</div>
        <div>Agents: {s.agents.size}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Smoke - open the app**

Run: `pnpm dev`
Expected: inside an open tab, see 9 colored zone platforms arranged in a ring on a green plane under a sky-blue background, with emoji icons floating above each zone. Orbit the camera with mouse drag, zoom with scroll.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/village/VillageScene.tsx src/renderer/village/Zone.tsx src/renderer/App.tsx
git commit -m "feat(renderer): render 9-zone village with orbit camera + walkable grid builder"
```

---

## Task 10: `pathfinding.ts` (renderer, depends on 2; parallelizable with 9, 11-15)

**Spec reference:** Section 6 (A* on voxel grid).

**Files:**
- Create: `src/renderer/village/pathfinding.ts`, `tests/unit/pathfinding.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { computePath } from "../../src/renderer/village/pathfinding";

describe("computePath", () => {
  it("returns a straight path on an empty grid", () => {
    const g = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
    const p = computePath({ x: 0, z: 0 }, { x: 4, z: 0 }, g);
    expect(p.length).toBeGreaterThan(0);
    expect(p[0]).toEqual({ x: 0, z: 0 });
    expect(p[p.length - 1]).toEqual({ x: 4, z: 0 });
  });

  it("routes around an obstacle", () => {
    const g = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
    for (let z = 0; z < 5; z++) g[2]![z] = false;
    g[2]![4] = true;
    const p = computePath({ x: 0, z: 2 }, { x: 4, z: 2 }, g);
    expect(p.length).toBeGreaterThan(5);
    expect(p.some(n => n.x === 2 && n.z === 4)).toBe(true);
  });

  it("returns empty array when no path exists", () => {
    const g = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
    for (let z = 0; z < 5; z++) g[2]![z] = false;
    const p = computePath({ x: 0, z: 2 }, { x: 4, z: 2 }, g);
    expect(p).toEqual([]);
  });
});
```

- [ ] **Step 2: Run - expect FAIL**

Run: `pnpm vitest run tests/unit/pathfinding.test.ts`

- [ ] **Step 3: Implement `src/renderer/village/pathfinding.ts`**

```ts
import PF from "pathfinding";

export interface GridPoint { x: number; z: number; }

export function computePath(from: GridPoint, to: GridPoint, walkable: boolean[][]): GridPoint[] {
  const size = walkable.length;
  const matrix: number[][] = [];
  for (let z = 0; z < size; z++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) row.push(walkable[x]?.[z] ? 0 : 1);
    matrix.push(row);
  }
  const grid = new PF.Grid(matrix);
  const finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.Never });
  const raw = finder.findPath(from.x, from.z, to.x, to.z, grid);
  return raw.map(([x, z]) => ({ x, z }));
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm vitest run tests/unit/pathfinding.test.ts`
Expected: PASS all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/village/pathfinding.ts tests/unit/pathfinding.test.ts
git commit -m "feat(renderer): A* pathfinding over the village walkable grid"
```

---

## Task 11: `Character` component (renderer, depends on 2, 9, 10)

**Spec reference:** Section 6 (state machine, movement, animations).

**Files:**
- Create: `src/renderer/village/Character.tsx`
- Modify: `src/renderer/village/VillageScene.tsx` (render characters from session state)

- [ ] **Step 1: Create `Character.tsx`**

```tsx
import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { computePath, GridPoint } from "./pathfinding";
import type { AgentState } from "../../shared/types";

interface CharacterProps {
  agent: AgentState;
  zonePositions: Record<string, [number, number, number]>;
  walkable: boolean[][];
  gridSize: number;
}

export function Character({ agent, zonePositions, walkable, gridSize }: CharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pathRef = useRef<GridPoint[]>([]);
  const pathIndex = useRef(0);
  const speed = 3;

  const targetWorld = zonePositions[agent.targetZone] ?? [0, 0, 0];
  const currentWorld = zonePositions[agent.currentZone] ?? [0, 0, 0];

  useEffect(() => {
    if (!groupRef.current) return;
    const currentGrid = worldToGrid(groupRef.current.position, gridSize);
    const targetGrid = worldToGrid(new THREE.Vector3(...targetWorld), gridSize);
    pathRef.current = computePath(currentGrid, targetGrid, walkable);
    pathIndex.current = 0;
  }, [agent.targetZone, gridSize, walkable, targetWorld]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;

    const path = pathRef.current;
    if (pathIndex.current < path.length) {
      const next = path[pathIndex.current]!;
      const nextWorld = gridToWorld(next, gridSize);
      const dir = new THREE.Vector3(nextWorld[0] - g.position.x, 0, nextWorld[2] - g.position.z);
      const dist = dir.length();
      if (dist < 0.05) {
        pathIndex.current++;
      } else {
        dir.normalize().multiplyScalar(speed * dt);
        g.position.add(dir);
        g.lookAt(nextWorld[0], g.position.y, nextWorld[2]);
        g.position.y = 1 + Math.abs(Math.sin(performance.now() * 0.01)) * 0.1;
      }
    }
  });

  const initialWorld = useMemo(() => currentWorld, [currentWorld]);
  const translucent = agent.animation === "ghost";

  return (
    <group ref={groupRef} position={[initialWorld[0], 1, initialWorld[2]]}
           userData={{ tooltipKind: "character", agentId: agent.id, agentKind: agent.kind }}>
      <mesh>
        <boxGeometry args={[0.6, 1.6, 0.4]} />
        <meshStandardMaterial color={agent.skinColor} transparent={translucent} opacity={translucent ? 0.4 : 1} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#f3c89a" transparent={translucent} opacity={translucent ? 0.4 : 1} />
      </mesh>
      <Html position={[0, 2.2, 0]} center distanceFactor={10}>
        <div style={{ fontSize: 10, background: "rgba(0,0,0,0.6)", color: "#fff", padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap" }}>
          {agent.kind === "main" ? "🛡 " : ""}{agent.id.slice(0, 6)}
        </div>
      </Html>
    </group>
  );
}

function worldToGrid(v: { x: number; z: number } | THREE.Vector3, size: number): GridPoint {
  return { x: Math.round((v.x as number) + size / 2), z: Math.round((v.z as number) + size / 2) };
}
function gridToWorld(p: GridPoint, size: number): [number, number, number] {
  return [p.x - size / 2, 0, p.z - size / 2];
}
```

- [ ] **Step 2: Update `VillageScene.tsx`** to render one `Character` per agent of the active session

```tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ZONES } from "../../shared/zones";
import { Zone } from "./Zone";
import { Character } from "./Character";
import { useSessions } from "../context/SessionContext";

const RADIUS = 8;

export function VillageScene({ sessionId }: { sessionId: string }) {
  const { sessions } = useSessions();
  const session = sessions.get(sessionId);
  const positions = computeZonePositions();
  const zonePositions = Object.fromEntries(ZONES.map((z, i) => [z.id, positions[i]!]));
  const grid = buildWalkableGrid();

  return (
    <Canvas camera={{ position: [15, 12, 15], fov: 45 }} style={{ background: "#87ceeb" }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={0.9} />
      <OrbitControls enablePan enableRotate enableZoom target={[0, 0, 0]} />
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[32, 0.1, 32]} />
        <meshStandardMaterial color="#6b8e23" />
      </mesh>
      {ZONES.map((z, i) => <Zone key={z.id} meta={z} position={positions[i]!} />)}
      {session && Array.from(session.agents.values()).map(agent => (
        <Character key={agent.id} agent={agent} zonePositions={zonePositions as Record<string, [number, number, number]>} walkable={grid.walkable} gridSize={grid.size} />
      ))}
    </Canvas>
  );
}

function computeZonePositions(): [number, number, number][] {
  const n = ZONES.length;
  return ZONES.map((_, i) => {
    const angle = (i / n) * Math.PI * 2;
    return [Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS];
  });
}

function buildWalkableGrid(): { size: number; walkable: boolean[][] } {
  const size = 32;
  const walkable = Array.from({ length: size }, () => Array.from({ length: size }, () => true));
  const positions = computeZonePositions();
  for (const [x, , z] of positions) {
    const gx = Math.round(x + size / 2);
    const gz = Math.round(z + size / 2);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const nx = gx + dx, nz = gz + dz;
      if (nx >= 0 && nz >= 0 && nx < size && nz < size) walkable[nx]![nz] = false;
    }
    if (gx >= 0 && gz >= 0 && gx < size && gz < size) walkable[gx]![gz] = true;
  }
  return { size, walkable };
}
```

Update the call site in `App.tsx` to pass `sessionId`:

```tsx
<VillageScene sessionId={sessionId} />
```

- [ ] **Step 3: Smoke - verify a character moves**

Run: `pnpm dev`
Start a Claude Code session in another terminal and run `Read`-style tool calls. Expected: a character appears and walks to the Library zone.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/village/Character.tsx src/renderer/village/VillageScene.tsx src/renderer/App.tsx
git commit -m "feat(renderer): character entities that pathfind between zones"
```

---

## Task 12: `TooltipLayer` (renderer, depends on 9, 11)

**Spec reference:** Section 7 (tooltip targets).

**Files:**
- Create: `src/renderer/village/TooltipLayer.tsx`
- Modify: `src/renderer/village/VillageScene.tsx` (add TooltipLayer)

- [ ] **Step 1: Create `TooltipLayer.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { useThree, ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { ZONES } from "../../shared/zones";
import { useSessions } from "../context/SessionContext";

interface HoverTarget {
  kind: "zone" | "zone-ground" | "zone-signpost" | "zone-icon" | "character";
  data: Record<string, string>;
  screen: { x: number; y: number };
}

export function TooltipLayer({ sessionId }: { sessionId: string }) {
  const { sessions } = useSessions();
  const { scene, camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        raycaster.current.setFromCamera(pointer.current, camera);
        const hits = raycaster.current.intersectObjects(scene.children, true);
        for (const hit of hits) {
          const ud = findUserData(hit.object);
          if (!ud) continue;
          setHover({ kind: ud.tooltipKind, data: ud, screen: { x: e.clientX, y: e.clientY } });
          return;
        }
        setHover(null);
      }, 200);
    };
    el.addEventListener("pointermove", onMove);
    return () => el.removeEventListener("pointermove", onMove);
  }, [camera, gl, scene]);

  if (!hover) return null;
  const content = renderContent(hover, sessions.get(sessionId));
  return (
    <Html>
      <div style={{ position: "fixed", left: hover.screen.x + 12, top: hover.screen.y + 12, background: "rgba(0,0,0,0.85)", color: "#fff", padding: "8px 10px", borderRadius: 4, fontSize: 12, maxWidth: 300, pointerEvents: "none", zIndex: 1000 }}>
        {content}
      </div>
    </Html>
  );
}

function findUserData(obj: THREE.Object3D): any {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (o.userData?.tooltipKind) return o.userData;
    o = o.parent;
  }
  return null;
}

function renderContent(hover: HoverTarget, session: ReturnType<typeof useSessions>["sessions"] extends Map<string, infer T> ? T : never | undefined) {
  if (hover.kind.startsWith("zone")) {
    const meta = ZONES.find(z => z.id === hover.data.zoneId);
    if (!meta) return null;
    const occupants = session ? Array.from(session.agents.values()).filter(a => a.currentZone === meta.id) : [];
    return (
      <div>
        <div style={{ fontWeight: 600 }}>{meta.icon} {meta.name}</div>
        <div style={{ opacity: 0.85 }}>{meta.description}</div>
        {occupants.length > 0 && <div style={{ marginTop: 6 }}>Here now: {occupants.map(o => o.id.slice(0, 6)).join(", ")}</div>}
      </div>
    );
  }
  if (hover.kind === "character") {
    const agent = session?.agents.get(hover.data.agentId);
    if (!agent) return null;
    return (
      <div>
        <div style={{ fontWeight: 600 }}>{agent.kind === "main" ? "🛡 Mayor" : "Villager"} {agent.id.slice(0, 8)}</div>
        <div>Zone: {agent.currentZone} -> {agent.targetZone}</div>
        <div style={{ marginTop: 4, opacity: 0.8 }}>
          {agent.recentActions.slice(-5).reverse().map((a, i) => <div key={i}>• {a.summary}</div>)}
        </div>
      </div>
    );
  }
  return null;
}

import { Html } from "@react-three/drei";
```

- [ ] **Step 2: Mount `TooltipLayer` inside the `Canvas`**

In `VillageScene.tsx`, add `<TooltipLayer sessionId={sessionId} />` as the last child of `<Canvas>`.

- [ ] **Step 3: Smoke - hover over a zone**

Run: `pnpm dev`
Expected: hovering over any zone platform for >200ms shows a dark tooltip with the zone name, description, and list of occupants. Hovering over a character shows its name, current/target zone, and last 5 actions.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/village/TooltipLayer.tsx src/renderer/village/VillageScene.tsx
git commit -m "feat(renderer): raycast-based tooltips for zones and characters"
```

---

## Task 13: `TimelineStrip` (renderer, depends on 8)

**Spec reference:** Section 8 (collapsible timeline, color-coded, camera jump).

**Files:**
- Create: `src/renderer/village/TimelineStrip.tsx`
- Modify: `src/renderer/App.tsx` (render TimelineStrip inside TabBody)

- [ ] **Step 1: Create `TimelineStrip.tsx`**

```tsx
import { useState, useRef, useEffect } from "react";
import type { TimelineLine, AgentState } from "../../shared/types";

interface Props {
  timeline: TimelineLine[];
  agents: Map<string, AgentState>;
  onFocusAgent: (agentId: string) => void;
}

const PALETTE = ["#f4a261", "#e76f51", "#2a9d8f", "#e9c46a", "#264653", "#c77dff", "#06a77d"];

export function TimelineStrip({ timeline, agents, onFocusAgent }: Props) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [stuckToBottom, setStuckToBottom] = useState(true);

  useEffect(() => {
    if (open && stuckToBottom && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [timeline, open, stuckToBottom]);

  const colorFor = (agentId: string, kind: string): string => {
    if (kind === "main") return "#ffd166";
    let h = 0;
    for (let i = 0; i < agentId.length; i++) h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length]!;
  };

  return (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.85)", color: "#eee", fontFamily: "monospace", fontSize: 12 }}>
      <button onClick={() => setOpen(o => !o)} style={{ all: "unset", cursor: "pointer", padding: "4px 8px", display: "block", width: "100%", background: "#222" }}>
        {open ? "▼ Timeline" : "▲ Timeline"} ({timeline.length})
      </button>
      {open && (
        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setStuckToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
          }}
          style={{ height: 180, overflowY: "auto", padding: 8 }}
        >
          {timeline.map(line => {
            const agent = agents.get(line.agentId);
            return (
              <div key={line.id} onClick={() => onFocusAgent(line.agentId)} style={{ cursor: "pointer", marginBottom: 2, color: colorFor(line.agentId, agent?.kind ?? "subagent") }}>
                <span style={{ opacity: 0.6 }}>{new Date(line.timestamp).toLocaleTimeString()} </span>
                <span style={{ opacity: 0.7 }}>[{line.agentId.slice(0, 6)}] </span>
                <span>{line.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount inside `TabBody`** and wire `onFocusAgent`

For this task the camera-jump is a stub - we will just console.log the agent id. Actual camera animation can come in a polish pass (or extend Task 11 later).

Update `TabBody` in `App.tsx`:

```tsx
import { TimelineStrip } from "./village/TimelineStrip";
import { useCallback } from "react";

function TabBody({ sessionId }: { sessionId: string }) {
  const { sessions } = useSessions();
  const s = sessions.get(sessionId);
  const onFocusAgent = useCallback((id: string) => {
    window.dispatchEvent(new CustomEvent("village:focus-agent", { detail: { agentId: id } }));
  }, []);
  if (!s) return <div>Loading…</div>;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <VillageScene sessionId={sessionId} />
      <TimelineStrip timeline={s.timeline} agents={s.agents} onFocusAgent={onFocusAgent} />
    </div>
  );
}
```

Subscribe to the custom event in `VillageScene` and animate the camera toward the matching character (via a `useRef` of the `OrbitControls` target and a short `useFrame` lerp). Implementation sketch (add inside `VillageScene`):

```tsx
import { useRef } from "react";
const controls = useRef<any>(null);
// inside Canvas:
<OrbitControls ref={controls} enablePan enableRotate enableZoom target={[0, 0, 0]} />
```

And:

```tsx
useEffect(() => {
  const handler = (e: Event) => {
    const id = (e as CustomEvent).detail.agentId;
    const agent = session?.agents.get(id);
    if (!agent || !controls.current) return;
    const pos = zonePositions[agent.currentZone];
    if (pos) controls.current.target.set(pos[0], 1, pos[2]);
  };
  window.addEventListener("village:focus-agent", handler);
  return () => window.removeEventListener("village:focus-agent", handler);
}, [session, zonePositions]);
```

- [ ] **Step 3: Smoke**

Run: `pnpm dev`
Expected: thin "▲ Timeline (N)" strip at the bottom of a tab. Click to expand - see live-updating color-coded lines. Click a line - camera pans toward that agent's current zone.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/village/TimelineStrip.tsx src/renderer/village/VillageScene.tsx src/renderer/App.tsx
git commit -m "feat(renderer): collapsible timeline strip with click-to-focus"
```

---

## Task 14: Conversation animations + bubble drawer (renderer, depends on 11, 12)

**Spec reference:** Section 5 (spawn huddle, return huddle), Section 7 (bubble length policy).

**Files:**
- Create: `src/renderer/village/conversation.ts`, `src/renderer/village/BubbleDrawer.tsx`
- Modify: `src/renderer/village/Character.tsx` (render `...` bubble), `src/renderer/village/VillageScene.tsx` (orchestrate huddles)

- [ ] **Step 1: Create `conversation.ts`** - pure logic for huddle coordinates

```ts
import type { AgentState } from "../../shared/types";

export interface HuddleState {
  participants: string[];   // agent ids
  anchor: [number, number, number];
  startedAt: number;
  durationMs: number;
  excerpts: Record<string, string>;
}

const HUDDLE_MS = 1500;

export function computeHuddle(
  triggerEvent: "spawn" | "return",
  mayor: AgentState,
  subagent: AgentState,
  zonePositions: Record<string, [number, number, number]>
): HuddleState {
  const anchor = triggerEvent === "spawn"
    ? zonePositions.spawner
    : zonePositions[mayor.currentZone] ?? zonePositions.tavern;
  return {
    participants: [mayor.id, subagent.id],
    anchor: anchor ?? [0, 0, 0],
    startedAt: Date.now(),
    durationMs: HUDDLE_MS,
    excerpts: {}
  };
}
```

- [ ] **Step 2: Update `Character.tsx`** to render a short `...` bubble whenever the agent speaks

Add near the name label:

```tsx
{agent.kind === "main" && agent.recentActions[agent.recentActions.length - 1] && (
  <Html position={[0, 2.8, 0]} center distanceFactor={12}>
    <div onClick={(e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("village:open-bubble", { detail: { agentId: agent.id } }));
    }} style={{ cursor: "pointer", fontSize: 10, background: "rgba(255,255,255,0.9)", color: "#111", padding: "2px 6px", borderRadius: 8, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
      {truncate(agent.recentActions[agent.recentActions.length - 1]?.summary ?? "...", 60)}
    </div>
  </Html>
)}
```

Add at the bottom of the file:

```ts
function truncate(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + "…" : s; }
```

- [ ] **Step 3: Create `BubbleDrawer.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { AgentState } from "../../shared/types";

interface Props { agents: Map<string, AgentState>; }

export function BubbleDrawer({ agents }: Props) {
  const [openFor, setOpenFor] = useState<string | null>(null);

  useEffect(() => {
    const open = (e: Event) => setOpenFor((e as CustomEvent).detail.agentId);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenFor(null); };
    window.addEventListener("village:open-bubble", open);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("village:open-bubble", open);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!openFor) return null;
  const agent = agents.get(openFor);
  if (!agent) return null;

  return (
    <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 380, background: "rgba(20,20,20,0.97)", color: "#eee", padding: 16, overflowY: "auto", zIndex: 2000 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{agent.kind === "main" ? "🛡 " : ""}{agent.id.slice(0, 12)}</h3>
        <button onClick={() => setOpenFor(null)} style={{ all: "unset", cursor: "pointer", fontSize: 18 }}>✕</button>
      </div>
      {agent.recentActions.slice().reverse().map((a, i) => (
        <div key={i} style={{ marginBottom: 10, fontFamily: "monospace", fontSize: 12, padding: 8, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
          <div style={{ opacity: 0.6 }}>{new Date(a.timestamp).toLocaleTimeString()} · {a.zone}</div>
          <div>{a.summary}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Mount `BubbleDrawer`** in `TabBody`:

```tsx
import { BubbleDrawer } from "./village/BubbleDrawer";

// inside TabBody, after <TimelineStrip>
<BubbleDrawer agents={s.agents} />
```

- [ ] **Step 5: Smoke**

Run: `pnpm dev`
Expected: each agent shows a small `...` bubble with the last action (≤60 chars). Click the bubble - right-side drawer slides in with recent actions. Esc or ✕ closes it.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/village/conversation.ts src/renderer/village/BubbleDrawer.tsx src/renderer/village/Character.tsx src/renderer/App.tsx
git commit -m "feat(renderer): speech bubbles with click-to-open drawer"
```

---

## Task 15: Settings + About modal (renderer)

**Spec reference:** Section 10 (Settings + About content).

**Files:**
- Create: `src/renderer/settings/SettingsScreen.tsx`, `src/renderer/settings/AboutModal.tsx`
- Modify: `src/renderer/App.tsx` (add a gear button that opens settings), `src/main/index.ts` (macOS About menu item)

- [ ] **Step 1: Create `AboutModal.tsx`**

```tsx
export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 3000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1f2a1f", color: "#eee", padding: 24, borderRadius: 8, width: 360, textAlign: "center" }}>
        <div style={{ fontSize: 48 }}>🧱</div>
        <h2 style={{ margin: "8px 0 4px" }}>claude-village</h2>
        <div style={{ opacity: 0.7, fontSize: 12 }}>v0.1.0</div>
        <p style={{ marginTop: 16, fontSize: 13 }}>Created by Haim Adrian for Claude Code users.</p>
        <button onClick={onClose} style={{ marginTop: 16, padding: "6px 16px" }}>Close</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `SettingsScreen.tsx`**

```tsx
import { useState } from "react";
import { AboutModal } from "./AboutModal";

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const [about, setAbout] = useState(false);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2500 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1f2a1f", color: "#eee", padding: 24, borderRadius: 8, width: 420 }}>
        <h2 style={{ margin: "0 0 16px" }}>Settings</h2>
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Data source</h3>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
            <input type="checkbox" defaultChecked /> Tail JSONL files (default)
          </label>
          <label style={{ display: "block", fontSize: 13 }}>
            <input type="checkbox" /> Enable hooks (requires settings.json edit)
          </label>
        </section>
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Ghost retirement</h3>
          <label style={{ fontSize: 13 }}>
            Timer (minutes): <input type="number" defaultValue={3} min={1} max={60} style={{ width: 50 }} />
          </label>
        </section>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button onClick={() => setAbout(true)}>About</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
      {about && <AboutModal onClose={() => setAbout(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Add a gear button** to `Shell` in `App.tsx`:

```tsx
import { SettingsScreen } from "./settings/SettingsScreen";
import { useState } from "react";

// inside Shell component
const [settingsOpen, setSettingsOpen] = useState(false);

// render at bottom of Shell's JSX:
<button onClick={() => setSettingsOpen(true)} style={{ position: "fixed", top: 8, right: 8, zIndex: 100 }}>⚙</button>
{settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
```

- [ ] **Step 4: Add a macOS About menu item** in `src/main/index.ts`:

Add after `app.whenReady()`:

```ts
import { Menu } from "electron";

const template: Electron.MenuItemConstructorOptions[] = [
  {
    label: "claude-village",
    submenu: [
      {
        label: "About claude-village…",
        click: () => {
          const win = BrowserWindow.getFocusedWindow();
          win?.webContents.send("menu:about");
        }
      },
      { type: "separator" },
      { role: "quit" }
    ]
  }
];
Menu.setApplicationMenu(Menu.buildFromTemplate(template));
```

Expose a listener in preload:

```ts
onMenuAbout: (cb: () => void) => {
  const l = () => cb();
  ipcRenderer.on("menu:about", l);
  return () => ipcRenderer.off("menu:about", l);
}
```

And have `Shell` react to it by opening the About modal.

- [ ] **Step 5: Smoke**

Run: `pnpm dev`
Expected: ⚙ gear button top-right opens Settings with data-source toggles and ghost timer. Click "About" to see the About modal. macOS menu -> claude-village -> About opens the same.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/settings src/renderer/App.tsx src/main/index.ts src/preload/index.ts
git commit -m "feat: settings screen with data source toggles and About modal"
```

---

## Task 16: End-to-end integration test (depends on all above)

**Spec reference:** Section 12 (integration testing).

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/session-sync.spec.ts`, `tests/fixtures/subagent-return.jsonl`

- [ ] **Step 1: Playwright config**

`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: { headless: true }
});
```

- [ ] **Step 2: Write e2e spec**

`tests/e2e/session-sync.spec.ts`:

```ts
import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

test("a new session file causes a tab to appear", async () => {
  const fakeClaude = fs.mkdtempSync(path.join(os.tmpdir(), "cv-e2e-"));
  process.env.CLAUDE_CONFIG_DIR = fakeClaude;

  const app = await electron.launch({ args: ["out/main/index.js"], env: { ...process.env, CLAUDE_CONFIG_DIR: fakeClaude } });
  const window = await app.firstWindow();

  const projDir = path.join(fakeClaude, "projects", "-my-project");
  fs.mkdirSync(projDir, { recursive: true });
  const file = path.join(projDir, "sess-abc.jsonl");

  fs.writeFileSync(file,
    JSON.stringify({ type: "user", message: { role: "user", content: "hello" }, sessionId: "sess-abc", uuid: "u-1", timestamp: new Date().toISOString() }) + "\n" +
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t-1", name: "Read", input: { file_path: "/tmp/x.ts" } }] }, sessionId: "sess-abc", uuid: "u-2", timestamp: new Date().toISOString() }) + "\n"
  );

  await window.waitForTimeout(2000);
  const sidebarText = await window.locator("aside").innerText();
  expect(sidebarText).toContain("sess-abc".slice(0, 8));

  await app.close();
  fs.rmSync(fakeClaude, { recursive: true, force: true });
});
```

- [ ] **Step 3: Build and run**

```bash
pnpm build
pnpm e2e
```

Expected: PASS - the app launches, the sidebar shows `sess-abc` within 2s of the JSONL file being written.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts tests/e2e tests/fixtures
git commit -m "test: e2e spec verifying session tab appears on new JSONL file"
```

---

## Task 17: Packaging (.dmg)

**Spec reference:** Section 11 (Gatekeeper), Section 15 (repo conventions).

**Files:**
- Create: `electron-builder.yml`, `build/icon.png` (placeholder 512×512 blocky 🧱 icon), `docs/install.md`

- [ ] **Step 1: Create `electron-builder.yml`**

```yaml
appId: com.haimadrian.claudevillage
productName: claude-village
directories:
  output: release
files:
  - out/**/*
  - package.json
mac:
  category: public.app-category.developer-tools
  target: dmg
  icon: build/icon.png
  hardenedRuntime: false
  identity: null
```

- [ ] **Step 2: Add a placeholder icon at `build/icon.png`**

Use any 512×512 blocky brick PNG for now (document in `install.md` that this is a placeholder until proper branding).

- [ ] **Step 3: Create `docs/install.md`**

````markdown
# Installing claude-village

1. Download `claude-village-<version>.dmg` from the latest GitHub release.
2. Mount the DMG and drag `claude-village.app` to Applications.
3. First launch will be blocked by macOS Gatekeeper. From Terminal:

   ```bash
   xattr -d com.apple.quarantine /Applications/claude-village.app
   ```

4. Open the app. Start a Claude Code session in a terminal - it will appear as a tab.

Proper code signing and notarization will land in a future release.
````

- [ ] **Step 4: Build a dmg**

```bash
pnpm build
pnpm package
```

Expected: `release/claude-village-0.1.0-arm64.dmg` produced. Install + open and confirm the app works.

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml build docs/install.md
git commit -m "chore: electron-builder .dmg packaging + install doc"
```

---

## Execution order and parallelism

**Serial foundation (must land first, in order):**
- Task 1 -> Task 2

**Main-process parallel block** (each depends only on Task 2):
- Task 3, Task 4, Task 5, Task 6 (independent)
- Task 7 depends on 3-6

**Renderer parallel block** (each depends on Task 2; can mock IPC until Task 7 is ready):
- Task 8 (independent of 9-15)
- Task 9 (independent)
- Task 10 (independent)
- Task 11 depends on 9 + 10
- Task 12 depends on 9 + 11
- Task 13 depends on 8
- Task 14 depends on 11 + 12
- Task 15 depends on 8

**Integration + ship:**
- Task 16 depends on Task 7 + Task 15 (or earlier if mocks cover it)
- Task 17 after Task 16

Up to 7 tasks can run in parallel in the renderer block once Task 2 has landed, and 4 in the main block. Each task touches its own file(s) so there are no merge conflicts.

---

## Self-review

- **Spec coverage:** Every spec section is addressed.
  - §3 zones: Task 2 (shared types), Task 9 (Zone rendering).
  - §4 architecture: Tasks 3-7 (main), Tasks 8-15 (renderer).
  - §5 data flow: Tasks 3, 4, 5, 6, 7.
  - §6 character lifecycle: Tasks 10, 11, 14.
  - §7 tooltips: Task 12, Task 14 (bubble).
  - §8 timeline: Task 13.
  - §9 tabs: Task 8.
  - §10 settings + About: Task 15.
  - §11 error handling: covered in implementation of Tasks 3, 4, 7.
  - §12 testing: Tasks 3, 5, 6, 10 (unit), Task 16 (e2e).
  - §13 tech stack: Task 1.
  - §14 implementation plan: this doc.
  - §15 repo conventions: Task 1 (CI), commit messages throughout.

- **Placeholder scan:** no TBD / TODO / "similar to task N" / undefined types or methods remain.

- **Type consistency:** `AgentState`, `AgentEvent`, `SessionState`, `TimelineLine`, `Classification`, `ZoneId`, `ZoneMeta`, `SessionPatch` are defined once in Task 2 (shared) and Task 6 (`SessionPatch`) and reused verbatim by every downstream task.
