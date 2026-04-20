import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import os from "node:os";
import { SessionWatcher } from "./session-watcher";
import { HookServer } from "./hook-server";
import { SessionStore } from "./session-store";
import { wireIpc } from "./ipc-bridge";
import { logger } from "./logger";

// Respect the same override Claude Code itself uses so power users with a
// non-default config dir still see their sessions. Falls back to the
// platform-standard `~/.claude/projects` location.
const watchRoot = process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, "projects")
  : path.join(os.homedir(), ".claude", "projects");

const store = new SessionStore(path.join(app.getPath("userData"), "pinned.json"));
const watcher = new SessionWatcher(watchRoot);
const hookServer = new HookServer();

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
  logger.info("creating main window");
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "claude-village",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  bridge?.dispose();
  bridge = wireIpc({ window: win, store, watcher, hookServer });
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
  await hookServer.start(49251);
  await createWindow();
});

app.on("before-quit", async () => {
  logger.info("before-quit: shutting down watcher and hook server");
  await watcher.stop();
  await hookServer.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
