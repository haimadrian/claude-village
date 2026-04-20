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
| 6 | `session-store.ts` + unit tests (in-memory + SQLite snapshot) | `[x]` | agent-session-store-orchestrator | 21532a0 |
| 7 | `ipc-bridge.ts` (wires 3-6 to ipcMain; depends on 3-6) | `[x]` | agent-ipc-bridge-orchestrator | f0a102e |

## Renderer parallel block (depends on Task 2; can mock IPC until Task 7)

| # | Task | Status | Owner | Commit / Notes |
|---|------|--------|-------|----------------|
| 8 | Tab chrome + sidebar + SessionContext | `[x]` | agent-tab-chrome-orchestrator | 7b5a97a |
| 9 | `VillageScene` + `Zone` (9 zones, orbit camera, walkable grid) | `[x]` | agent-village-scene-orchestrator | a121f89 |
| 10 | `pathfinding.ts` + unit tests (A* on the voxel grid) | `[x]` | agent-pathfinding-orchestrator | 3d749e4 |
| 11 | `Character` component (depends on 9 + 10) | `[x]` | agent-11-orchestrator | 0c76cfd |
| 12 | `TooltipLayer` (depends on 9 + 11) | `[ ]` | - | - |
| 13 | `TimelineStrip` with click-to-focus (depends on 8) | `[x]` | agent-13-orchestrator | b986313 |
| 14 | Conversation animations + bubble drawer (depends on 11 + 12) | `[ ]` | - | - |
| 15 | `SettingsScreen` + About modal (depends on 8) | `[x]` | agent-15-orchestrator | 78bced5 |

## Integration and ship

| # | Task | Status | Owner | Commit / Notes |
|---|------|--------|-------|----------------|
| 16 | End-to-end integration test (Playwright over Electron) | `[ ]` | - | - |
| 17 | Packaging (`electron-builder`, .dmg, install doc) | `[ ]` | - | - |

## Milestones

- `M1` - Foundation done (1, 2 complete) - unblocks parallel work.
- `M2` - Main process wired (3-7 complete) - renderer can drop IPC mocks.
- `M3` - Renderer MVP (8, 9, 10, 11 complete) - characters render and move in the village.
- `M4` - Feature-complete (8-15 complete) - tooltips, timeline, conversations, settings.
- `M5` - Ship (16, 17 complete) - test green, DMG built.

## Tech debt / follow-ups (not blocking, track here)

- **ESLint 9 flat-config migration** - currently `ESLINT_USE_FLAT_CONFIG=false` bridges the gap. Port `.eslintrc.cjs` to `eslint.config.js` flat config and drop the env var. Easier to do now than after Tasks 8+ add React component lint rules.
- ~~**Remove `--passWithNoTests` from the `test` script** once Task 2 or Task 3 lands real tests. Flag hides accidentally-deleted test files from CI.~~ (done in task 3)
- ~~**`better-sqlite3` native rebuild** - before Task 6 starts, add a `postinstall` step (`electron-builder install-app-deps` or `@electron/rebuild`) and declare `pnpm.onlyBuiltDependencies: ["better-sqlite3", "electron"]` in `package.json`. Without this, Task 6 will throw `NODE_MODULE_VERSION mismatch` the first time the main process requires `better-sqlite3`.~~ (done before task 6 - `postinstall` rebuilds for Electron, `pretest` rebuilds for Node since vitest runs under Node 20)

## Accepted spec deviations from Task 1 (documented for posterity)

- `vite` added as a direct devDependency (needed so `tsconfig.web.json`'s `"types": ["vite/client"]` resolves without relying on pnpm hoisting).
- `@vitejs/plugin-react` pinned to `^4.7.0` (Vite 5 / electron-vite 2.3 compat).
- `ESLINT_USE_FLAT_CONFIG=false` added to `lint` and `lint:fix` scripts (see tech debt above).
- `--passWithNoTests` added to the `test` script (see tech debt above).

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
