# Development

A guide for contributors working on claude-village itself. For install and user docs see
`docs/install.md` and `docs/usage.md`.

## Stack

- **Runtime** - Electron 33 (main + renderer processes).
- **UI** - React 18, Vite, TypeScript (strict).
- **3D** - `@react-three/fiber` + `@react-three/drei` + Three.js.
- **File watching** - `chokidar` (JSONL tail).
- **Storage** - `better-sqlite3` (session/event store).
- **Pathfinding** - `pathfinding` (A\* for villagers moving between zones).
- **Testing** - Vitest (unit) and Playwright (end-to-end).
- **Quality** - ESLint + Prettier, TypeScript strict mode.
- **Packaging** - electron-builder (DMG target).
- **Logging** - `electron-log`.

## Architecture

Two processes talk over a typed IPC bridge:

- The **main** process (Node) owns the JSONL watcher, optional hook HTTP server, the
  SQLite store, the tool-to-zone classifier, and the logger.
- The **renderer** process (Chromium) draws the village using React and Three.js.
- The **preload** script exposes a narrow, typed surface via `contextBridge` so the
  renderer never touches Node APIs directly.

For the full design see `docs/design/2026-04-20-claude-village-design.md`. For the
task-by-task plan see `docs/plans/2026-04-20-claude-village-plan.md`. Current status is
tracked in `docs/progress.md`.

## Prerequisites

- Node 20 (match the Electron 33 bundled Node ABI).
- pnpm 9 or newer.
- macOS (arm64). Windows and Linux are not supported in v1.

## Clone and install

```bash
git clone https://github.com/haimadrian/claude-village.git
cd claude-village
pnpm install
```

`pnpm install` runs a `postinstall` hook (`electron-builder install-app-deps`) that
rebuilds native modules (notably `better-sqlite3`) against the Electron ABI. You do not
need to run any extra rebuild step after a fresh install.

## Dev loop

```bash
pnpm dev
```

This runs `rebuild:electron` and then launches Electron with Vite HMR on the renderer.
Renderer edits reload instantly; main-process edits trigger a rebuild and restart.

- Logs: `~/Library/Application Support/claude-village/logs/main.log`.
- Renderer DevTools: `View -> Toggle Developer Tools` (Cmd+Option+I).
- Main-process debugger: launch with `--inspect-brk` and attach from Chrome DevTools or
  use the VS Code launch config.

## Code layout

- `src/shared/` - types and constants used by both processes.
- `src/main/` - Node process (JSONL watcher, hook server, classifier, store, IPC bridge,
  logger).
- `src/preload/` - contextBridge exposure of the typed IPC API.
- `src/renderer/` - React + Three.js UI (village scene, sidebar, tabs, drawer, timeline,
  settings).
- `tests/unit/` - Vitest specs.
- `tests/e2e/` - Playwright specs.

## Quality gates

Run before every commit:

```bash
pnpm typecheck   # tsc for node and web projects
pnpm lint        # ESLint + Prettier check
pnpm test        # Vitest unit suite
pnpm e2e         # Playwright (requires a prior `pnpm build`)
```

`pnpm lint:fix` auto-fixes what it can.

## Build and package

```bash
pnpm build       # emits main + preload + renderer into out/
pnpm package     # invokes electron-builder, emits a DMG into release/
```

Output: `release/claude-village-<version>-arm64.dmg`. To test the packaged build,
follow the install steps in `docs/install.md`.

## Known quirks

- **Native module ABI flip** - `better-sqlite3` has to be compiled twice: against the
  Node ABI for Vitest (which runs in plain Node) and against the Electron ABI for the
  app itself. The `pretest` / `posttest` scripts flip it automatically. If you Ctrl-C a
  test run mid-flight, rebuild manually with `pnpm run rebuild:electron` before running
  `pnpm dev`.
- **Vitest vs Playwright partitioning** - Vitest must not see Playwright `.spec.ts`
  files and vice versa. `vitest.config.ts` and `playwright.config.ts` partition by
  directory (`tests/unit/` and `tests/e2e/`). Do not put specs anywhere else.
- **ESLint flat-config shim** - ESLint 9 defaults to flat config, but the project still
  uses `.eslintrc.cjs`. The lint script sets `ESLINT_USE_FLAT_CONFIG=false`; migrating
  to flat config is tracked as tech debt.

## Docs

- `docs/design/2026-04-20-claude-village-design.md` - design doc (source of truth for
  scope and vocabulary).
- `docs/plans/2026-04-20-claude-village-plan.md` - task-by-task implementation plan.
- `docs/progress.md` - live status of all 17 tasks. Do not hand-edit; it is updated by
  task-completion workflows.

## Contributing

- **Branches** - `feat/<slug>` for features, `fix/<slug>` for fixes. Solo work may push
  directly to main; larger changes should go through a PR.
- **Commits** - Conventional Commits, no scope parenthetical: `feat:`, `fix:`, `chore:`,
  `docs:`, `test:`, `refactor:`.
- **Style** - No em dashes (use a regular `-`) and no arrows (use `->` not the unicode
  arrow). Run `pnpm lint:fix` to let Prettier handle the rest.
- **Pre-commit** - All quality gates must pass before you open a PR.
- **PRs** - CI runs lint, typecheck, and unit tests on every push.
