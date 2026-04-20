import { app, BrowserWindow } from "electron";
import path from "node:path";
import os from "node:os";
import { SessionWatcher } from "./session-watcher";
import { HookServer } from "./hook-server";
import { SessionStore } from "./session-store";
import { wireIpc } from "./ipc-bridge";

// Respect the same override Claude Code itself uses so power users with a
// non-default config dir still see their sessions. Falls back to the
// platform-standard `~/.claude/projects` location.
const watchRoot = process.env.CLAUDE_CONFIG_DIR
  ? path.join(process.env.CLAUDE_CONFIG_DIR, "projects")
  : path.join(os.homedir(), ".claude", "projects");

const store = new SessionStore(path.join(app.getPath("userData"), "village.db"));
const watcher = new SessionWatcher(watchRoot);
const hookServer = new HookServer();

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "claude-village",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  wireIpc({ window: win, store, watcher, hookServer });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  await watcher.start();
  await hookServer.start(49251);
  await createWindow();
});

app.on("before-quit", async () => {
  await watcher.stop();
  await hookServer.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
