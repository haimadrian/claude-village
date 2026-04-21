# claude-village

A macOS desktop app that visualises your running Claude Code sessions as an animated Minecraft-style voxel village. Each session is a tab, each agent is a character that walks between themed zones based on the tool it is using right now.

- **Project site:** https://haimadrian.github.io/claude-village/
- **Source:** https://github.com/haimadrian/claude-village
- **Releases (`.dmg`):** https://github.com/haimadrian/claude-village/releases

## What is this?

Watching the village gives you a spatial, ambient sense of what Claude is doing without having to stare at a scrolling terminal. The mayor (main agent) and villagers (subagents spawned via `Task`) each walk to one of nine themed zones as they work:

- `Write` / `Edit` land at the Office.
- `Read` sends them to the Library.
- `Grep` / `Glob` route to the Mine.
- `Bash` goes to the Forest.
- Test runners go to the Farm.
- `git` + `gh` commands head to the Nether portal.
- `WebFetch` / `WebSearch` / MCP tools stand at the Signpost.
- `Task` / `Agent` dispatches go to the Spawner (and a subagent character spawns beside the mayor).
- Idle agents and retired subagents drift to the Tavern.

## How do events reach the village?

Two parallel ingress paths, either or both can run:

1. **JSONL tailing** (default, zero-install). A chokidar watcher on `~/.claude/projects/**/*.jsonl` translates each transcript line into an `AgentEvent`. When a line is an `assistant` turn that invokes `Task`, the normaliser also synthesises a `subagent-start` so the dispatched subagent shows up as its own character.
2. **Hook server** (opt-in, lower latency). Claude Code POSTs `PreToolUse` / `PostToolUse` / `SessionStart` / `Stop` / `SubagentStart` to `http://127.0.0.1:49251/event`. The Settings dialog has **Install hook** and **Uninstall hook** buttons that merge the entries into `~/.claude/settings.json` non-destructively.

## Pages in this Wiki

- [[Installation]]
- [[Usage]]
- [[Camera and Controls|Camera-and-Controls]]
- [[Zones]]
- [[Hooks and JSONL ingress|Hooks-and-JSONL]]
- [[Architecture]]
- [[Development]]
- [[Troubleshooting]]

## Quick start

1. Grab the latest `claude-village-<version>-arm64.dmg` from the releases page.
2. Drag `claude-village.app` into `/Applications` and clear Gatekeeper: `xattr -d com.apple.quarantine /Applications/claude-village.app`.
3. Launch the app; open a Claude Code session in any terminal; watch it appear in the sidebar within a second.

Full details on [[Installation]].
