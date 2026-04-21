# claude-village - implementation progress

**Last updated:** 2026-04-20

## Status legend
- `[ ]` pending / available to claim
- `[~]` in progress (owner + started timestamp)
- `[x]` completed (commit sha)
- `[!]` blocked (reason)

## Foundation (serial - must land in order)

| # | Task | Status | Owner | Commit / Notes |
|---|------|--------|-------|----------------|
| 1 | Repo scaffold (Electron + Vite + React + TS + Vitest + Playwright + ESLint/Prettier + CI) | `[x]` | agent-scaffold | 9692804 |
| 2 | Shared types (`AgentEvent`, `AgentState`, `SessionState`, `ZoneId`, ...) | `[x]` | agent-shared-types | fe9dd4e |

## Main-process parallel block (each depends only on Task 2)

| # | Task | Status | Owner | Commit / Notes |
|---|------|--------|-------|----------------|
| 3 | `session-watcher.ts` + unit tests (JSONL tailing, offset tracking) | `[x]` | agent-session-watcher | 91249bf |
| 4 | `hook-server.ts` + unit tests (HTTP + socket Claude hook listener) | `[x]` | agent-hook-server | afab039 |
| 5 | `classifier.ts` + unit tests (event -> zone/animation/tooltip) | `[x]` | agent-classifier-orchestrator | bccba07 |
| 6 | `session-store.ts` + unit tests (in-memory + JSON `pinned.json` snapshot) | `[x]` | agent-session-store-orchestrator | 21532a0 |
| 7 | `ipc-bridge.ts` (wires 3-6 to ipcMain; depends on 3-6) | `[x]` | agent-ipc-bridge-orchestrator | f0a102e |

## Renderer parallel block (depends on Task 2; can mock IPC until Task 7)

| # | Task | Status | Owner | Commit / Notes |
|---|------|--------|-------|----------------|
| 8 | Tab chrome + sidebar + SessionContext | `[x]` | agent-tab-chrome-orchestrator | 7b5a97a |
| 9 | `VillageScene` + `Zone` (9 zones, orbit camera, walkable grid) | `[x]` | agent-village-scene-orchestrator | a121f89 |
| 10 | `pathfinding.ts` + unit tests (A* on the voxel grid) | `[x]` | agent-pathfinding-orchestrator | 3d749e4 |
| 11 | `Character` component (depends on 9 + 10) | `[x]` | agent-11-orchestrator | 0c76cfd |
| 12 | `TooltipLayer` (depends on 9 + 11) | `[x]` | agent-12-orchestrator | cd59f9c |
| 13 | `TimelineStrip` with click-to-focus (depends on 8) | `[x]` | agent-13-orchestrator | b986313 |
| 14 | Conversation animations + bubble drawer (depends on 11 + 12) | `[x]` | agent-14-orchestrator | 44717ae |
| 15 | `SettingsScreen` + About modal (depends on 8) | `[x]` | agent-15-orchestrator | 78bced5 |

## Integration and ship

| # | Task | Status | Owner | Commit / Notes |
|---|------|--------|-------|----------------|
| 16 | End-to-end integration test (Playwright over Electron) | `[x]` | agent-16-orchestrator | 41ffcd3 |
| 17 | Packaging (`electron-builder`, .dmg, install doc) | `[x]` | agent-17-orchestrator | c76818f |

## Milestones

- `M1` - Foundation done (1, 2 complete) - unblocks parallel work.
- `M2` - Main process wired (3-7 complete) - renderer can drop IPC mocks.
- `M3` - Renderer MVP (8, 9, 10, 11 complete) - characters render and move in the village.
- `M4` - Feature-complete (8-15 complete) - tooltips, timeline, conversations, settings.
- `M5` - Ship (16, 17 complete) - test green, DMG built.

## Tech debt / follow-ups (not blocking, track here)

- ~~**ESLint 9 flat-config migration** - currently `ESLINT_USE_FLAT_CONFIG=false` bridges the gap. Port `.eslintrc.cjs` to `eslint.config.js` flat config and drop the env var. Easier to do now than after Tasks 8+ add React component lint rules.~~ **Done** - `eslint.config.js` now drives lint, `ESLINT_USE_FLAT_CONFIG` and `--ext` removed from scripts. Legacy plugins (`@typescript-eslint/recommended`, `react-hooks/recommended`) bridged via `@eslint/eslintrc` FlatCompat; `eslint-plugin-react` uses its native flat export.
- ~~**Remove `--passWithNoTests` from the `test` script** once Task 2 or Task 3 lands real tests.~~ (done in task 3; flag is fully removed from `package.json`)
- ~~**`better-sqlite3` native rebuild** - before Task 6 starts, add a `postinstall` step and `pnpm.onlyBuiltDependencies`.~~ **Resolved by dropping `better-sqlite3` entirely.** Task 6 was reworked to snapshot pinned session ids to a plain JSON file at `{userData}/pinned.json` via `src/main/session-store.ts`. No native modules, no rebuild dance, no ABI flip.

## Post-v1 status

