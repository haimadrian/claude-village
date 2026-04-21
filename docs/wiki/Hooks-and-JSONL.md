# Hooks and JSONL ingress

claude-village has two parallel event ingress paths. Either or both can run; the session store deduplicates by session id and agent id.

## JSONL tailing (default)

A `chokidar` watcher on `~/.claude/projects/**/*.jsonl` detects new files, appends, and truncations. Each new line is parsed and translated into one or more `AgentEvent`s by `src/main/event-normalizer.ts`.

Supported JSONL payload types:

- `user` -> `user-message`
- `assistant` with a `tool_use` block -> `pre-tool-use` (+ a synthetic `subagent-start` when the tool is `Task` or `Agent`, keyed by the tool_use id)
- `assistant` without a tool_use -> `assistant-message`
- `tool_result` / `user-tool-result` -> `post-tool-use` (+ a speculative `subagent-end` when the event carries a tool_use_id; the store ignores the end if no matching subagent exists)
- `custom-title` / `summary` -> `session-title` (used for sidebar and tab labels)
- Anything else - logged once at INFO level and then silently dropped.

`CLAUDE_CONFIG_DIR` overrides the root path the same way Claude Code itself does.

## Hook server (opt-in)

`src/main/hook-server.ts` binds `127.0.0.1:49251` and accepts POST `/event` with Claude Code hook payloads. The port is pinned so that the `~/.claude/settings.json` snippet stays valid forever; if the port is busy at startup the app shows a dialog and quits with code 1 rather than running in a degraded state.

Payload -> event mapping:

| `hook_event_name` | Emitted events                                                               |
| ----------------- | ---------------------------------------------------------------------------- |
| `SessionStart`    | `session-start`                                                              |
| `SubagentStart`   | `subagent-start`                                                             |
| `PreToolUse`      | `pre-tool-use` (+ synthetic `subagent-start` on `Task` / `Agent`)             |
| `PostToolUse`     | `post-tool-use` (+ synthetic `subagent-end` on `Task` / `Agent`)              |
| `Stop`            | `session-end` for the main agent, `subagent-end` when `agent_id` is present  |

Tests override the port via `CV_HOOK_PORT`. The e2e suite picks an ephemeral free port per `beforeAll` via `pickFreePort()` so parallel runs never collide on port 49251.

## Install the hook from the app

The **Install hook** button in the Settings dialog merges these entries into `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json`) after showing a side-by-side before / after diff:

```jsonc
"hooks": {
  "PreToolUse":    [ {"matcher": ".*", "hooks": [ {"type": "command", "command": "curl --max-time 2 --data-binary @- http://127.0.0.1:49251/event 2>/dev/null || true"} ] } ],
  "PostToolUse":   [ {"matcher": ".*", "hooks": [ {"type": "command", "command": "curl --max-time 2 --data-binary @- http://127.0.0.1:49251/event 2>/dev/null || true"} ] } ],
  "SessionStart":  [ {"matcher": ".*", "hooks": [ {"type": "command", "command": "curl --max-time 2 --data-binary @- http://127.0.0.1:49251/event 2>/dev/null || true"} ] } ],
  "SubagentStart": [ {"matcher": ".*", "hooks": [ {"type": "command", "command": "curl --max-time 2 --data-binary @- http://127.0.0.1:49251/event 2>/dev/null || true"} ] } ],
  "Stop":          [ {"matcher": ".*", "hooks": [ {"type": "command", "command": "curl --max-time 2 --data-binary @- http://127.0.0.1:49251/event 2>/dev/null || true"} ] } ]
}
```

Details:

- `.*` matcher catches every tool.
- `--data-binary @-` reads the hook payload from stdin (Claude Code writes to stdin, not env).
- `--max-time 2` + `2>/dev/null || true` makes the hook a silent no-op when claude-village is not running.
- Existing user hooks are preserved; our entries are identified by the presence of `127.0.0.1:49251` in the command.
- Uninstall is idempotent and only removes entries targeting that port.

Atomic write: the installer writes to a temp file in the same directory and renames on success, so a crash mid-write leaves your settings file untouched.

## Which path should I use?

- **JSONL only** - simpler, zero-install. You will see tool events land a bit after they actually happened (Claude Code batches transcript writes).
- **Hook server** - lower latency, richer events, explicit `SessionStart` / `Stop` signals. Requires a one-time install of the snippet.
- **Both** - fine. The store dedupes, and the hook server fills in explicit boundaries that the transcript does not carry.
