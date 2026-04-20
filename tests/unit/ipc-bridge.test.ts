import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";

// Electron is a native module not available under vitest. Stub it with just
// the surface ipc-bridge touches (`ipcMain.handle` / `removeHandler` and a
// BrowserWindow shape), keyed by channel so tests can invoke handlers.
const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
      ipcHandlers.delete(channel);
    }
  }
}));

import { wireIpc } from "../../src/main/ipc-bridge";
import { SessionStore, type SessionPatch } from "../../src/main/session-store";
import type { AgentEvent } from "../../src/shared/types";

interface FakeWindow {
  isDestroyed: () => boolean;
  webContents: { send: (channel: string, payload: unknown) => void };
}

function fakeWindow(): { win: FakeWindow; sent: Array<{ channel: string; payload: unknown }>; destroy: () => void } {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  let destroyed = false;
  return {
    sent,
    destroy: () => {
      destroyed = true;
    },
    win: {
      isDestroyed: () => destroyed,
      webContents: {
        send: (channel, payload) => sent.push({ channel, payload })
      }
    }
  };
}

const ev = (e: Partial<AgentEvent>): AgentEvent =>
  ({
    sessionId: "s1",
    agentId: "a1",
    kind: "main",
    timestamp: Date.now(),
    type: "pre-tool-use",
    ...e
  }) as AgentEvent;

describe("wireIpc", () => {
  let store: SessionStore;
  let watcher: EventEmitter;
  let hookServer: EventEmitter;
  let dispose: () => void;

  beforeEach(() => {
    ipcHandlers.clear();
    store = new SessionStore(":memory:");
    watcher = new EventEmitter();
    hookServer = new EventEmitter();
  });

  afterEach(() => {
    dispose?.();
  });

  it("forwards non-empty session patches to the renderer and applies watcher + hook events into the store", () => {
    const { win, sent } = fakeWindow();
    dispose = wireIpc({
      window: win as unknown as Parameters<typeof wireIpc>[0]["window"],
      store,
      watcher: watcher as unknown as Parameters<typeof wireIpc>[0]["watcher"],
      hookServer: hookServer as unknown as Parameters<typeof wireIpc>[0]["hookServer"]
    }).dispose;

    watcher.emit("event", ev({ type: "session-start" }));
    hookServer.emit("event", ev({ type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/x.ts" }));

    expect(sent.length).toBe(2);
    expect(sent[0]?.channel).toBe("session:patch");
    const firstPatch = sent[0]?.payload as SessionPatch;
    expect(firstPatch.sessionId).toBe("s1");
    expect(firstPatch.changes.length).toBeGreaterThan(0);
    expect(store.getSession("s1")?.agents.get("a1")?.targetZone).toBe("library");
  });

  it("drops empty-change patches so the renderer never sees a no-op", () => {
    const { win, sent } = fakeWindow();
    dispose = wireIpc({
      window: win as unknown as Parameters<typeof wireIpc>[0]["window"],
      store,
      watcher: watcher as unknown as Parameters<typeof wireIpc>[0]["watcher"],
      hookServer: hookServer as unknown as Parameters<typeof wireIpc>[0]["hookServer"]
    }).dispose;

    // Synthesise an empty-change patch directly from the store's emitter to
    // prove the filter fires regardless of how the patch was produced.
    store.emit("patch", { sessionId: "s1", changes: [] } satisfies SessionPatch);

    expect(sent.length).toBe(0);
  });

  it("skips sends after the window is destroyed", () => {
    const { win, sent, destroy } = fakeWindow();
    dispose = wireIpc({
      window: win as unknown as Parameters<typeof wireIpc>[0]["window"],
      store,
      watcher: watcher as unknown as Parameters<typeof wireIpc>[0]["watcher"],
      hookServer: hookServer as unknown as Parameters<typeof wireIpc>[0]["hookServer"]
    }).dispose;

    destroy();
    watcher.emit("event", ev({ type: "session-start" }));
    expect(sent.length).toBe(0);
  });

  it("registers sessions:list / session:get / pin / unpin handlers that serialize agents as arrays", async () => {
    const { win } = fakeWindow();
    dispose = wireIpc({
      window: win as unknown as Parameters<typeof wireIpc>[0]["window"],
      store,
      watcher: watcher as unknown as Parameters<typeof wireIpc>[0]["watcher"],
      hookServer: hookServer as unknown as Parameters<typeof wireIpc>[0]["hookServer"]
    }).dispose;

    watcher.emit("event", ev({ type: "session-start" }));

    const list = (await ipcHandlers.get("sessions:list")!()) as Array<{ sessionId: string; agents: unknown[] }>;
    expect(list.length).toBe(1);
    expect(list[0]?.sessionId).toBe("s1");
    expect(Array.isArray(list[0]?.agents)).toBe(true);
    expect(list[0]?.agents.length).toBe(1);

    const got = (await ipcHandlers.get("session:get")!({}, "s1")) as { agents: unknown[] } | null;
    expect(got).not.toBeNull();
    expect(Array.isArray(got?.agents)).toBe(true);

    const missing = await ipcHandlers.get("session:get")!({}, "nope");
    expect(missing).toBeNull();

    await ipcHandlers.get("session:pin")!({}, "s1");
    expect(store.isPinned("s1")).toBe(true);
    await ipcHandlers.get("session:unpin")!({}, "s1");
    expect(store.isPinned("s1")).toBe(false);
  });

  it("dispose() unregisters handlers and detaches listeners so the bridge can be rewired", () => {
    const { win, sent } = fakeWindow();
    const wiring = wireIpc({
      window: win as unknown as Parameters<typeof wireIpc>[0]["window"],
      store,
      watcher: watcher as unknown as Parameters<typeof wireIpc>[0]["watcher"],
      hookServer: hookServer as unknown as Parameters<typeof wireIpc>[0]["hookServer"]
    });

    wiring.dispose();

    expect(ipcHandlers.size).toBe(0);
    watcher.emit("event", ev({ type: "session-start" }));
    expect(sent.length).toBe(0);
    // The store must be untouched by a post-dispose event since the listener
    // was removed. No session means no session was created.
    expect(store.getSession("s1")).toBeUndefined();

    dispose = () => undefined;
  });
});
