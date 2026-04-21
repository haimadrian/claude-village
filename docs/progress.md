# claude-village - implementation progress

**Last updated:** 2026-04-21

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

See design doc Section 14 (Asset tiers). Shipped on Tier 1 (programmatic cubes); Tier 2 pipeline is now live.

- ~~**Tier 2 asset swap** - import Kenney.nl CC0 voxel packs, replace box characters and zone props with GLB models loaded via `useGLTF`.~~ **Pipeline landed** in `feat/assets-tier2-kenney` (commit `3b75ce1`). `useGLTF` + `Suspense` + `GltfErrorBoundary` wired with programmatic-cube fallback on load failure; 11 placeholder GLBs (~85 KB total) ship today via `src/renderer/assets/models/`. Real Kenney CC0 packs (Mini Characters 1.1, Castle Kit, Nature Kit, Dungeon Pack, Conquer, Platformer Kit) are a filename-matched drop-in with zero code change, tracked as follow-up "drop real Kenney GLBs into place".
- **Tier 3 custom assets** - author bespoke props in MagicaVoxel (tavern, Nether portal, signposts).
- **Tier 4 AI-generated props** - use Meshy.ai / Luma / Rodin for one-off decorative items, keep prompts in sidecar files.

## Post-v1 maintenance pass (2026-04-21)

Five parallel worktrees, each orchestrated by an isolated agent, then squash-merged to main in a single cleanup pass to keep the history readable.

- **Agent movement bug fix** (`bfad47f` - was `fix/agent-movement`). Characters were frozen in Tavern because `<group position={...}>` re-applied `currentWorld` on every store patch, snapping them back each tool event. Moved initial-position capture into a `useRef` set once on mount; `useFrame` now owns the transform. Zone positions and the walkable grid are memoized in `VillageScene`. Added lightweight per-frame separation steering (`src/renderer/village/separation.ts`, radius 0.8, strength 3, max 2 u/s) so characters no longer pass through each other. Store now advances `agent.currentZone` in lockstep with `targetZone` so zone-focus and tooltips stay coherent. Mayor fixed along the way (shared code path).
- **Session status "ended" while active fix** (`1c68c75` - was `fix/session-status-active`). Two bugs: the store never flipped `status` back to `active` when activity arrived after a `session-end`, and the tab body rendered raw `s.status` instead of the derived live status the sidebar uses. Store now reopens on any activity event; `deriveStatus` hoisted into `src/renderer/sessionStatus.ts` and used in both the sidebar and the tab body.
- **ESLint 9 flat-config migration** (`d0c4fe0` - was `chore/eslint-flat-config`). `.eslintrc.cjs` removed, `eslint.config.js` (ESM flat) added. Legacy plugins bridged via `@eslint/eslintrc` `FlatCompat`; `eslint-plugin-react` uses its native flat export. `ESLINT_USE_FLAT_CONFIG=false` and `--ext` dropped from scripts.
- **Install / Uninstall hook from Settings** (`34a67b4` - was `feat/hook-autoinstall`). New `src/main/hook-installer.ts` with pure `computeMerged` / `computeRemoved` helpers + atomic temp-file-rename filesystem wrappers. Three new IPC channels (`hooks:read`, `hooks:install`, `hooks:uninstall`). Settings screen now shows Install / Uninstall buttons above the manual snippet, with a side-by-side before/after diff modal and a post-action banner. User entries are preserved; ours are identified by port `49251`. 16 new unit tests.
- **Tier 2 voxel assets** (`3b75ce1` - was `feat/assets-tier2-kenney`). See above in the upgrade-path section.

All five streams passed `pnpm lint && pnpm typecheck && pnpm test && pnpm build` on their branches, and again on `main` after each squash merge. Post-merge test count: **79 unit** + **3 e2e**.

### Follow-up waves (same day)

Three additional parallel waves after the first batch, also merged as clean squash commits:

- **Speech-bubble empty / arrow-only fix** (`cbd9d75` - was `fix/bubble-keep-last-action`). Classifier trims excerpts and falls back to `Done` / `User` / `Thinking` when the summary collapses to an empty string (the previous `?? "Done"` never fired because `""` is not nullish). Exported `isTrivialSummary` guards `recentActions.push` so arrow-only or punctuation-only results (`->`, `...`) never overwrite the last meaningful bubble. Timeline still shows arrows. 4 new classifier tests + 2 new session-store tests.
- **Scene polish** (`832199d` - was `feat/scene-polish-world`). Drei `<Sky>` + `<Cloud>` replace the flat Canvas background, a 200x200 transparent-blue water plane surrounds a round 48-segment grass island. Zone ring `RADIUS` 8 -> 13, walkable grid 32 -> 48. Floating HTML emoji replaced with primitive-geometry 3D icons per zone (books, pickaxe, pine, mug, flame, sparkle, wheat, signpost, office block) in a new `ZoneIcon3D.tsx`. Brown signpost column replaced by an actual post + plank + drei `<Text>` zone-name, oriented toward the island centre. Characters target a per-(zone, agent) hashed slot outside the zone footprint via a new `slots.ts` helper so multiple agents at the same zone never overlap with the building. 10 new slot tests, all e2e still green.
- **Character face, hair, arms** (`a72b001` - was `feat/character-face-hair-hands`). Minecraft-style decorations rendered as a shared `CharacterDecorations` overlay on both the Tier 1 `FallbackCharacter` and the Tier 2 cloned GLB: two dark eye boxes and a mouth on the head front face, a hair slab plus front fringe on top (per-agent colour from a 5-entry palette hashed with djb2 in a new `appearance.ts`), and two skin-coloured arm boxes hanging from the torso. Ghost opacity propagates to every new material. Placeholder GLBs untouched; real Kenney packs already ship their own faces/hair/arms, so no code change needed when they drop in. 4 new appearance tests.

