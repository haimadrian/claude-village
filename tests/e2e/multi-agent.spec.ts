import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * End-to-end flow: drive the running app entirely via the hook HTTP ingress
 * and assert that both the mayor (main agent) and the spawned subagent render
 * as distinct characters.
 *
 * We intentionally override CLAUDE_CONFIG_DIR to a freshly-created empty
 * directory so the JSONL watcher finds no pre-existing sessions; the HTTP
 * hook stream is the sole source of truth for this test.
 *
 * `CV_HOOK_PORT` is fixed to a specific port (not 0) because the test process
 * needs to POST to it directly. If the port happens to be busy locally, fail
 * loudly rather than racing for a random one.
 */
const HOOK_PORT = 49333;
let fakeClaude: string;
let app: ElectronApplication;

test.beforeAll(async () => {
  fakeClaude = fs.mkdtempSync(path.join(os.tmpdir(), "cv-e2e-multi-"));
  fs.mkdirSync(path.join(fakeClaude, "projects"), { recursive: true });

  app = await electron.launch({
    args: ["out/main/index.js"],
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: fakeClaude,
      CV_HOOK_PORT: String(HOOK_PORT)
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

  // Sidebar + tab pick up the new session.
  await expect
    .poll(async () => await window.locator("aside").innerText(), {
      timeout: 5_000,
      intervals: [100, 250, 500]
    })
    .toContain("cv-e2e");
  await expect(window.locator("nav")).toContainText("cv-e2e");
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

  // Each Character renders a drei <Html> name label: "🛡 <id-prefix>" for the
  // mayor, "<id-prefix>" for subagents. Two characters to labels starting
  // with "cv-e2e" (one mayor, one subagent).
  await expect
    .poll(
      async () => await window.locator("div[title*='cv-e2e']").count(),
      { timeout: 7_000, intervals: [250, 500] }
    )
    .toBeGreaterThanOrEqual(2);

  // Mayor label carries the shield prefix; subagent label does not.
  const mayorLabels = await window.locator("div[title^='Mayor']").count();
  const villagerLabels = await window.locator("div[title^='Villager']").count();
  expect(mayorLabels).toBe(1);
  expect(villagerLabels).toBeGreaterThanOrEqual(1);

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
  await expect(window.locator("div[title^='Mayor']")).toHaveCount(1);
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
  const res = await fetch(`http://127.0.0.1:${HOOK_PORT}/event`, {
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
