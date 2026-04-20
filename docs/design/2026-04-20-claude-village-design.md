# claude-village Design Document

**Status:** Draft for review
**Author:** Haim Adrian
**Date:** 2026-04-20

## 1. Overview

**claude-village** is a Mac desktop app that visualizes running Claude Code sessions as an animated Minecraft-style village. Each session is a tab; each agent inside a session is a voxel character walking between themed zones based on what they are doing right now (reading files, writing code, searching, running tests, git, web, spawning subagents, idle).

The goal is to give Claude Code users a delightful, legible, real-time view of what their agents are up to, without having to tail JSONL files or read terminal logs.

## 2. Goals and non-goals

### Goals
- Real-time, glanceable view of active Claude Code sessions.
- Show the hierarchy inside a session (main thread + subagents).
- Make tool-call activity legible through zones and animations.
- Work out of the box with zero Claude Code config changes.
- Offer an opt-in "live mode" via hooks for lower latency.
- Preserve the full terminal-style event feed as a collapsible timeline.
- Be fun to use.

### Non-goals
- Controlling or intervening in Claude sessions (read-only).
- Cross-platform (Windows / Linux) in v1.
- Replacing Claude Code's terminal UI.
- Persistent historical analytics (a future possibility, not in scope).

## 3. Concept

Each tab shows a single Claude Code session as a voxel **village** viewed through an orbital 3D camera. The village has nine fixed **zones** placed around a central plaza. Agents are voxel **characters** that walk from zone to zone depending on what tool they are using.

### Cast
- **Mayor:** the main Claude thread of the session. Distinctive skin. One per tab.
- **Villagers:** subagents spawned via the Task tool. Appear when spawned, disappear when done.
- **Ghosts:** a translucent retired state a subagent enters for 3 minutes after it finishes, so you can see "who just ran" at a glance. Ghosts drift to the Tavern zone.

### Nine zones

| Icon | Zone | Triggers |
|------|------|----------|
| 🏢 | Office | `Write`, `Edit`, `NotebookEdit` |
| 📚 | Library | `Read` |
| ⛏️ | Mine | `Glob`, `Grep` |
| 🌲 | Forest | `Bash` (generic shell) |
| 🌾 | Farm | `Bash` matching test patterns (`pnpm test`, `rspec`, `pytest`, `jest`, `ruby -Itest`, `go test`) |
| 🔥 | Nether portal | `Bash` matching git patterns (`git commit`, `git push`, `git branch`, `git checkout`, `gh ...`) |
| 🪧 | Signpost | `WebFetch`, `WebSearch`, MCP tool calls (`mcp__*`) |
| ✨ | Spawner | `Task`, `Agent` (spawning subagents) |
| 🍺 | Tavern | Idle, session end, or retired ghosts |

Classification is a pure function `AgentEvent -> { zone, animation, tooltip }` driven by a rules table defined in `classifier.ts`.

## 4. Architecture

Electron app, two processes.

```
+--------------------------------------------------+
|                   Main process (Node)             |
|                                                   |
|  session-watcher  hook-server                     |
|        |               |                          |
|        v               v                          |
|          classifier (pure)                        |
|               |                                   |
|               v                                   |
|          session-store ---> SQLite snapshot       |
|               |                                   |
|               v                                   |
|          ipc-bridge                               |
+---------------|----------------------------------+
                |  session:patch (diffs over IPC)
                v
+--------------------------------------------------+
|                   Renderer (React)                |
|                                                   |
|  Tab chrome + sidebar                             |
|    |                                              |
|    +-> VillageScene (Three.js) per active tab     |
|          - Zone meshes + signposts + icons       |
|          - Character entities (animation SM)     |
|    +-> TooltipLayer (raycaster)                   |
|    +-> TimelineStrip (collapsible)                |
|    +-> SettingsScreen + About modal               |
+--------------------------------------------------+
```

### Why this split
- Filesystem tailing and hook handling stay off the renderer thread so animations do not stutter when a large JSONL chunk arrives.
- `classifier.ts` is deterministic and easy to unit test.
- IPC carries only diffs (`session:patch`), so heavy scenes stay cheap on update.

## 5. Data flow and events

### Two interchangeable ingress paths

**A. JSONL file tailing (default, zero install).**
`chokidar` watches `~/.claude/projects/**/*.jsonl`. On file add or modify, the watcher reads from its last known byte offset to end, parses each new line as JSON, and emits a normalized `AgentEvent`. Offsets are kept per file.

