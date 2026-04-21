import { describe, it, expect } from "vitest";
import {
  normalizeJsonlEvent,
  normalizeJsonlEvents
} from "../../src/main/event-normalizer";

describe("normalizeJsonlEvent", () => {
  it("produces a session-title event from a custom-title payload", () => {
    const ev = normalizeJsonlEvent(
      {
        type: "custom-title",
        sessionId: "sess-title",
        title: "Refactoring the hook server",
        timestamp: "2026-04-20T10:00:00Z"
      },
      "raw"
    );
    expect(ev).not.toBeNull();
    expect(ev?.type).toBe("session-title");
    expect(ev?.sessionTitle).toBe("Refactoring the hook server");
    expect(ev?.sessionId).toBe("sess-title");
  });

  it("produces a session-title event from a summary payload", () => {
    const ev = normalizeJsonlEvent(
      {
        type: "summary",
        sessionId: "sess-summary",
        summary: "Fixing failing unit tests",
        timestamp: "2026-04-20T10:00:00Z"
      },
      "raw"
    );
    expect(ev?.type).toBe("session-title");
    expect(ev?.sessionTitle).toBe("Fixing failing unit tests");
  });

  it("returns null for custom-title without title/summary", () => {
    const ev = normalizeJsonlEvent(
      {
        type: "custom-title",
        sessionId: "sess-x",
        timestamp: "2026-04-20T10:00:00Z"
      },
      "raw"
    );
    expect(ev).toBeNull();
  });
});

describe("normalizeJsonlEvents subagent dispatch", () => {
  it("emits parent pre-tool-use + synthetic subagent-start for a Task tool_use", () => {
    const events = normalizeJsonlEvents(
      {
        type: "assistant",
        sessionId: "sess-sub",
        timestamp: "2026-04-20T10:00:00Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "tuse_abc",
              name: "Task",
              input: { subagent_type: "explorer", prompt: "look around" }
            }
          ]
        }
      },
      "raw"
    );
    expect(events.length).toBe(2);
    const [parent, sub] = events;
    expect(parent?.type).toBe("pre-tool-use");
    expect(parent?.kind).toBe("main");
    expect(parent?.agentId).toBe("sess-sub");
    expect(parent?.toolName).toBe("Task");
    expect(sub?.type).toBe("subagent-start");
    expect(sub?.kind).toBe("subagent");
    expect(sub?.agentId).toBe("sess-sub:tuse_abc");
    expect(sub?.parentAgentId).toBe("sess-sub");
  });

  it("emits parent post-tool-use + subagent-end for a matching tool_result", () => {
    const events = normalizeJsonlEvents(
      {
        type: "tool_result",
        sessionId: "sess-sub",
        timestamp: "2026-04-20T10:00:01Z",
        tool_use_id: "tuse_abc",
        content: "done"
      },
      "raw"
    );
    expect(events.length).toBe(2);
    const [parent, sub] = events;
    expect(parent?.type).toBe("post-tool-use");
    expect(parent?.kind).toBe("main");
    expect(sub?.type).toBe("subagent-end");
    expect(sub?.agentId).toBe("sess-sub:tuse_abc");
    expect(sub?.parentAgentId).toBe("sess-sub");
  });

  it("uses a monotonic fallback id when tool_use_id is missing", () => {
    const first = normalizeJsonlEvents(
      {
        type: "assistant",
        sessionId: "sess-fallback",
        timestamp: "2026-04-20T10:00:00Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              name: "Agent",
              input: { prompt: "first" }
            }
          ]
        }
      },
      "raw"
    );
    const second = normalizeJsonlEvents(
      {
        type: "assistant",
        sessionId: "sess-fallback",
        timestamp: "2026-04-20T10:00:00Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              name: "Agent",
              input: { prompt: "second" }
            }
          ]
        }
      },
      "raw"
    );
    expect(first[1]?.agentId).toBe("sess-fallback:sub-1");
    expect(second[1]?.agentId).toBe("sess-fallback:sub-2");
  });

  it("does not synthesise a subagent for ordinary (non-Task) tool_use", () => {
    const events = normalizeJsonlEvents(
      {
        type: "assistant",
        sessionId: "sess-plain",
        timestamp: "2026-04-20T10:00:00Z",
        message: {
          role: "assistant",
          content: [
            { type: "tool_use", id: "tuse_read", name: "Read", input: { file_path: "/x" } }
          ]
        }
      },
      "raw"
    );
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe("pre-tool-use");
    expect(events[0]?.kind).toBe("main");
  });

  it("returns [] for payloads with no sessionId", () => {
    const events = normalizeJsonlEvents({ type: "user" }, "raw");
    expect(events).toEqual([]);
  });
});
