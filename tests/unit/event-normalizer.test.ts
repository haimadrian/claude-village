import { describe, it, expect } from "vitest";
import { normalizeJsonlEvent } from "../../src/main/event-normalizer";

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
