import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";

/**
 * End-to-end flow: drive the running app entirely via the hook HTTP ingress
 * and assert that both the mayor (main agent) and the spawned subagent render
 * as distinct characters.
 *
 * We intentionally override CLAUDE_CONFIG_DIR to a freshly-created empty
 * directory so the JSONL watcher finds no pre-existing sessions; the HTTP
 * hook stream is the sole source of truth for this test.
 *
 * We reserve a fresh loopback port per `beforeAll` (rather than hard-coding
 * one) so `--repeat-each` iterations do not race each other for the same
 * port. When the previous iteration's Electron child is still releasing
 * 127.0.0.1:<port> and the next iteration tries to bind the same fixed
 * port, main's `HookServer.start()` rejects, which triggers `app.exit(1)`
 * before a window is ever created - surfacing as `firstWindow()` timing
 * out instead of an obvious "port in use" error.
 */
let hookPort = 0;
let fakeClaude: string;
let app: ElectronApplication;

/**
 * Ask the OS for a free TCP port by binding to port 0, reading the
 * assigned port, and closing the listener. There is a tiny TOCTOU gap
 * between close and the child re-binding, but on a single-process test
 * runner nothing else is competing for the ephemeral range, so it is
 * sufficient in practice.
 */
async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        reject(new Error("failed to allocate ephemeral port"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

test.beforeAll(async () => {
  fakeClaude = fs.mkdtempSync(path.join(os.tmpdir(), "cv-e2e-multi-"));
  fs.mkdirSync(path.join(fakeClaude, "projects"), { recursive: true });
  hookPort = await pickFreePort();

  app = await electron.launch({
    args: ["out/main/index.js"],
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: fakeClaude,
      CV_HOOK_PORT: String(hookPort)
    }
  });
});

test.afterAll(async () => {
  await app?.close();
  if (fakeClaude) fs.rmSync(fakeClaude, { recursive: true, force: true });
});

test("mayor and subagents render when driven by hook events", async () => {
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  const sessionId = "cv-e2e-001";

  // 1. Session start. The mayor (main agent) is spawned.
  await postHook({ hook_event_name: "SessionStart", session_id: sessionId });

  // We no longer render the raw sessionId in the sidebar or tab chrome - the
  // app shows Claude Code's session title, falling back to "New session"
  // until one arrives. Flexible nav / sidebar assertions: just confirm a
  // session row appears and the village canvas renders.
  await expect(window.locator("aside button").first()).toBeVisible({ timeout: 5_000 });
  await expect(window.locator("nav button").first()).toBeVisible({ timeout: 5_000 });
  await expect(window.locator("canvas").first()).toBeVisible({ timeout: 5_000 });

  // 2. Mayor reads a file (walks to the Library).
  await postHook({
    hook_event_name: "PreToolUse",
    session_id: sessionId,
    tool_name: "Read",
    tool_input: { file_path: "README.md" }
  });
  await postHook({
    hook_event_name: "PostToolUse",
    session_id: sessionId,
    tool_name: "Read",
    tool_result: "# hello"
  });

  // 3. Mayor dispatches a subagent via Task. A synthetic subagent-start must
  //    spawn a second character.
  await postHook({
    hook_event_name: "PreToolUse",
    session_id: sessionId,
    tool_name: "Task",
    tool_use_id: "tuse_001",
    tool_input: { subagent_type: "explorer", prompt: "look around" }
  });

  // Each Character renders a drei <Html> name label with a
  // `data-testid="agent-label"` attribute and `data-agent-kind` of "main" or
  // "subagent". We expect two labels total after the Task dispatch: one
  // Mayor, one subagent.
  await expect
    .poll(async () => await window.locator('[data-testid="agent-label"]').count(), {
      timeout: 7_000,
      intervals: [250, 500]
    })
    .toBeGreaterThanOrEqual(2);

  // Mayor label is always "Mayor"; subagent label is "Agent N".
  const mayorLabels = window.locator('[data-testid="agent-label"][data-agent-kind="main"]');
  const subagentLabels = window.locator('[data-testid="agent-label"][data-agent-kind="subagent"]');
  expect(await mayorLabels.count()).toBe(1);
  expect(await mayorLabels.first().innerText()).toBe("Mayor");
  expect(await subagentLabels.count()).toBeGreaterThanOrEqual(1);
  expect(await subagentLabels.first().innerText()).toMatch(/^Agent \d+$/);

  // 4. Subagent finishes - send the matching Task post-tool-use. Store marks
  //    the subagent character ghost; it is still present until the 3-minute
  //    expiry, so we only assert the counts stay stable for the remainder of
  //    the scenario.
  await postHook({
    hook_event_name: "PostToolUse",
    session_id: sessionId,
    tool_name: "Task",
    tool_use_id: "tuse_001",
    tool_result: "done"
  });

  // 5. Session end. The session status flips to ended; the mayor label stays
  //    rendered on the scene.
  await postHook({ hook_event_name: "Stop", session_id: sessionId });
  await expect(
    window.locator('[data-testid="agent-label"][data-agent-kind="main"]')
  ).toHaveCount(1);
});

interface HookPayload {
  hook_event_name: string;
  session_id: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: string;
  tool_use_id?: string;
  agent_id?: string;
}

async function postHook(payload: HookPayload): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${hookPort}/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    throw new Error(`hook POST failed: ${res.status} ${await res.text()}`);
  }
  // Small yield so the main process has a tick to flush the event through the
  // store-to-renderer IPC pipeline before the next POST / assertion.
  await new Promise((r) => setTimeout(r, 50));
}
