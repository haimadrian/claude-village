import { test, expect, _electron as electron } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

test("a new session file causes a tab to appear", async () => {
  const fakeClaude = fs.mkdtempSync(path.join(os.tmpdir(), "cv-e2e-"));
  // Pre-create the projects subtree so the chokidar watcher attaches to a
  // real directory at startup. Without this, chokidar may sit idle waiting
  // for the missing root and never observe later file additions.
  const projDir = path.join(fakeClaude, "projects", "-my-project");
  fs.mkdirSync(projDir, { recursive: true });

  const file = path.join(projDir, "sess-abc.jsonl");
  const ts = new Date().toISOString();

  const userLine = JSON.stringify({
    type: "user",
    message: { role: "user", content: "hello" },
    sessionId: "sess-abc",
    uuid: "u-1",
    timestamp: ts
  });
  const toolUseLine = JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "t-1",
          name: "Read",
          input: { file_path: "/tmp/x.ts" }
        }
      ]
    },
    sessionId: "sess-abc",
    uuid: "u-2",
    timestamp: ts
  });

  // Seed the JSONL before launching so the chokidar watcher picks it up in
  // its initial scan and the renderer's first `listSessions()` call already
  // includes the session. This exercises the full ingest -> store -> IPC ->
  // sidebar path end-to-end in a deterministic order.
  fs.writeFileSync(file, userLine + "\n" + toolUseLine + "\n");

  const app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CLAUDE_CONFIG_DIR: fakeClaude }
  });

  try {
    const window = await app.firstWindow();
    await window.locator("aside").waitFor({ state: "visible" });

    // Poll the sidebar for the session id. The plan's 2s fixed wait is
    // brittle on slower machines; expect.poll bounds the wait at 5s and
    // exits as soon as the renderer mirrors the new session.
    await expect
      .poll(async () => (await window.locator("aside").innerText()).toString(), {
        timeout: 5_000,
        intervals: [100, 250, 500]
      })
      .toContain("sess-abc".slice(0, 8));
  } finally {
    await app.close();
    fs.rmSync(fakeClaude, { recursive: true, force: true });
  }
});
