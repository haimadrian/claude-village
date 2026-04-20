# Development

A guide for contributors working on claude-village itself. For install and user docs see
`docs/install.md` and `docs/usage.md`.

## Stack

- **Runtime** - Electron 33 (main + renderer processes).
- **UI** - React 18, Vite, TypeScript (strict).
- **3D** - `@react-three/fiber` + `@react-three/drei` + Three.js.
- **File watching** - `chokidar` (JSONL tail).
- **Storage** - plain JSON at `{userData}/pinned.json` (pinned session ids only). No native modules.
- **Pathfinding** - `pathfinding` (A\* for villagers moving between zones).
- **Logging** - `electron-log` with rolling file at `{userData}/logs/main.log`.
- **Testing** - Vitest (unit) and Playwright (end-to-end).
- **Quality** - ESLint + Prettier, TypeScript strict mode.
- **Packaging** - electron-builder (DMG target).

## Architecture

Two processes talk over a typed IPC bridge:

- The **main** process (Node) owns the JSONL watcher, optional hook HTTP server, the
  JSON-backed pinned-id store, the tool-to-zone classifier, and the logger.
- The **renderer** process (Chromium) draws the village using React and Three.js.
- The **preload** script exposes a narrow, typed surface via `contextBridge` so the
  renderer never touches Node APIs directly. The preload bundle is emitted as
  CommonJS (`out/preload/index.cjs`) because Electron's preload sandbox cannot load
  ESM.

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

`pnpm install` does not run any postinstall or rebuild step. There are no native
modules to rebuild.

## Dev loop

```bash
pnpm dev
```

This launches Electron (via `electron-vite dev`) with Vite HMR on the renderer.
Renderer edits reload instantly; main-process edits trigger a rebuild and restart.

- Logs: `~/Library/Application Support/claude-village/logs/main.log` (rolling, 5MB x 3).
  Default level is INFO; set `CV_DEBUG=1` in the env before launching for DEBUG.
- Renderer DevTools: `View -> Toggle Developer Tools` (Cmd+Option+I). When
  `CV_DEBUG=1`, DevTools is auto-opened at startup.
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

### Test reports

Vitest emits reports under `reports/` whenever `CI=true` is set (CI exports it;
locally just prefix with `CI=true`):

- `reports/unit-junit.xml` - JUnit XML for CI test-reporter integrations.
- `reports/unit-html/index.html` - human-readable HTML report. Open with
  `open reports/unit-html/index.html`.
- `reports/coverage/` - v8 coverage (text, HTML, lcov, json-summary). Open
  `reports/coverage/index.html` to browse line coverage per file.

Playwright always writes reports under `playwright-report/`:

- `playwright-report/results.xml` - JUnit XML.
- `playwright-report/index.html` - HTML report. Open with
  `pnpm exec playwright show-report`.

On failure Playwright also retains traces and videos under `test-results/`.

### Running e2e alongside a live app

The hook server binds to a fixed port (`127.0.0.1:49251`) so the
`~/.claude/settings.json` snippet never has to change and a second running copy
of claude-village hard-fails on launch instead of silently drifting to a random
port. Tests bypass that by setting `CV_HOOK_PORT=0` in the spawn env, which
picks a random free port for the test-run only. The e2e spec already does this;
if you add new specs that launch Electron, make sure to set `CV_HOOK_PORT: "0"`
in the `env` passed to `electron.launch`.

## Build and package

```bash
pnpm build       # emits main (ESM) + preload (CJS) + renderer into out/
pnpm package     # runs electron-builder --mac, emits a DMG into release/
```

Output: `release/claude-village-<version>-arm64.dmg`. No native modules are compiled
in either step. To test the packaged build, follow the install steps in
`docs/install.md`. The app's only persistent state is a tiny JSON file at
`{userData}/pinned.json` holding pinned session ids.

## Known quirks

- **ESLint flat-config shim** - ESLint 9 defaults to flat config, but the project still
  uses `.eslintrc.cjs`. The lint script sets `ESLINT_USE_FLAT_CONFIG=false`; migrating
  to flat config is tracked as tech debt in `docs/progress.md`.
- **Vitest electron stubs** - Main-process modules transitively import `electron` and
  `electron-log/main`, both of which load native bindings at import time and blow up
  under plain Node. `vitest.config.ts` aliases them to lightweight stubs in
  `tests/unit/stubs/` so unit tests can exercise `session-store`, `session-watcher`,
  etc. without spinning up Electron. If you add a new main-only import to a tested
  module, add a stub too.
- **Never set `CV_DEBUG=1` in E2E runs.** `CV_DEBUG=1` auto-opens DevTools as a
  separate window, and Playwright's `app.firstWindow()` then returns the DevTools
  window instead of the app UI, which silently breaks every spec.
- **Playwright 1.50.1 is pinned.** 1.59 has a config-loader quirk that breaks ESM
  configs in this repo. Do not bump without re-testing.

## CI

Two GitHub Actions workflows live in `.github/workflows/`:

- **`ci.yml` - Unit tests.** Runs on every push and pull request. Steps:
  `pnpm install` -> `pnpm typecheck` -> `pnpm lint` -> `pnpm test` with `CI=true`.
  Publishes JUnit results via `dorny/test-reporter`, uploads the Vitest HTML report
  (`unit-test-report` artifact) and coverage (`coverage-report` artifact), and
  emits a per-file coverage summary to the GitHub Actions job summary.
- **`e2e.yml` - E2E.** Runs on pull requests, pushes to main, and manual dispatch.
  Installs Playwright's Chromium, runs `pnpm build`, then `pnpm e2e`. Publishes
  JUnit results, uploads the Playwright HTML report (`playwright-html-report`
  artifact) always, and on failure additionally uploads traces/videos under
  `playwright-traces`.

Both jobs run on `macos-latest`. Artifacts are retained for 14 days.

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
