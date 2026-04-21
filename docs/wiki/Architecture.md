# Architecture

## Process model

Three processes in the standard Electron shape:

- **Main** (Node) - `src/main/`. Owns the JSONL watcher, the optional hook HTTP server, the session store, the classifier, logging, and the IPC bridge.
- **Preload** (`src/preload/`) - a small contextBridge shim exposing `window.claudeVillage.*` to the renderer. Emitted as CommonJS (`out/preload/index.cjs`) because Electron's preload sandbox rejects ESM; main and renderer stay ESM.
- **Renderer** (`src/renderer/`) - React 18 + `@react-three/fiber` + drei. Receives patches from main over IPC and renders the 3D scene.

## Data flow

```
JSONL file / POST /event
        |
        v
  event-normalizer  ->  AgentEvent[]
        |
        v
   session-store         (in-memory, plus pinned.json snapshot)
        |   emit patch
        v
    ipc-bridge  ->  webContents.send("session:patch", patch)
        |
        v
  SessionContext.applyPatch  (renderer state)
        |
        v
     VillageScene       (re-renders when agents/timeline change)
        |
        v
       Canvas    Zone    Character    TooltipLayer    TimelineStrip
```

Patches are minimal: `session-upsert`, `agent-upsert`, `agent-remove`, `timeline-append`. The renderer's reducer lazily materialises a placeholder session if an `agent-upsert` or `timeline-append` arrives before its `session-upsert` sibling, so an out-of-order delivery never drops a character silently.

## Session state

`AgentState` (per character) carries:

- `id`, `kind` (`main` | `subagent`), `parentId`
- `currentZone` / `targetZone` (zone id)
- `animation` (`work-office`, `work-library`, `idle`, `ghost`, ...)
- `recentActions` (ring buffer of recent tool summaries, capped at 5)
- `skinColor` (hashed from `id`; used as shirt colour for subagents)
- `waitingForInput` (optional; drives the yellow 3D `!` above the head)

`SessionState` (per tab) carries `sessionId`, timestamps, `status`, `title`, an `agents: Map<id, AgentState>`, and a capped `timeline` array.

Persistence is minimal: `{userData}/pinned.json` stores the list of pinned session ids. Nothing else. We used to snapshot into SQLite via `better-sqlite3`; that was dropped in favour of flat JSON because native modules made packaging painful for almost no value.

## Scene structure

`src/renderer/village/`:

- `VillageScene.tsx` - Canvas root. Mounts drei Sky + Clouds, WavyWater, Seabed, FishSchool, IslandGreenery, MinorIsland x8, BoatFleet, the 9 Zones, the click pads, and one Character per agent. Owns `OrbitControls`, the `CameraTargetLerper`, and the keyboard pan hook.
- `Zone.tsx` - zone group: GLB building + signpost + 3D icon. Every descendant mesh carries `userData.tooltipKind` for raycaster resolution.
- `Character.tsx` - Tier 1 cube fallback + Tier 2 cloned GLB body, plus a shared `CharacterDecorations` overlay (face + hair + arms + legs) and the waiting-for-input `!` indicator.
- `UnderwaterAtmosphere.tsx` - toggles `scene.fog` + `scene.background` and the Sky / Clouds `group.visible` based on `camera.position.y`.
- `TooltipLayer.tsx` - raycaster-backed hover panel. Walks parent chains looking for `userData.tooltipKind`.
- `TimelineStrip.tsx`, `BubbleDrawer.tsx`, `ZoneIcon3D.tsx`, `Seabed.tsx`, `FishSchool.tsx`, `WavyWater.tsx`, `MinorIsland.tsx`, `Boat.tsx`, `IslandGreenery.tsx`, `GltfErrorBoundary.tsx`.

## Assets

Tier 2 voxel GLBs live under `src/renderer/assets/models/` (~85 KB total). They are placeholder GLBs generated programmatically by `scripts/generate-placeholder-glbs.mjs` acting as a filename-matched stand-in for Kenney.nl CC0 packs (Mini Characters 1.1, Castle Kit, Nature Kit, Dungeon Pack, Conquer, Platformer Kit). Drop real GLBs into the same filenames and the swap is zero-code.

The GLB round-trip moves the mesh name onto the wrapping `Object3D` node; the tint code in `CharacterMesh` walks the parent chain to find the `"body"` ancestor before applying the per-agent shirt colour.

## Testing

- **Vitest** for unit tests. Main-process modules test against small fakes; renderer-pure helpers (slots, agentLabels, appearance, minorIslands, greeneryLayout, seabedLayout, fish paths, keyboardPan math, sessionStatus) test without a Canvas.
- **Playwright** (`_electron.launch`) for end-to-end. Current specs: session-sync, multi-agent (mayor + subagent rendering driven by hook POSTs), tooltip (5x5 grid sweep).
- CI emits JUnit + HTML + v8 coverage under `reports/` in CI mode; Playwright emits HTML + JUnit under `playwright-report/`. Both are uploaded as GitHub Actions artefacts and published on GitHub Pages.

## Shutdown

Clicking the window close button calls `app.quit()` on every platform (we explicitly drop the default macOS "stay alive after last window" pattern). The `before-quit` handler stops the watcher and the hook server so nothing leaks.