**B. Claude Code hooks (opt-in, lower latency).**
A local server at `/tmp/claude-village.sock` (plus HTTP fallback at `127.0.0.1:<port>`) accepts `PreToolUse`, `PostToolUse`, `SessionStart`, `SubagentStart`, `Stop` payloads. Same `AgentEvent` shape as path A.

Both paths feed into the same classifier and store.

### Normalized `AgentEvent`

```ts
interface AgentEvent {
  sessionId: string;
  agentId: string;              // mainAgentId for the main thread
  parentAgentId?: string;       // for subagents
  kind: "main" | "subagent";
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
  toolArgsSummary?: string;     // condensed, ready for tooltip / timeline
  resultSummary?: string;       // post-tool-use only
  messageExcerpt?: string;      // first 500 chars of user/assistant text
  rawLine?: string;             // original JSONL line for the timeline
}
```

### Event -> village reaction

| Claude event | Village reaction |
|---|---|
| `SessionStart` | New tab auto-opens. Mayor spawns in Tavern and walks to plaza. |
| `user-message` | Mayor stops, faces camera, shows `...` bubble with message excerpt. |
| `assistant-message` (text only) | Mayor emits a thought bubble with a short excerpt. |
| `pre-tool-use: Task` | Mayor walks to Spawner. New subagent materializes beside them. Both show `...` bubbles for ~1.5s. Subagent then walks to their first real zone. |
| `pre-tool-use: <other>` | Agent walks to the mapped zone and plays `work-at-<zone>` animation. |
| `post-tool-use` | Work animation continues briefly; tooltip updates with `resultSummary`. |
| `subagent-end` | Subagent walks back to mayor. Both show `...` bubbles briefly. Subagent turns into a translucent ghost, drifts to Tavern. |
| `session-end` | Mayor walks to Tavern. Tab marked inactive; auto-closes after N minutes unless pinned. |

Parallel spawns (multiple `Task` tool_use blocks in a single assistant turn) cause all subagents to appear together around the Spawner, share one group `...` animation, then fan out.

## 6. Character lifecycle and animation

### State machine

```
       spawn
         |
         v
       idle <-------.
         |          |
         | (event)  | (no event for 10s)
         v          |
       walk --------+   (to target zone)
         |
         v
      work@zone
         |
         | (session end / subagent end)
         v
     talk-to-mayor  (only if subagent returning)
         |
         v
      retire-ghost
         |
         | (3 min, configurable)
         v
       despawn
```

### Movement

- **Pathfinding on a voxel grid.** The village is modeled as a coarse 1-block grid. Each zone's footprint (ground tile + building + signpost + decorative props) is marked **impassable**. Plaza tiles and connecting stone walkways are marked **walkable**.
- Route from current position to target zone computed with A* (via `pathfinding.js` or equivalent, ~8KB) on target change - not every frame. Result is a list of grid waypoints.
- Character walks along the waypoint polyline, turning at corners. Walk speed tuned so a typical inter-zone route takes ~800ms - ~1.5s depending on distance. 2-frame hop cycle throughout.
- **No collision between characters.** Characters overlap; z-offset by agent id hash avoids z-fighting.
- **Fallback if no path exists** (should not happen with a well-authored grid): log a warning and teleport the character straight to target.
- **Conversation huddle:** when triggered, the incoming character paths to a square one block beside the existing character and both face each other for the bubble duration, then continue on their own route.

### Animations (GLTF, reused voxel model)

`idle`, `walk`, `work-office`, `work-library`, `work-mine`, `work-forest`, `work-farm`, `work-nether`, `work-signpost`, `work-spawner`, `work-tavern`, `ghost` (material swap, not a new clip).

A single base character model is reused across all animations. Hashed-color tinting per agent id gives each agent a unique look without adding models.

### Performance budget

Target: smooth at **8 active sessions x 12 agents each** = 96 characters across the app.
- Only the active tab runs its scene loop. Inactive tabs pause their renderer.
- Ghosts use instanced rendering so 30 ghosts in a tavern cost about the same as one.
- Hard cap: 50 rendered characters per scene; overflow shows `+N more` in the tavern. Timeline still lists everything.

## 7. Tooltips

