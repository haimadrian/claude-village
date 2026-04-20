import { ipcMain, type BrowserWindow } from "electron";
import type { SessionStore, SessionPatch } from "./session-store";
import type { SessionWatcher } from "./session-watcher";
import type { HookServer } from "./hook-server";
import type { AgentEvent, AgentState, SessionState } from "../shared/types";
import { logger } from "./logger";

/**
 * Serializable projection of a `SessionState` for IPC transit. The live
 * `SessionState.agents` is a `Map`, which `structuredClone` (used by Electron
 * IPC under the hood) can serialize - but the renderer consumes plain arrays,
 * so we flatten here to keep the contract explicit on both sides of the wire.
 */
type SerializedSession = Omit<SessionState, "agents"> & { agents: AgentState[] };

function serialize(session: SessionState): SerializedSession {
  return { ...session, agents: Array.from(session.agents.values()) };
}

/**
 * Wires the ingest sources (JSONL watcher + hook HTTP server) into the store,
 * forwards store patches to the renderer, and registers the request/response
 * IPC handlers the renderer calls.
 *
 * Contract with `SessionStore`:
 * - `store.apply(event)` always emits a `patch`, even when no materialised
 *   change resulted (e.g. a duplicate or ignored event type).
 *   We filter empty-change patches here so `session:patch` is only sent when
 *   the renderer has something to apply - otherwise we burn a structuredClone
 *   + IPC round trip per ingested line for nothing.
 */
export function wireIpc(opts: {
  window: BrowserWindow;
  store: SessionStore;
  watcher: SessionWatcher;
  hookServer: HookServer;
}): { dispose: () => void } {
  const { window, store, watcher, hookServer } = opts;
  logger.info("IPC bridge wiring");

  const onWatcherEvent = (e: AgentEvent): void => store.apply(e);
  const onHookEvent = (e: AgentEvent): void => store.apply(e);
  watcher.on("event", onWatcherEvent);
  hookServer.on("event", onHookEvent);

  const onPatch = (patch: SessionPatch): void => {
    if (patch.changes.length === 0) return;
    if (window.isDestroyed()) return;
    logger.debug("IPC bridge forwarding patch", {
      sessionId: patch.sessionId,
      changes: patch.changes.length
    });
    window.webContents.send("session:patch", patch);
  };
  store.on("patch", onPatch);

  ipcMain.handle("sessions:list", () => store.listSessions().map(serialize));
  ipcMain.handle("session:get", (_e, id: string) => {
    const s = store.getSession(id);
    return s ? serialize(s) : null;
  });
  ipcMain.handle("session:pin", (_e, id: string) => {
    store.pin(id);
  });
  ipcMain.handle("session:unpin", (_e, id: string) => {
    store.unpin(id);
  });

  // Ghosts expire on a 3-minute timer inside the store. We tick every 30s so
  // removal latency is bounded to ~30s worst-case, which is visually fine.
  const ghostInterval = setInterval(() => store.expireGhosts(Date.now()), 30_000);
  // Do not keep the Node event loop alive just for this timer. The window
  // lifecycle owns shutdown.
  ghostInterval.unref?.();

  return {
    dispose: () => {
      logger.info("IPC bridge disposing");
      clearInterval(ghostInterval);
      watcher.off("event", onWatcherEvent);
      hookServer.off("event", onHookEvent);
      store.off("patch", onPatch);
      ipcMain.removeHandler("sessions:list");
      ipcMain.removeHandler("session:get");
      ipcMain.removeHandler("session:pin");
      ipcMain.removeHandler("session:unpin");
    }
  };
}
