# Using claude-village

claude-village is a Mac desktop app that renders your running Claude Code sessions as an
animated Minecraft-style village. Each session is a tab, each agent is a voxel character,
and the character walks between themed zones based on whichever tool it is using at that
instant. Watching the village gives you a spatial, ambient sense of what Claude is doing
without having to stare at a scrolling terminal.

## Launching

Open `claude-village.app` from Applications or Launchpad. The window opens with two
panes:

- A sidebar on the left that lists your recent Claude Code sessions (newest first).
- A tabbed main area on the right that shows the village view for each open session.

When a new session starts in any terminal, it appears in the sidebar and a tab opens
automatically if the session is active (any activity in the last 60 seconds). Older
sessions still show up in the sidebar but do not auto-open a tab; click the row to
open one manually. When a session goes idle for long enough, its agent turns into a
ghost and eventually retires.

## Sidebar

The sidebar shows each session's short ID, project, and last-activity timestamp,
sorted by most recent activity first. Status is derived from last activity:

- **active** - activity in the last 60 seconds (auto-opens a tab).
- **idle** - activity in the last 10 minutes.
- **ended** - older than 10 minutes (rendered dimmed).

Click a row to open that session in a new tab. A session already open in a tab is
highlighted so you do not open it twice.

## The village (the tab body)

The main area of a tab is a 3D village made up of nine themed zones arranged in a ring
around a central mayor square:

| Zone          | Tools it represents                          |
| ------------- | -------------------------------------------- |
| Office        | `Write`, `Edit`                              |
| Library       | `Read`                                       |
| Mine          | `Glob`, `Grep`                               |
| Forest        | `Bash`                                       |
| Farm          | test runners (`vitest`, `jest`, `pytest`...) |
| Nether portal | `git` commands                               |
| Signpost      | `WebFetch`, MCP tool calls                   |
| Spawner       | `Task` (sub-agent spawn)                     |
| Tavern        | idle / ghosts                                |

Agents in a session are one of:

- **Mayor** - the top-level Claude agent for this session. Stands in the center square.
- **Villagers** - active sub-agents (spawned via `Task`). Each walks to the zone matching
  whatever tool it is using right now.
- **Ghosts** - sub-agents that went idle. They drift toward the tavern and eventually
  retire (configurable).

### Tooltips

Hover any of the following for a tooltip:

- A zone tile (shows zone name and the tools it represents).
- The signpost (shows destination hosts for recent WebFetch / MCP calls).
- A tool icon floating above a character.
- A villager or ghost (shows agent ID and current tool).

### Speech bubbles

Each character has a name label floating above its head and, when it is saying
something, a short speech bubble directly under the label. Both are rendered at a
fixed on-screen size (name 14px, bubble 13px, with a subtle shadow) so they stay
readable at any camera angle or zoom level.

Click the speech bubble to open the right-side **bubble drawer**, which shows the
full message text plus metadata (timestamp, tool, parent agent). Press `Esc` to
close the drawer.

## Timeline strip

The bottom of the tab hosts a collapsible timeline strip. Each row is one agent, each
segment is a tool call, and time flows left to right. Click a segment to pan the camera
to that agent at that moment in the village view. Collapse the strip when you just want
the village.

## Camera controls

- Click and drag anywhere in the village to rotate the camera.
- Scroll (pinch on a trackpad) to zoom in and out.
- Clicking a timeline segment will pan and re-center automatically.

## Settings

Open settings from the gear icon in the top-right corner of the window.

- **Data source toggles** - JSONL tail is on by default. Toggle hooks on if you have the
  optional Claude Code hook server set up (it gives richer tool boundary events).
- **Ghost retirement timer** - how long a villager can stay idle before it becomes a
  ghost, and how long a ghost lingers before it despawns.

## About

Pick one of:

- macOS menu bar -> `claude-village` -> `About claude-village`.
- Settings panel -> About tab.

Shows the current version and a link to the GitHub repo.

## Tabs

- New active sessions (activity within the last 60 seconds) auto-open as tabs.
- Right-click a tab to **pin** it - pinned tabs stay open across app restarts. Pin
  state is persisted to `{userData}/pinned.json`.
- Click the `x` on a tab to close it. Closing a tab does not affect the underlying
  Claude Code session.
- The tab bar scrolls horizontally when you have more tabs than fit the window,
  while the village view keeps its full width, so no session pushes the 3D scene
  off-screen.

## Keyboard shortcuts

- `Esc` - close the bubble drawer, any open modal, or the settings pane.
- `Cmd+,` - open settings.
- `Cmd+W` - close the current tab.
- `Cmd+Option+I` - toggle DevTools (renderer).