Hover target appears after 200ms. Single DOM tooltip anchored near the cursor, re-positioned on scroll or resize.

| Target | Tooltip content |
|--------|-----------------|
| Zone ground tile | Name + description + current occupants |
| Zone signpost (voxel prop) | Same as ground tile, with the full classification rule |
| Zone activity icon (floating emoji) | Quick name + link to Settings |
| Character body | Name, session id, kind (main / subagent), current action, last 5 actions |
| Character name label | Same as character body |
| Speech bubble during `...` | Full message excerpt (up to 500 chars) instead of `...` |

### Speech bubble length policy

Three layers so no bubble takes over the screen:
1. **On the character's head:** one line, hard-truncated to 60 chars with ellipsis. Auto-fades after ~2s.
2. **Hover bubble:** expands to a panel up to ~8 lines (~500 chars).
3. **Click bubble:** opens a right-side drawer (~380px wide), scrollable, with the full message. Esc or X closes.

## 8. Timeline strip

Collapsible bottom panel, ~180px tall when open. Default: closed (a thin tab at the bottom of the view).

- Shows the same feed Claude Code prints in the terminal: user messages, assistant messages, tool calls with condensed arg summary, tool results with short excerpt.
- Lines color-coded by agent (mayor = one accent color, subagents = rotating palette).
- Click a line -> camera smoothly glides to the agent that produced it and briefly rings them with a selection highlight.
- Auto-scroll to bottom unless the user has scrolled up.

## 9. Tab management

Hybrid lifecycle:
- Auto-open a tab when a session file's mtime moves within the last 10 minutes.
- User can **pin** a tab so it stays open even when idle.
- User can **close** a tab to drop it (will not auto-reopen for the same session until it is re-activated manually from the sidebar).
- Sidebar lists all recent sessions from `~/.claude/projects` for manual add.

Tab badges show: agent count, whether the timeline has new unseen lines, and session status (active / idle / ended).

## 10. Settings and About

### Settings
- Data source toggles: JSONL tail on/off, Hooks on/off + one-click hook-install.
- Watch path override (for `CLAUDE_CONFIG_DIR`).
- Ghost retirement timer (default 3 minutes).
- Zone vocabulary overrides (advanced).
- Theme / voxel skin pack selector (future).

### About
- macOS menu bar: **claude-village -> About claude-village...** opens the standard "About" modal.
- Content: app icon (blocky), version, **"Created by Haim Adrian for Claude Code users."**, open-source credits for any voxel asset packs used.
- Same content also reachable from **Settings -> About** for users who do not use the menu bar.

## 11. Error handling and edge cases

| Situation | Behavior |
|---|---|
| Malformed JSONL line | Log, skip line, keep tailing. Never crash. |
| `~/.claude/projects/` missing | Onboarding screen: "No Claude sessions found." Re-scan every 5s. |
| File rotates or rewritten from zero | Detect offset > size -> reset to top, dedupe by event id hash. |
| Hook socket busy | Fall back to next port; surface a clear banner in Settings. |
| Custom `~/.claude` path | Read `CLAUDE_CONFIG_DIR` env on boot; Settings lets user override the watch path. |
| Runaway parallelism (200+ agents in one session) | Hard cap 50 rendered characters per scene; overflow tallied in Tavern. Timeline still lists all. |
| Quit while hook server running | Electron `before-quit` cleans up socket + SQLite. Stale socket on next boot is unlinked on startup. |
| Unsigned build on macOS Gatekeeper | Document `xattr -d com.apple.quarantine claude-village.app` workaround until proper notarization. |

## 12. Testing

### Unit tests (no Electron needed)
- `classifier.ts` - table-driven tests covering every tool name and bash-command regex pattern.
- `session-store.ts` - reducer-style apply-event-and-check-state.
- JSONL line parser - fuzz with real session fixtures pulled from `~/.claude/projects`.

### Integration tests (Electron headless + Playwright)
- Write a synthetic JSONL file into a temp dir, point the watcher at it, assert the renderer receives the expected `session:patch` IPC messages.
- Assert tab auto-opens on new session and auto-closes after inactivity.

### Manual
- Visual polish, animation feel, tooltip placement.

## 13. Tech stack

