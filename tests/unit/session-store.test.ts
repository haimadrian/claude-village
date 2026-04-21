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

  it("advances currentZone in step with targetZone on pre-tool-use", () => {
    // Regression: before this fix, `currentZone` was initialised to "tavern"
    // and never updated, which made the renderer snap agents back to the
    // Tavern on every re-render. The store must keep both zones in sync so
    // camera focus and re-mounts reflect where the agent is actually working.
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "pre-tool-use", toolName: "Edit", toolArgsSummary: "/x.ts" }));
    const agent = store.getSession("s1")?.agents.get("a1");
    expect(agent?.currentZone).toBe("office");
    expect(agent?.targetZone).toBe("office");
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

  it("reopens an ended session when new activity arrives", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "session-end" }));
    expect(store.getSession("s1")?.status).toBe("ended");

    const captured: string[] = [];
    store.on("patch", (p) => {
      for (const c of p.changes) {
        if (c.kind === "session-upsert") captured.push(c.session.status);
      }
    });

    store.apply(ev({ type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/x.ts" }));

    expect(store.getSession("s1")?.status).toBe("active");
    // The renderer must see the status flip via a session-upsert patch;
    // without one, the sidebar and tab status line would stay "ended".
    expect(captured).toContain("active");
  });

  it("does not end the parent session when a subagent ends", () => {
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
    const session = store.getSession("s1");
    expect(session?.status).toBe("active");
  });

  it("does not reopen on session-title after session-end", () => {
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "session-end" }));
    store.apply(ev({ type: "session-title", sessionTitle: "Older title" }));
    expect(store.getSession("s1")?.status).toBe("ended");
  });

  it("emits a diff on every apply", () => {
    let diffs = 0;
    store.on("patch", () => diffs++);
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "pre-tool-use", toolName: "Read" }));
    expect(diffs).toBe(2);
  });

  it("stores session title from session-title events without bumping lastActivityAt", () => {
    const startedTs = Date.now() - 60 * 60 * 1000;
    store.apply(ev({ type: "session-start", timestamp: startedTs }));
    const before = store.getSession("s1")!;
    const lastBefore = before.lastActivityAt;

    let captured: string | undefined;
    store.on("patch", (p) => {
      for (const c of p.changes) {
        if (c.kind === "session-upsert" && c.session.title !== undefined) {
          captured = c.session.title;
        }
      }
    });

    store.apply(
      ev({
        type: "session-title",
        sessionTitle: "Refactoring hook server",
        timestamp: Date.now()
      })
    );

    const after = store.getSession("s1")!;
    expect(after.title).toBe("Refactoring hook server");
    // session-title must not count as activity.
    expect(after.lastActivityAt).toBe(lastBefore);
    // Patch should carry the title so the renderer can display it.
    expect(captured).toBe("Refactoring hook server");
  });

  it("post-tool-use with empty resultSummary does not overwrite previous bubble with empty", () => {
    // Regression: the speech bubble would briefly clear/flicker when a tool
    // result carried no textual summary. The classifier now substitutes
    // "Done" so the bubble always stays readable.
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/x.ts" }));
    const readAction = store.getSession("s1")?.agents.get("a1")?.recentActions.at(-1)?.summary;
    expect(readAction).toContain("/x.ts");

    store.apply(ev({ type: "post-tool-use", toolName: "Read", resultSummary: "" }));
    const latest = store.getSession("s1")?.agents.get("a1")?.recentActions.at(-1)?.summary ?? "";
    // Must be non-empty: either the fallback "Done" or the previous Read action.
    expect(latest.length).toBeGreaterThan(0);
    expect(latest).not.toBe("->");
  });

  it("post-tool-use with arrow-only resultSummary does not replace a readable bubble", () => {
    // Simulates terse tool output like `->` leaking through the normalizer.
    // The previous bubble ("Read /x.ts") must stay visible; the arrow must
    // never become the last recentAction.
    store.apply(ev({ type: "session-start" }));
    store.apply(ev({ type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/x.ts" }));
    store.apply(ev({ type: "post-tool-use", toolName: "Read", resultSummary: "->" }));
    const actions = store.getSession("s1")?.agents.get("a1")?.recentActions ?? [];
    const last = actions.at(-1)?.summary ?? "";
    expect(last).not.toBe("");
    expect(last).not.toBe("->");
    // Every stored summary must be readable - no arrow-only entries.
    for (const a of actions) {
      expect(a.summary.trim()).not.toMatch(/^[-<>._\s]+$/);
    }
  });

  describe("waitingForInput", () => {
    it("sets waitingForInput=true on the mayor after an assistant-message", () => {
      store.apply(ev({ type: "session-start" }));
      store.apply(ev({ type: "assistant-message", messageExcerpt: "thinking out loud" }));
      const agent = store.getSession("s1")?.agents.get("a1");
      expect(agent?.waitingForInput).toBe(true);
    });

    it("clears waitingForInput when a pre-tool-use arrives", () => {
      store.apply(ev({ type: "session-start" }));
      store.apply(ev({ type: "assistant-message", messageExcerpt: "pondering" }));
      expect(store.getSession("s1")?.agents.get("a1")?.waitingForInput).toBe(true);
      store.apply(ev({ type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/x.ts" }));
      expect(store.getSession("s1")?.agents.get("a1")?.waitingForInput).toBe(false);
    });

    it("clears waitingForInput when a user-message arrives", () => {
      store.apply(ev({ type: "session-start" }));
      store.apply(ev({ type: "assistant-message", messageExcerpt: "done" }));
      expect(store.getSession("s1")?.agents.get("a1")?.waitingForInput).toBe(true);
      store.apply(ev({ type: "user-message", messageExcerpt: "please continue" }));
      expect(store.getSession("s1")?.agents.get("a1")?.waitingForInput).toBe(false);
    });

    it("sets waitingForInput=true on a subagent when subagent-end arrives, then clears on follow-up pre-tool-use", () => {
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
      const sub1 = store.getSession("s1")?.agents.get("sub-1");
      expect(sub1?.waitingForInput).toBe(true);

      store.apply(
        ev({
          agentId: "sub-1",
          kind: "subagent",
          type: "pre-tool-use",
          toolName: "Read",
          toolArgsSummary: "/x.ts"
        })
      );
      const sub2 = store.getSession("s1")?.agents.get("sub-1");
      expect(sub2?.waitingForInput).toBe(false);
    });

    it("does not set waitingForInput on the mayor on session-end", () => {
      store.apply(ev({ type: "session-start" }));
      store.apply(ev({ type: "session-end" }));
      const agent = store.getSession("s1")?.agents.get("a1");
      // The session is over, not waiting. `waitingForInput` must stay falsy
      // (either undefined or explicit false - never true).
      expect(agent?.waitingForInput ?? false).toBe(false);
    });

    it("emits an agent-upsert patch when waitingForInput changes", () => {
      store.apply(ev({ type: "session-start" }));

      const patches: Array<boolean | undefined> = [];
      store.on("patch", (p) => {
        for (const c of p.changes) {
          if (c.kind === "agent-upsert" && c.agent.id === "a1") {
            patches.push(c.agent.waitingForInput);
          }
        }
      });

      store.apply(ev({ type: "assistant-message", messageExcerpt: "hi" }));
      store.apply(ev({ type: "user-message", messageExcerpt: "reply" }));

      // First patch carries waitingForInput=true, second clears it to false.
      expect(patches).toEqual([true, false]);
    });
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
    // subagent-end schedules despawn 1h in the future from the event timestamp,
    // so we end it 90 minutes ago to guarantee expireGhosts(now) clears it.
    store.apply(
      ev({
        agentId: "sub-1",
        kind: "subagent",
        type: "subagent-end",
        timestamp: Date.now() - 90 * 60 * 1000
      })
    );
    store.expireGhosts(Date.now());
    expect(store.getSession("s1")?.agents.get("sub-1")).toBeUndefined();
  });

  describe("ghost retirement (idle -> ghost -> removed)", () => {
    it("schedules subagent despawn 1 hour out on subagent-end (not 3 minutes)", () => {
      const now = Date.now();
      store.apply(ev({ type: "session-start", timestamp: now }));
      store.apply(
        ev({
          agentId: "sub-1",
          kind: "subagent",
          parentAgentId: "a1",
          type: "subagent-start",
          timestamp: now
        })
      );
      store.apply(ev({ agentId: "sub-1", kind: "subagent", type: "subagent-end", timestamp: now }));
      const sub = store.getSession("s1")?.agents.get("sub-1");
      // 1h = 60 * 60 * 1000 ms. Tolerate a tiny schedule skew but reject any
      // value that falls inside the old 3-minute window.
      const expected = now + 60 * 60 * 1000;
      expect(sub?.ghostExpiresAt).toBe(expected);
      expect(sub?.ghostExpiresAt).toBeGreaterThan(now + 59 * 60 * 1000);
    });

    it("updates lastSeenAt on the target agent for activity events", () => {
      const t0 = Date.now();
      store.apply(ev({ type: "session-start", timestamp: t0 }));
      let a = store.getSession("s1")?.agents.get("a1");
      expect(a?.lastSeenAt).toBe(t0);

      const t1 = t0 + 1000;
      store.apply(ev({ type: "pre-tool-use", toolName: "Read", timestamp: t1 }));
      a = store.getSession("s1")?.agents.get("a1");
      expect(a?.lastSeenAt).toBe(t1);

      const t2 = t1 + 2000;
      store.apply(ev({ type: "assistant-message", messageExcerpt: "hi", timestamp: t2 }));
      a = store.getSession("s1")?.agents.get("a1");
      expect(a?.lastSeenAt).toBe(t2);

      const t3 = t2 + 500;
      store.apply(ev({ type: "user-message", messageExcerpt: "yo", timestamp: t3 }));
      a = store.getSession("s1")?.agents.get("a1");
      expect(a?.lastSeenAt).toBe(t3);
    });

    it("flips a non-ghost agent to ghost after 3 minutes of silence on next expireGhosts tick", () => {
      const t0 = Date.now();
      store.apply(ev({ type: "session-start", timestamp: t0 }));
      // Simulate a tool action 4 minutes ago, then no further activity.
      const lastActivity = t0 - 4 * 60 * 1000;
      store.apply(
        ev({
          type: "pre-tool-use",
          toolName: "Read",
          toolArgsSummary: "/x.ts",
          timestamp: lastActivity
        })
      );
      const before = store.getSession("s1")?.agents.get("a1");
      expect(before?.animation).not.toBe("ghost");

      const patches: Array<{ animation: string; targetZone: string }> = [];
      store.on("patch", (p) => {
        for (const c of p.changes) {
          if (c.kind === "agent-upsert" && c.agent.id === "a1") {
            patches.push({ animation: c.agent.animation, targetZone: c.agent.targetZone });
          }
        }
      });

      store.expireGhosts(t0);

      const after = store.getSession("s1")?.agents.get("a1");
      expect(after?.animation).toBe("ghost");
      expect(after?.targetZone).toBe("tavern");
      expect(after?.ghostExpiresAt).toBe(t0 + 60 * 60 * 1000);
      // An agent-upsert patch carrying the ghost flip must reach the renderer.
      expect(patches.some((p) => p.animation === "ghost")).toBe(true);
    });

    it("removes a ghost whose ghostExpiresAt is past now with an agent-remove patch", () => {
      const t0 = Date.now();
      store.apply(ev({ type: "session-start", timestamp: t0 }));
      store.apply(
        ev({
          agentId: "sub-1",
          kind: "subagent",
          parentAgentId: "a1",
          type: "subagent-start",
          timestamp: t0
        })
      );
      // Subagent-end 90 minutes ago => ghostExpiresAt = t0 - 30min (past).
      store.apply(
        ev({
          agentId: "sub-1",
          kind: "subagent",
          type: "subagent-end",
          timestamp: t0 - 90 * 60 * 1000
        })
      );

      const removed: string[] = [];
      store.on("patch", (p) => {
        for (const c of p.changes) {
          if (c.kind === "agent-remove") removed.push(c.agentId);
        }
      });

      store.expireGhosts(t0);
      expect(store.getSession("s1")?.agents.get("sub-1")).toBeUndefined();
      expect(removed).toContain("sub-1");
    });

    it("revives a ghost when a new pre-tool-use arrives", () => {
      const t0 = Date.now();
      store.apply(ev({ type: "session-start", timestamp: t0 }));
      store.apply(
        ev({
          agentId: "sub-1",
          kind: "subagent",
          parentAgentId: "a1",
          type: "subagent-start",
          timestamp: t0
        })
      );
      store.apply(ev({ agentId: "sub-1", kind: "subagent", type: "subagent-end", timestamp: t0 }));
      const ghost = store.getSession("s1")?.agents.get("sub-1");
      expect(ghost?.animation).toBe("ghost");
      expect(ghost?.ghostExpiresAt).toBeDefined();

      const patches: Array<{ animation: string; ghostExpiresAt: number | undefined }> = [];
      store.on("patch", (p) => {
        for (const c of p.changes) {
          if (c.kind === "agent-upsert" && c.agent.id === "sub-1") {
            patches.push({
              animation: c.agent.animation,
              ghostExpiresAt: c.agent.ghostExpiresAt
            });
          }
        }
      });

      store.apply(
        ev({
          agentId: "sub-1",
          kind: "subagent",
          type: "pre-tool-use",
          toolName: "Read",
          toolArgsSummary: "/x.ts",
          timestamp: t0 + 1000
        })
      );

      const revived = store.getSession("s1")?.agents.get("sub-1");
      expect(revived?.animation).not.toBe("ghost");
      expect(revived?.ghostExpiresAt).toBeUndefined();
      // A revive must surface to the renderer so it stops rendering the fade.
      expect(patches.length).toBeGreaterThan(0);
      const last = patches.at(-1)!;
      expect(last.animation).not.toBe("ghost");
      expect(last.ghostExpiresAt).toBeUndefined();
    });

    it("session-end bumps mayor lastSeenAt so idle-to-ghost starts from Stop, not last tool", () => {
      const tStart = Date.now() - 10 * 60 * 1000;
      const tTool = tStart + 1000;
      const tEnd = tStart + 2 * 60 * 1000; // Stop at +2 min
      const tNow = tStart + 4 * 60 * 1000; // 4 min after start, 2 min after Stop
      store.apply(ev({ type: "session-start", timestamp: tStart }));
      store.apply(ev({ type: "pre-tool-use", toolName: "Read", timestamp: tTool }));
      store.apply(ev({ type: "session-end", timestamp: tEnd }));

      const mayor = store.getSession("s1")?.agents.get("a1");
      // Without the session-end bump, lastSeenAt would be tTool (old) and the
      // next expireGhosts call would flip to ghost. With the bump it stays
      // within the 3-minute idle window.
      expect(mayor?.lastSeenAt).toBe(tEnd);

      store.expireGhosts(tNow);
      const after = store.getSession("s1")?.agents.get("a1");
      expect(after?.animation).not.toBe("ghost");
    });
  });
});
