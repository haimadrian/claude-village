import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SessionWatcher } from "../../src/main/session-watcher";
import type { AgentEvent } from "../../src/shared/types";

describe("SessionWatcher", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cv-watcher-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("emits one AgentEvent per JSONL line appended", async () => {
    const watcher = new SessionWatcher(tmpRoot);
    const received: AgentEvent[] = [];
    watcher.on("event", (e) => received.push(e));
    await watcher.start();

    const projDir = path.join(tmpRoot, "-project");
    fs.mkdirSync(projDir, { recursive: true });
    const file = path.join(projDir, "sess-1.jsonl");

    fs.writeFileSync(
      file,
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "hi" },
        sessionId: "sess-1",
        uuid: "u-1",
        timestamp: "2026-04-20T10:00:00Z"
      }) + "\n"
    );

    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBe(1);
    expect(received[0]?.type).toBe("user-message");
    expect(received[0]?.sessionId).toBe("sess-1");

    await watcher.stop();
  });

  it("skips malformed lines without crashing", async () => {
    const watcher = new SessionWatcher(tmpRoot);
    const received: AgentEvent[] = [];
    watcher.on("event", (e) => received.push(e));
    await watcher.start();

    const projDir = path.join(tmpRoot, "-project");
    fs.mkdirSync(projDir, { recursive: true });
    const file = path.join(projDir, "sess-1.jsonl");
    fs.writeFileSync(
      file,
      "not json\n" +
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "hi" },
          sessionId: "sess-1",
          uuid: "u-2",
          timestamp: "2026-04-20T10:00:00Z"
        }) +
        "\n"
    );

    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBe(1);
    await watcher.stop();
  });

  it("resets offset when file is truncated", async () => {
    const watcher = new SessionWatcher(tmpRoot);
    const received: AgentEvent[] = [];
    watcher.on("event", (e) => received.push(e));
    await watcher.start();

    const projDir = path.join(tmpRoot, "-project");
    fs.mkdirSync(projDir, { recursive: true });
    const file = path.join(projDir, "sess-1.jsonl");

    fs.writeFileSync(
      file,
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "old" },
        sessionId: "sess-1",
        uuid: "u-1",
        timestamp: "2026-04-20T10:00:00Z"
      }) + "\n"
    );
    await new Promise((r) => setTimeout(r, 300));

    fs.writeFileSync(
      file,
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "new" },
        sessionId: "sess-1",
        uuid: "u-2",
        timestamp: "2026-04-20T10:00:01Z"
      }) + "\n"
    );
    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBe(2);
    await watcher.stop();
  });
});
