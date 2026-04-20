import { describe, it, expect } from "vitest";
import { classify } from "../../src/main/classifier";
import type { AgentEvent } from "../../src/shared/types";

const base: Omit<AgentEvent, "type"> = {
  sessionId: "s",
  agentId: "a",
  kind: "main",
  timestamp: 0
};

describe("classify", () => {
  it("maps Read to library", () => {
    expect(
      classify({ ...base, type: "pre-tool-use", toolName: "Read", toolArgsSummary: "/tmp/x.ts" })
        .zone
    ).toBe("library");
  });

  it("maps Write to office", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Write" }).zone).toBe("office");
  });

  it("maps Edit to office", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Edit" }).zone).toBe("office");
  });

  it("maps Grep to mine", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Grep" }).zone).toBe("mine");
  });

  it("maps Glob to mine", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Glob" }).zone).toBe("mine");
  });

  it("maps Task to spawner", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "Task" }).zone).toBe("spawner");
  });

  it("maps WebFetch to signpost", () => {
    expect(classify({ ...base, type: "pre-tool-use", toolName: "WebFetch" }).zone).toBe("signpost");
  });

  it("maps MCP tools (mcp__*) to signpost", () => {
    expect(
      classify({ ...base, type: "pre-tool-use", toolName: "mcp__github__get_file_contents" }).zone
    ).toBe("signpost");
  });

  it("maps Bash with test command to farm", () => {
    const r = classify({
      ...base,
      type: "pre-tool-use",
      toolName: "Bash",
      toolArgsSummary: "pnpm test"
    });
    expect(r.zone).toBe("farm");
  });

  it("maps Bash with git command to nether", () => {
    const r = classify({
      ...base,
      type: "pre-tool-use",
      toolName: "Bash",
      toolArgsSummary: "git commit -m 'x'"
    });
    expect(r.zone).toBe("nether");
  });

  it("maps generic Bash to forest", () => {
    const r = classify({
      ...base,
      type: "pre-tool-use",
      toolName: "Bash",
      toolArgsSummary: "ls -la"
    });
    expect(r.zone).toBe("forest");
  });

  it("maps session-end to tavern", () => {
    expect(classify({ ...base, type: "session-end" }).zone).toBe("tavern");
  });

  it("animation matches zone", () => {
    const r = classify({ ...base, type: "pre-tool-use", toolName: "Read" });
    expect(r.animation).toBe("work-library");
  });

  it("emits human-readable tooltip for Read", () => {
    const r = classify({
      ...base,
      type: "pre-tool-use",
      toolName: "Read",
      toolArgsSummary: "/tmp/x.ts"
    });
    expect(r.tooltip).toContain("/tmp/x.ts");
  });
});
