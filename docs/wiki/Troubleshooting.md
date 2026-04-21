# Troubleshooting

## Installed app

### "App is damaged and can't be opened"

macOS Gatekeeper flags any unsigned DMG download as quarantined. Clear the quarantine attribute:

```bash
xattr -d com.apple.quarantine /Applications/claude-village.app
```

### "No sessions found" in the sidebar

The watcher only sees files under `~/.claude/projects/`. Confirm the directory exists and has JSONL files:

```bash
ls ~/.claude/projects/
```

If you use a non-default Claude Code config location, export `CLAUDE_CONFIG_DIR` before launching:

```bash
export CLAUDE_CONFIG_DIR=/path/to/your/claude-config
open /Applications/claude-village.app
```

### "Port 49251 in use" dialog at startup

Another process (almost always another claude-village instance) is already listening on the loopback port. Quit the other instance and relaunch. The port is pinned so the `~/.claude/settings.json` snippet never needs updating, which is why we fail loudly rather than picking a random one.

To identify who is holding the port:

```bash
lsof -nP -iTCP:49251 -sTCP:LISTEN
```

### Nothing is happening / renderer looks blank

Logs for the main process live at:

```
~/Library/Application Support/claude-village/logs/main.log
```

Rolling 5 MB files, up to 3 retained. INFO by default, DEBUG when the app is launched with `CV_DEBUG=1` in the environment. Renderer logs live in DevTools (`View` -> `Toggle Developer Tools`, or `Cmd+Option+I`) and are also forwarded into the same main log.

### Blank window after launch

Almost always a preload load error. The preload script is emitted as CommonJS at `out/preload/index.cjs`; an old app bundle built with an ESM preload will fail to hydrate. Tail the log file to confirm, then reinstall from the latest release DMG.

### The app keeps running after I close the window

It should not. If it does, you are on a pre-2026-04-21 build - the app now calls `app.quit()` on `window-all-closed` on every platform (we explicitly drop the default macOS "stay alive" behaviour). Update to the latest release.

## Hook server

### Install hook did nothing visible

- Restart Claude Code so it re-reads `~/.claude/settings.json`.
- Confirm the hook fired at least once by watching `main.log` while triggering a tool from your terminal session.
- If you see POST requests logged but no events show up in the village, confirm the session id on the hook payload matches a session file under `~/.claude/projects/`.

### My own hooks stopped working after Install hook

That should not happen - the installer preserves existing entries and only appends ours. If it did, click **Uninstall hook** to remove our entries, then inspect the diff in your own `settings.json` to restore whatever got lost. The installer writes atomically (temp file + rename) so there should be no partial state.

## Development

### `pnpm e2e` fails with stale-build-looking symptoms

`pnpm e2e` runs Playwright against `out/` as-is. If you changed source files and did not rebuild, the test hits the old bundle. Run `pnpm e2e:full` (which calls `electron-vite build` first), or run `pnpm build` manually.

### Vitest is red but nothing obviously broke

- Run one test file to narrow: `pnpm test -- tests/unit/failing-file.test.ts`.
- Check that a previous run of the app is not still holding a file (chokidar tests in particular).
- If a test is flaky only under `--repeat-each`, allocate an ephemeral port per `beforeAll` the way `tests/e2e/multi-agent.spec.ts` does.

### ESLint flat-config plugin complaints

`@eslint/eslintrc` FlatCompat bridges `@typescript-eslint/recommended` and `eslint-plugin-react-hooks` (which still uses legacy-config shape). Do not remove the FlatCompat imports; they are load-bearing.

## Still stuck?

Open an issue with:

- The contents of `main.log` from the last minute before the problem.
- The output of `pnpm --version`, `node --version`, and `sw_vers`.
- A screen recording if it is a visual bug (tooltip, camera, rendering) - those are almost always layering or event-routing issues and a recording is worth a thousand guesses.