Final post-merge test count: **101 unit** + **3 e2e**. Main log is still linear: 9 squash commits + 1 docs commit since `b7f9edd`.

### 2026-04-21 wave 4: scene depth, legs, signpost, quit-on-close

Four more parallel worktrees, all merged to main as independent squash commits:

- **Quit on window close** (`b0077b0` - was `fix/quit-on-window-close`). Dropped the `process.platform !== "darwin"` guard from the `window-all-closed` handler so `app.quit()` fires everywhere. The existing `before-quit` handler tears down the SessionWatcher and HookServer so shutdown is clean. Electron's stock macOS pattern keeps the app alive after the last window closes; claude-village has no useful headless-alive behaviour so this matches the user's expectation.
- **Character legs** (`10d42aa` - was `feat/character-legs`). Shortened the Tier 1 torso from 1.6 to 0.8 tall and added two 0.25 x 1.0 x 0.3 leg boxes below so the foot bottom lands on the grass at neutral bob. Legs render on both Tier 1 FallbackCharacter and Tier 2 CharacterMesh via a shared overlay, keeping ghost-opacity plumbing identical. New `trousersColor(id)` helper (5-colour djb2-hashed palette) mirrors `hairColor`.
- **Signpost text + zone/signpost tooltips** (`b58d81a` - was `fix/signpost-text-and-tooltips`). Plank swapped to a lighter pine tone; zone-name rendered at 0.28 fontSize in near-black with a white outline, and duplicated on the back plank face so it is readable from every camera angle. Explicit `userData.tooltipKind` stamped on every signpost sub-mesh (post, plank, text) plus an invisible generous hitbox, and the cloned GLB scene is traversed so every descendant carries `zone-ground` userData. Hover now reliably resolves the zone tooltip regardless of which part of the building, signpost, or icon the raycast hits.
- **Scene depth: waves + minor islands + boats + free camera + seabed** (`f1324c1` - was `feat/scene-depth-waves-boats`). Animated PlaneGeometry water with summed sinusoids and recomputed normals; opaque deep-blue seabed plane at y=-1.6. Main island is now a 3-unit cylinder with earthy sides so it reads as a raised landmass from below. 8 deterministic minor islands (seeded mulberry32, dirt+grass cap + 1-3 cone-on-trunk trees) scattered in the annulus outside the main island. 4 boats on distinct orbits with `lookAt` tangent orientation, bob, pitch, and roll, all driven by one shared `useFrame`. OrbitControls gets `screenSpacePanning`, `minDistance=4`, `maxDistance=80`, `maxPolarAngle=0.55pi`, plus invisible zone click pads that dispatch `village:focus-zone` and a `CameraTargetLerper` that glides the orbit target to any focused zone or agent.

Post-wave-4 totals: **118 unit** + **3 e2e**, lint / typecheck / build all green. Linear log, 15 squash + docs commits since `b7f9edd`.

### 2026-04-21 wave 5: subagent rendering + walk speed

- **Walk speed** (`37fd154`). Characters used to walk at 3 u/s so a cross-ring traversal took around 8 seconds - usually longer than the gap between tool events, so the character almost never reached its destination before being redirected. Bumped `SPEED` to 8 u/s in `Character.tsx`; separation max-step stays at 2 u/s so collision avoidance is still gentle.
- **Subagent characters render + e2e** (`10cce7d`). Only the Mayor was ever visible because `event-normalizer.ts` hard-coded `agentId: sessionId, kind: "main"` for every event, and `hook-server.ts` only tagged subagents when the payload carried a non-existent `agent_id` field. Fixed by detecting `Task` / `Agent` tool dispatches in both ingress paths and emitting synthetic `subagent-start` / `subagent-end` events with `agentId = <sessionId>:<tool_use_id>`. `normalizeJsonlEvent` grew a plural sibling `normalizeJsonlEvents` returning `AgentEvent[]`; `SessionWatcher` consumes the array API. New `tests/e2e/multi-agent.spec.ts` launches Electron with `CV_HOOK_PORT=49333` and an empty `CLAUDE_CONFIG_DIR`, POSTs a full `SessionStart -> Read -> Task -> PostToolUse -> Stop` flow into the hook server, and asserts both the mayor and the subagent render via drei `<Html>` label title attributes (Mayor carries the shield prefix, subagents do not). 8 new unit tests (5 normalizer, 3 hook-server) cover Task pre/post pairing, stable id linkage, fallback counter, non-Task no-synthesis, and the nested-subagent guard.

Known follow-up (not shipped in wave 5): Claude Code writes the subagent's own transcript to a SEPARATE JSONL file. The synthetic subagent character currently shows up and expires on the parent's `Task` pre/post pair but its `recentActions` stays empty. Wiring the child transcript back into the parent session needs a file correlation layer and was deliberately deferred.

Post-wave-5 totals: **126 unit** + **4 e2e**. Linear log, 17 squash + docs commits since `b7f9edd`.

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
