import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";

/**
 * Regression guard for the 3D scene tooltip. The tooltip has broken three
 * times in a row; every regression has been a DOM overlay (drei `<Html>`
 * label or speech bubble) silently intercepting pointer events meant for
 * the canvas, which stops `TooltipLayer`'s raycaster from firing.
 *
 * This spec drives the app end to end, moves the mouse across the
 * canvas, and asserts that hovering produces at least one visible
 * tooltip panel (`data-testid="tooltip-panel"`). If that panel ever
 * fails to render on hover, this test fails and CI blocks the merge.
 */
let hookPort = 0;
let fakeClaude: string;
let app: ElectronApplication;

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
  fakeClaude = fs.mkdtempSync(path.join(os.tmpdir(), "cv-e2e-tooltip-"));
  fs.mkdirSync(path.join(fakeClaude, "projects"), { recursive: true });
  hookPort = await pickFreePort();

  app = await electron.launch({
    args: ["out/main/index.js"],
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: fakeClaude,
      CV_HOOK_PORT: String(hookPort),
      CV_HIDDEN_WINDOW: "1"
    }
  });
});

test.afterAll(async () => {
  await app?.close();
  if (fakeClaude) fs.rmSync(fakeClaude, { recursive: true, force: true });
});

test("tooltip appears when hovering the scene and hides when the pointer leaves", async () => {
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  const sessionId = "cv-e2e-tooltip-001";

  // 1. Spawn the mayor and send one `Read` tool-use so a zone (Library)
  //    has clear activity. This gives the raycaster a rich scene with
  //    several zones and at least one character to hover.
  await postHook({ hook_event_name: "SessionStart", session_id: sessionId });
  await postHook({
    hook_event_name: "PreToolUse",
    session_id: sessionId,
    tool_name: "Read",
    tool_input: { file_path: "README.md" }
  });

  // Wait for the canvas + mayor label to render.
  const canvas = window.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 5_000 });
  await expect(window.locator('[data-testid="agent-label"][data-agent-kind="main"]')).toHaveCount(
    1,
    { timeout: 7_000 }
  );

  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas bounding box unavailable");

  // 2. Sweep a small grid of canvas points until at least one shows the
  //    tooltip. The zones sit on a ring around the origin at ~13 world
  //    units; with the default camera (22, 18, 22) looking at (0,0,0) the
  //    ring is visible across most of the canvas interior. Sweeping a 5x5
  //    grid hits several zones regardless of exact camera tuning.
  const cols = 5;
  const rows = 5;
  let seenTooltip = false;
  let lastText = "";
  for (let r = 1; r <= rows && !seenTooltip; r++) {
    for (let c = 1; c <= cols && !seenTooltip; c++) {
      const x = box.x + (box.width * c) / (cols + 1);
      const y = box.y + (box.height * r) / (rows + 1);
      // Move off-canvas first so the debounce timer resets between probes
      // and `pointerleave` always fires to clear any stale tooltip.
      await window.mouse.move(0, 0);
      await window.mouse.move(x, y, { steps: 4 });
      // HOVER_DELAY_MS is 200ms; wait a comfortable margin.
      await window.waitForTimeout(400);
      const count = await window.locator('[data-testid="tooltip-panel"]').count();
      if (count > 0) {
        seenTooltip = true;
        lastText = await window.locator('[data-testid="tooltip-panel"]').first().innerText();
      }
    }
  }
  expect(seenTooltip, "tooltip-panel should appear at least once while sweeping the canvas").toBe(
    true
  );

  // The tooltip content is either a zone card (name + description) or the
  // mayor character card. Both cases include non-empty text; zone cards
  // specifically include at least one of the seeded zone names.
  expect(lastText.length).toBeGreaterThan(0);

  // 3. Move the pointer well off the canvas; the tooltip must disappear.
  await window.mouse.move(0, 0);
  await window.waitForTimeout(400);
  await expect(window.locator('[data-testid="tooltip-panel"]')).toHaveCount(0);
});

interface HookPayload {
  hook_event_name: string;
  session_id: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: string;
  tool_use_id?: string;
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
  await new Promise((r) => setTimeout(r, 50));
}
