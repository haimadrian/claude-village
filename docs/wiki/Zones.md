# Zones

Nine themed zones form a ring around a central mayor square. Each character walks to the zone that matches the tool it is using right now. The zone IDs and labels live in `src/shared/zones.ts` as the single source of truth; the Help dialog in-app iterates that same list, so any future addition surfaces automatically.

| Zone          | Icon | Tools it represents                                                  |
| ------------- | ---- | -------------------------------------------------------------------- |
| Office        | 🏢   | `Write`, `Edit`, `NotebookEdit`                                      |
| Library       | 📚   | `Read`                                                               |
| Mine          | ⛏️    | `Glob`, `Grep`                                                       |
| Forest        | 🌲   | `Bash` (generic shell commands)                                      |
| Farm          | 🌾   | Test runners (`pnpm test`, `npm test`, `yarn test`, `vitest`, `jest`, `pytest`, `rspec`, `go test`, `cargo test`) |
| Nether portal | 🔥   | `git` subcommands + `gh ...` at the start of a command               |
| Signpost      | 🪧   | `WebFetch`, `WebSearch`, any `mcp__*` tool                           |
| Spawner       | ✨   | `Task`, `Agent` (subagent dispatch)                                  |
| Tavern        | 🍺   | Idle, finished, or retired ghosts                                    |

## How the classifier picks a zone

`src/main/classifier.ts` maps each `AgentEvent` to a `{zone, animation, tooltip, timelineText}` tuple:

- `pre-tool-use` / `post-tool-use` - the tool name drives the zone. For `Bash` we also peek at the command via two regexes so test runners land at the Farm and `git` / `gh` commands land at the Nether portal.
- `session-end` / `subagent-end` - Tavern, `work-tavern` animation.
- `user-message` / `assistant-message` - Tavern, `idle` animation (the agent is waiting, not tooling).

## Character slots

Each zone can host multiple agents at once. The renderer computes a per-(zone, agentId) slot just outside the zone footprint so characters stand next to the building, never inside it. Slot positions are derived from a deterministic hash in `src/renderer/village/slots.ts`. Collision avoidance (`separation.ts`) then keeps agents from walking through each other frame-by-frame.

## Tooltip content

Hover any part of a zone (the building, its grass footprint, the signpost, or the 3D icon) and the tooltip panel shows:

- Zone icon + name
- Human description of the tools it represents
- A "Here now" line listing the agents currently in that zone for the focused session

The tooltip uses a drei `<Html>` panel anchored to the cursor position. If the tooltip ever stops working, `tests/e2e/tooltip.spec.ts` will catch it - it sweeps a 5x5 grid over the canvas and asserts the panel renders.
