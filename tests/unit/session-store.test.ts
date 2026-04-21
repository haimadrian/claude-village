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
