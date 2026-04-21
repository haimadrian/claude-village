import { describe, it, expect } from "vitest";
import { buildAgentLabels, labelFor } from "../../src/renderer/village/agentLabels";
import type { AgentState } from "../../src/shared/types";

const agent = (id: string, kind: "main" | "subagent"): AgentState => ({
  id,
  kind,
  currentZone: "tavern",
  targetZone: "tavern",
  animation: "idle",
  recentActions: [],
  skinColor: "#abcdef"
});

describe("buildAgentLabels", () => {
  it("labels the main agent as 'Mayor' regardless of position in the iterable", () => {
    const agents = [
      agent("sub-a", "subagent"),
      agent("main-1", "main"),
      agent("sub-b", "subagent")
    ];
    const labels = buildAgentLabels(agents);
    expect(labels.get("main-1")).toBe("Mayor");
  });

  it("numbers subagents by insertion order starting from 1", () => {
    const agents = [
      agent("main-1", "main"),
      agent("sub-first", "subagent"),
      agent("sub-second", "subagent"),
      agent("sub-third", "subagent")
    ];
    const labels = buildAgentLabels(agents);
    expect(labels.get("sub-first")).toBe("Agent 1");
    expect(labels.get("sub-second")).toBe("Agent 2");
    expect(labels.get("sub-third")).toBe("Agent 3");
  });

  it("is stable: same input order produces the same labels every call", () => {
    const agents = [agent("main", "main"), agent("sub-a", "subagent"), agent("sub-b", "subagent")];
    const first = buildAgentLabels(agents);
    const second = buildAgentLabels(agents);
    expect(Array.from(first.entries())).toEqual(Array.from(second.entries()));
  });

  it("handles a sessions with no main agent (subagents only)", () => {
    const agents = [agent("sub-a", "subagent"), agent("sub-b", "subagent")];
    const labels = buildAgentLabels(agents);
    expect(labels.get("sub-a")).toBe("Agent 1");
    expect(labels.get("sub-b")).toBe("Agent 2");
  });

  it("handles an empty iterable", () => {
    const labels = buildAgentLabels([]);
    expect(labels.size).toBe(0);
  });
});

describe("labelFor", () => {
  it("returns the mapped label when present", () => {
    const labels = new Map([
      ["m-1", "Mayor"],
      ["s-1", "Agent 1"]
    ]);
    expect(labelFor(labels, agent("m-1", "main"))).toBe("Mayor");
    expect(labelFor(labels, agent("s-1", "subagent"))).toBe("Agent 1");
  });

  it("falls back to a readable default when the id is missing from the map", () => {
    const labels = new Map<string, string>();
    expect(labelFor(labels, agent("missing-main", "main"))).toBe("Mayor");
    expect(labelFor(labels, agent("missing-sub", "subagent"))).toBe("Agent");
  });
});
