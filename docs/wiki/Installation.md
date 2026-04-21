# Installation

claude-village ships as an unsigned DMG for macOS (Apple Silicon, arm64). Windows and Linux are not supported yet; Electron makes it cheap to add later.

## Download

1. Open the [releases page](https://github.com/haimadrian/claude-village/releases).
2. Grab the latest `claude-village-<version>-arm64.dmg`.

## Install

1. Double-click the DMG to mount it.
2. Drag `claude-village.app` into `/Applications`.
3. Eject the DMG.

## First launch

The build is not yet code-signed or notarised, so macOS Gatekeeper will refuse to open it on the first try ("claude-village is damaged and can't be opened" or "cannot be opened because the developer cannot be verified"). Clear the quarantine attribute from Terminal:

```bash
xattr -d com.apple.quarantine /Applications/claude-village.app
```

Then launch from Launchpad or the Applications folder. You should see the main window open with an empty sidebar. Start or continue a Claude Code session in any terminal. The watcher tails `~/.claude/projects/**/*.jsonl`, so within a second or two the new session appears in the sidebar and a tab opens with the village view.

## Optional: install the hook server

The JSONL watcher is always on. The hook server gives you faster, richer events (`PreToolUse` / `PostToolUse` / `SubagentStart` / `Stop`). To install:

1. Open claude-village.
2. Click the gear icon in the sidebar footer.
3. In the Settings dialog, click **Install hook**. You will see a side-by-side before / after diff of `~/.claude/settings.json`; confirm to apply.
4. Restart Claude Code so it picks up the new hook config.

The installer preserves any existing user hooks and is idempotent. Remove the entries later with **Uninstall hook**; it only removes entries that point at port 49251.

## Troubleshooting

See [[Troubleshooting]] for common issues (blank window, no sessions, non-default Claude config dir, port 49251 in use).

## Uninstall

1. Quit the app (Cmd+Q).
2. Drag `claude-village.app` from `/Applications` to the Trash.
3. Optionally remove the support directory:

   ```bash
   rm -rf ~/Library/Application\ Support/claude-village
   ```
