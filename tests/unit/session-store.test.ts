import { describe, it, expect, beforeEach } from "vitest";
import { SessionStore } from "../../src/main/session-store";
import type { AgentEvent } from "../../src/shared/types";

const ev = (e: Partial<AgentEvent>): AgentEvent =>
  ({
    sessionId: "s1",
    agentId: "a1",
    kind: "main",
    timestamp: Date.now(),
    type: "pre-tool-use",
    ...e
  }) as AgentEvent;

describe("SessionStore", () => {
  let store: SessionStore;
  beforeEach(() => {
    store = new SessionStore(":memory:");
  });

  it("creates a session on session-start", () => {
    store.apply(ev({ type: "session-start" }));
    const s = store.getSession("s1");
    expect(s?.status).toBe("active");
    expect(s?.agents.size).toBe(1);
  });

  it("moves main agent to correct zone on pre-tool-use", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/x.ts" }));
    const agent = store.getSession("s1")?.agents.get("a1");
    expect(agent?.targetZone).toBe("library");
  });

  it("creates subagent on subagent-start", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(
      ev({
        agentId: "sub-1",
        kind: "subagent",
        parentAgentId: "a1",
        type: "subagent-start"
      })
    );
    expect(store.getSession("s1")?.agents.size).toBe(2);
    expect(store.getSession("s1")?.agents.get("sub-1")?.kind).toBe("subagent");
  });

  it("marks subagent as ghost on subagent-end", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(
      ev({
        agentId: "sub-1",
        kind: "subagent",
        parentAgentId: "a1",
        type: "subagent-start"
      })
    );
    store.apply(ev({ agentId: "sub-1", kind: "subagent", type: "subagent-end" }));
    const sub = store.getSession("s1")?.agents.get("sub-1");
    expect(sub?.animation).toBe("ghost");
    expect(sub?.ghostExpiresAt).toBeGreaterThan(Date.now());
  });

  it("ends session on session-end", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "session-end" }));
    expect(store.getSession("s1")?.status).toBe("ended");
  });

  it("emits a diff on every apply", () => {
    let diffs = 0;
    store.on("patch", () => diffs++);
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "pre-tool-use", toolName: "Read" }));
    expect(diffs).toBe(2);
  });

  it("expires ghosts past their timer", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(
      ev({
        agentId: "sub-1",
        kind: "subagent",
        parentAgentId: "a1",
        type: "subagent-start"
      })
    );
    store.apply(
      ev({
        agentId: "sub-1",
        kind: "subagent",
        type: "subagent-end",
        timestamp: Date.now() - 10 * 60 * 1000
      })
    );
    // simulate time passing
    store.expireGhosts(Date.now());
    expect(store.getSession("s1")?.agents.get("sub-1")).toBeUndefined();
  });
});
