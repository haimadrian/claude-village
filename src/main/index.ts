import { app, BrowserWindow, Menu, dialog } from "electron";
import path from "node:path";
import os from "node:os";
import { SessionWatcher } from "./session-watcher";
import { HookServer } from "./hook-server";
import { SessionStore } from "./session-store";
import { wireIpc } from "./ipc-bridge";
import { logger } from "./logger";
import { readUserSettings } from "./user-settings";

// Respect the same override Claude Code itself uses so power users with a
// non-default config dir still see their sessions. Falls back to the
// platform-standard `~/.claude/projects` location.
const watchRoot = process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, "projects")
  : path.join(os.homedir(), ".claude", "projects");

const store = new SessionStore(path.join(app.getPath("userData"), "pinned.json"));
const watcher = new SessionWatcher(watchRoot);
const hookServer = new HookServer();
// Persistent user prefs (currently just the ghost idle timer). Sits next to
// pinned.json in the app's userData dir. Path is cached here so `createWindow`
// and the IPC handlers share the exact same file.
const userSettingsPath = path.join(app.getPath("userData"), "user-settings.json");

// Holds the active bridge wiring so we can tear it down before re-wiring on
// macOS dock-icon re-activation. Without this, the second `createWindow` call
// re-registers `ipcMain.handle` for the same channels and Electron throws
// "Attempted to register a second handler for ...".
let bridge: { dispose: () => void } | null = null;

process.on("uncaughtException", (err) => {
  logger.error("uncaughtException in main process", {
    message: err.message,
    stack: err.stack
  });
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("unhandledRejection in main process", {
    message: err.message,
    stack: err.stack
  });
});

async function createWindow(): Promise<void> {
  // E2E specs set CV_HIDDEN_WINDOW=1 so the test-spawned Electron does not
  // steal focus, flash on screen, or show a dock icon while Playwright
  // drives it. The renderer and WebGL keep running - Playwright reads the
  // DOM and the hook server through the normal channels.
  const hidden = process.env.CV_HIDDEN_WINDOW === "1";
  logger.info("creating main window", { hidden });
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "claude-village",
    show: !hidden,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Ensure animations keep ticking even when the window is hidden (we
      // rely on that during e2e screenshots / pixel sampling).
      backgroundThrottling: false
    }
  });

  bridge?.dispose();
  bridge = wireIpc({ window: win, store, watcher, hookServer, userSettingsPath });
  win.on("closed", () => {
    logger.info("main window closed");
    bridge?.dispose();
    bridge = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  win.webContents.on("preload-error", (_e, preloadPath, error) => {
    logger.error("preload failed to load", {
      preloadPath,
      message: error.message,
      stack: error.stack
    });
  });
  win.webContents.on(
    "did-fail-load",
    (_e, errorCode: number, errorDescription: string, validatedURL: string) => {
      logger.error("renderer failed to load", { errorCode, errorDescription, validatedURL });
    }
  );
  win.webContents.on("render-process-gone", (_e, details) => {
    logger.error("renderer process gone", { details });
  });
  if (process.env.CV_DEBUG === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(async () => {
  logger.info("app ready", { watchRoot, userData: app.getPath("userData") });
  // Seed the live store from the user's persisted ghost-retirement timer.
  // Missing / malformed file silently falls back to the default (see
  // `readUserSettings`); a read failure must never block startup.
  try {
    const prefs = await readUserSettings(userSettingsPath);
    store.setIdleBeforeGhostMs(prefs.idleBeforeGhostMinutes * 60_000);
    logger.info("user-settings loaded", {
      userSettingsPath,
      idleBeforeGhostMinutes: prefs.idleBeforeGhostMinutes
    });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.warn("user-settings load failed; continuing with defaults", {
      userSettingsPath,
      message: e.message
    });
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "claude-village",
      submenu: [
        {
          label: "About claude-village...",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            win?.webContents.send("menu:about");
          }
        },
        { type: "separator" },
        { role: "quit" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  await watcher.start();
  try {
    // Hook server is pinned to port 49251 so the `~/.claude/settings.json`
    // snippet never needs to change. If the port is busy it is almost always
    // a second copy of claude-village already running, so surface a clear
    // dialog and quit rather than silently running in a degraded mode or
    // picking a different port that would break the hook config.
    //
    // Tests override via `CV_HOOK_PORT=0` to bind a random port so e2e runs
    // don't collide with a developer's live app.
    const hookPort = process.env.CV_HOOK_PORT ? Number(process.env.CV_HOOK_PORT) : 49251;
    await hookServer.start(hookPort);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error("HookServer failed to bind on port 49251; quitting", {
      message: e.message
    });
    dialog.showErrorBox(
      "claude-village: port 49251 in use",
      "Another process is already listening on 127.0.0.1:49251. This is almost always another claude-village instance - quit it and relaunch.\n\nTechnical detail: " +
        e.message
    );
    app.exit(1);
    return;
  }
  await createWindow();
});

app.on("before-quit", async () => {
  logger.info("before-quit: shutting down watcher and hook server");
  await watcher.stop();
  await hookServer.stop();
});

app.on("window-all-closed", () => {
  // Deviation from the Electron macOS default (keep running on darwin so the
  // dock icon can reopen a window): claude-village has no useful background
  // behaviour without a window, so closing the window should terminate the
  // process. `before-quit` above stops the watcher and hook server cleanly.
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
