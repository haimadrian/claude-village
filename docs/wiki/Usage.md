# Usage

The app opens with two panes:

- A **sidebar** on the left listing your recent Claude Code sessions, newest first.
- A **tabbed main area** on the right that shows the village view for each open session.

When a new session starts in any terminal, it appears in the sidebar. Sessions that received activity in the last 60 seconds auto-open as a tab. Older sessions still appear in the sidebar but do not auto-open; click a row to open one manually.

## Session status

Computed live from `lastActivityAt`:

- **active** - any activity in the last 60 seconds.
- **idle** - activity in the last 10 minutes.
- **ended** - older than 10 minutes, OR the watcher / hook server saw an explicit `session-end` / `Stop` event.

A session that was marked ended will automatically reopen to active the moment any new event arrives for it.

## The village view

The tab body renders the 3D village. See [[Zones]] for the full zone reference. Each character represents an agent:

- **Mayor** - the top-level Claude agent. Always present while the session is live. Wears a near-white shirt.
- **Agents** - subagents dispatched via `Task` / `Agent`. Each gets a hashed per-id shirt colour so they are easy to tell apart. Labelled "Agent 1", "Agent 2", ... in the order they appeared.

Every character renders a name label above its head. When the agent is doing something, a short action bubble appears under the label; click the bubble to open the right-side **bubble drawer** with the full message, tool name, timestamp, and parent agent. Press `Esc` to close the drawer.

A character sitting in idle mode between tool calls shows a yellow 3D `!` above its head to tell you Claude is waiting for your input. The `!` disappears the moment a new event arrives.

## Tooltips

Hover any of the following to see a tooltip panel with zone name, description, or character summary:

- A zone building or its grass footprint.
- A zone's signpost (name + tools it represents).
- A zone's 3D icon.
- A villager or mayor character.

The tooltip appears after a 200 ms debounce and disappears when the pointer leaves the canvas.

## Timeline strip

The bottom of the tab hosts a collapsible timeline strip. Each row is one agent, each segment is a tool call, and time flows left to right. Click a segment to glide the camera to that agent's current zone. Collapse the strip when you just want the village.

## Tabs

- New active sessions auto-open as tabs.
- Right-click a tab to **pin** it - pinned tabs stay open across app restarts. Pin state is persisted to `{userData}/pinned.json`.
- Click the `x` on a tab to close it. Closing a tab does not affect the underlying Claude Code session.

## Sidebar footer icons

Three icon-only buttons at the bottom of the sidebar:

- **Settings** (gear) - opens the Settings dialog.
- **Help** (question mark) - opens the Help dialog with camera + mouse + keyboard shortcuts + a quick rundown of each zone.
- **About** (info glyph) - opens the About dialog (version, credits, link to the GitHub repo).

## Underwater atmosphere

Tilt the camera below the waterline and the scene switches to an underwater mode: a blue-teal exponential fog attaches, the sky and clouds hide, and a school of fish appears swimming above the seabed. Minor islands, boats, and the main island underside stay rendered and fade naturally into the blue. Rise back above and the sky returns.

## Keyboard shortcuts

See [[Camera and Controls|Camera-and-Controls]] for the full list.
