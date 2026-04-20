# Installing claude-village

claude-village ships as an unsigned DMG for macOS (Apple Silicon, arm64). Windows and
Linux are not supported in v1.

## Download

1. Open the [GitHub releases page](https://github.com/haimadrian/claude-village/releases).
2. Grab the latest `claude-village-<version>-arm64.dmg` asset.

## Install

1. Double-click the downloaded DMG to mount it.
2. Drag `claude-village.app` from the mounted volume into your `/Applications` folder.
3. Eject the DMG.

## First launch

Because the build is not yet code-signed or notarized, macOS Gatekeeper will refuse to
open it on the first try ("claude-village is damaged and can't be opened" or "cannot be
opened because the developer cannot be verified"). Clear the quarantine attribute from
Terminal:

```bash
xattr -d com.apple.quarantine /Applications/claude-village.app
```

Then launch the app from Launchpad or the Applications folder. You should see the main
window open with an empty sidebar. Start (or continue) a Claude Code session in any
terminal. The watcher tails `~/.claude/projects/**/*.jsonl`, so within a second or two
the new session appears in the sidebar and a tab opens with the village view.

## Troubleshooting

### "App is damaged and can't be opened"

Run the `xattr` command above. macOS flags any file downloaded from the internet with a
quarantine bit; because the DMG is unsigned, that bit turns into a hard block instead of
the usual "are you sure?" prompt.

### "No sessions found"

The watcher only sees sessions recorded under `~/.claude/projects/`. Confirm the
directory exists and contains JSONL files:

```bash
ls ~/.claude/projects/
```

If you use a non-default Claude Code config location, export `CLAUDE_CONFIG_DIR` before
launching the app:

```bash
export CLAUDE_CONFIG_DIR=/path/to/your/claude-config
open /Applications/claude-village.app
```

### "Nothing is happening"

Logs for the main process live at:

```
~/Library/Application Support/claude-village/logs/main.log
```

Renderer logs are visible via `View -> Toggle Developer Tools` (Cmd+Option+I).

## Uninstalling

1. Quit the app (Cmd+Q).
2. Drag `claude-village.app` from `/Applications` to the Trash.
3. Optionally remove its support directory:

   ```bash
   rm -rf ~/Library/Application\ Support/claude-village
   ```

Proper code signing and notarization will land in a future release; once that ships, the
Gatekeeper workaround will no longer be needed.