- **Shell:** Electron (main process Node, renderer Chromium).
- **Renderer UI:** React + TypeScript + Vite.
- **3D:** Three.js (voxel models via GLTF), orbital camera via `@react-three/drei` `OrbitControls`.
- **Scene glue:** `@react-three/fiber` for React-idiomatic Three.js composition; `@react-three/drei` for helpers (Html labels, OrbitControls, instanced meshes).
- **File watching:** `chokidar`.
- **Pathfinding:** `pathfinding.js` (A* on a 2D grid).
- **Local storage:** `better-sqlite3` for pinned tabs + known sessions + last-known ghost positions.
- **Packaging:** `electron-builder` (.dmg output).
- **Testing:** Vitest (unit) + Playwright (integration).
- **Linting:** ESLint + Prettier + TypeScript strict mode.

## 14. Implementation plan

Tasks are chunked so main-process and renderer work can proceed in parallel without touching each other's files. Each task is one commit / PR.

### Foundation (serial; must land first)
1. **Repo scaffold** - Electron + Vite + React + TS + Vitest + Playwright + ESLint/Prettier + CI lint workflow.
2. **Shared types package** - `AgentEvent`, `ZoneLabel`, `AgentState`, `SessionState` in a `packages/shared` module. Single source of truth for main <-> renderer contracts.

### Main-process block (parallel; each depends only on #2)
3. **`session-watcher.ts`** + unit tests. Chokidar, offset tracking, JSONL line parser, offset-reset on truncation.
4. **`hook-server.ts`** + unit tests. Unix socket + HTTP fallback, input validation, Claude hook payload -> `AgentEvent` normalization.
5. **`classifier.ts`** + table-driven unit tests. Rules table for all nine zones; bash-regex catalog for test/git/generic.
6. **`session-store.ts`** + unit tests. Reducer-style event application, ghost expiry, SQLite snapshot/restore.
7. **`ipc-bridge.ts`** - wires 3-6 to `ipcMain`. Depends on 3-6.

### Renderer block (parallel; each depends on #2, mocks IPC until #7 is ready)
8. **Tab chrome + sidebar** - React shell, `SessionContext`, pin/close UX, sidebar list of recent sessions.
9. **`VillageScene`** - Three.js setup, nine zones with voxel props and signposts, orbital camera, lighting. Builds the walkable/impassable grid map from zone footprints. No characters yet.
10. **`pathfinding.ts`** + unit tests - A* over the walkable grid, `computePath(from, to)` returns waypoint list. Pure function, easy to test in isolation.
11. **`Character` component** - GLTF loader, animation state machine, hashed-color tinting, floating name label, consumes pathfinding for movement.
12. **`TooltipLayer`** - raycaster hit-tests for zones / signposts / icons / characters / bubbles. Single DOM tooltip with 200ms delay.
13. **`TimelineStrip`** - collapsible panel, color-coded per agent, click-to-camera-jump behavior.
14. **Conversation animations** - spawn huddle, return huddle, bubble truncation policy (60ch / 500ch / drawer).
15. **`SettingsScreen` + About modal** - data source toggles, watch-path override, ghost timer, About content.

### Integration and ship
16. **Wire renderer to real IPC + end-to-end smoke test** - Playwright integration spec that writes a synthetic JSONL file and asserts the expected scene updates.
17. **Packaging** - `electron-builder` config, `.dmg` output, README, install notes, Gatekeeper workaround doc.

Tasks 3-6 and 8-15 each touch their own module and can be implemented by a separate agent in parallel. The shared-types package (#2) is the synchronization point.

## 15. Repo conventions

- **Repo name:** `claude-village`.
- **Local path:** `~/Documents/GIT/claude-village`.
- **GitHub:** `haimadrian/claude-village` (private initially; may go public later).
- **Branching:** `main` always green. Feature branches `feat/<task-number>-<slug>` mapping to the tasks above.
- **Commits:** one logical change per commit. Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- **PRs:** one per task. CI runs lint + unit tests on every PR.
- **Docs:** this design doc lives at `docs/design/2026-04-20-claude-village-design.md` and is part of the first commit.

## 16. Open questions / future work

- Voxel asset pack choice (licensing + aesthetic pick) - defer until task 11.
- Windows / Linux support - out of scope for v1 but Electron makes it cheap to add later.
- Historical replay mode (scrub through a past session) - natural extension once JSONL parsing and scene rendering are in place.
- Multi-window support (one window per session instead of tabs) - postponed unless it becomes a pain point.
- Telemetry / opt-in usage metrics - not in v1.