- **Shipping.** All 17 tasks complete, M5 reached. A signed-off-locally DMG is produced by `pnpm package`.
- **Key simplifications since the design doc was written:**
  - No native modules (dropped `better-sqlite3` for a JSON snapshot at `{userData}/pinned.json`).
  - No rebuild dance - `pnpm package` is just `electron-vite build && electron-builder --mac`.
  - Preload is emitted as CommonJS (`out/preload/index.cjs`) because Electron's preload sandbox rejects ESM.
- **Logging live** - `electron-log` writes to `{userData}/logs/main.log` (rolling 5MB x 3). INFO by default, DEBUG when `CV_DEBUG=1`.
- **CI test reports** - Vitest emits JUnit + HTML + v8 coverage under `reports/` when `CI=true`; Playwright emits HTML + JUnit under `playwright-report/`. Both uploaded as GitHub Actions artifacts and published via `dorny/test-reporter`.
- **E2E coverage** - grew from 1 to 3 specs: session-in-sidebar, active-auto-opens-tab (+ canvas renders), and Settings gear to About flow with Esc close.
- **GitHub Pages** - `.github/workflows/pages.yml` runs on main pushes, builds a site via `scripts/build-pages.mjs` (blue-themed, sidebar nav, responsive / mobile drawer), publishes docs + unit / coverage / e2e reports under `https://haimadrian.github.io/claude-village/`.
- **Release workflow** - `.github/workflows/release.yml` triggered on tag push `v*` or manual dispatch. Builds + packages + publishes the `.dmg` as a GitHub Release asset.
- **WebStorm shared launchers** - `.idea/runConfigurations/` has four launchers (Run app dev, Unit tests, E2E build + Playwright, Build release .dmg). Only that subdir is kept in git; rest of `.idea/` is ignored.

## Post-v1 polish pass (not in the original plan, shipped in-session)

- **Hook port is pinned** - `127.0.0.1:49251` always. If busy the app shows an `Electron.dialog.showErrorBox` and quits with exit code 1, so the `~/.claude/settings.json` snippet never goes stale. E2E bypasses via `CV_HOOK_PORT=0` (random port).
- **Hook snippet correct** - uses `--data-binary @-` (Claude Code writes payload on stdin, not an env var) and `.*` regex matcher. Trailing `2>/dev/null || true` + `--max-time 2` so the hook is a silent no-op when claude-village isn't running.
- **UX pass** - sidebar sorts by `lastActivityAt`; status computed at render time (active < 60s, idle < 10m, else ended) with opacity dim; horizontal tab-nav scroll chrome hidden; `Settings` button relocated to sidebar bottom with `flexShrink: 0` + border-top separator (pinned regardless of session-list scroll); Character name 16px + speech bubble 14px; zone icons + name labels have native `title=` tooltips; per-tab refresh button top-right of tab body calls `refreshSession(id)`; global `<style>` zeroes body/html/#root scrollbars.
- **Session titles** - `custom-title` and `summary` JSONL events captured by `event-normalizer` and stored as `session.title`. Shown in sidebar (truncated 28 chars + ellipsis) and tab nav (14 chars) with full title on hover via `title=` attr. Title-only events do not bump `lastActivityAt`.
- **Session age filter** - configurable in Settings: `1 day / 1 week / 1 month / 3 months / 6 months / 1 year / All`. Default `1 month`. Persisted in `localStorage` under `claudeVillage.sessionAgeFilter`. Change dispatches a `cv:filter-changed` event that Shell listens for.
- **Sidebar refresh** - ↻ button next to "Sessions" heading calls `listSessions()` IPC + merges, for the chokidar-missed-a-new-file case. Spins 600ms.

## Accepted spec deviations from Task 1 (documented for posterity)

- `vite` added as a direct devDependency (needed so `tsconfig.web.json`'s `"types": ["vite/client"]` resolves without relying on pnpm hoisting).
- `@vitejs/plugin-react` pinned to `^4.7.0` (Vite 5 / electron-vite 2.3 compat).
- ~~`ESLINT_USE_FLAT_CONFIG=false` added to `lint` and `lint:fix` scripts (see tech debt above).~~ Superseded: flat config migration landed in `chore/eslint-flat-config`; the env var is no longer needed.

## Post-v1 upgrade path (not part of the 17-task plan)

See design doc Section 14 (Asset tiers). Ships on Tier 1 (programmatic cubes). After M5, queue follow-up mini-plans for:

- **Tier 2 asset swap** - import Kenney.nl CC0 voxel packs, replace box characters and zone props with GLB models loaded via `useGLTF`.
- **Tier 3 custom assets** - author bespoke props in MagicaVoxel (tavern, Nether portal, signposts).
- **Tier 4 AI-generated props** - use Meshy.ai / Luma / Rodin for one-off decorative items, keep prompts in sidecar files.

## How to update this file

When an agent starts a task:

```
| 5 | classifier.ts... | `[~]` | agent-abc (2026-04-20 14:03) | - |
```

When finishing:

```
| 5 | classifier.ts... | `[x]` | agent-abc | 1a2b3c4 |
```

If blocked:

```
| 5 | classifier.ts... | `[!]` | agent-abc | blocked: waiting on task 2 shared types |
```
