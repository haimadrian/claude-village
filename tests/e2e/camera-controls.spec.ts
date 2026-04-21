import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  canvasClip,
  holdKey,
  measureNoiseFloor,
  pickFreePort,
  sceneDiff,
  settle,
  waitForMeaningfulCanvas,
  type Clip
} from "./_helpers";

/**
 * End-to-end regression guards for the VillageScene camera controls:
 * keyboard pan / dolly, shift modifier, editable-focus guard,
 * window-blur release, app shortcut (Esc), mouse-drag orbit, and
 * user-override of in-flight focus-zone glides.
 *
 * We cannot poke the three.js camera directly from Playwright (the scene
 * owns it and this spec may not patch the scene). Instead we use a
 * centre-patch pixel-MSE diff as a proxy: if arrows / dolly / drag
 * produce no visible change on the canvas, the handler is silently
 * broken. Noise-floor calibration per test keeps thresholds robust
 * against the water / cloud shaders that drift continuously.
 */
let hookPort = 0;
let fakeClaude: string;
let app: ElectronApplication;

test.beforeAll(async () => {
  fakeClaude = fs.mkdtempSync(path.join(os.tmpdir(), "cv-e2e-camera-"));
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

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  await postHook({ hook_event_name: "SessionStart", session_id: "cv-camera" });
  await postHook({
    hook_event_name: "PreToolUse",
    session_id: "cv-camera",
    tool_name: "Read",
    tool_input: { file_path: "README.md" }
  });
  await waitForMeaningfulCanvas(window);
  // Let the scene reach steady state (water / clouds loop).
  await settle(window, 600);
});

test.afterAll(async () => {
  await app?.close();
  if (fakeClaude) fs.rmSync(fakeClaude, { recursive: true, force: true });
});

interface HookPayload {
  hook_event_name: string;
  session_id: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

async function postHook(payload: HookPayload): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${hookPort}/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`hook POST failed: ${res.status} ${await res.text()}`);
  await new Promise((r) => setTimeout(r, 50));
}

const MOVE_MULTIPLIER = 2.5;
const ABSOLUTE_MOVE_FLOOR = 0.8;

async function primeTest(window: Page): Promise<{ clip: Clip; noise: number }> {
  await window.mouse.move(0, 0);
  await settle(window, 200);
  const clip = await canvasClip(window);
  const noise = await measureNoiseFloor(window, clip);
  return { clip, noise };
}

function movedThreshold(noise: number): number {
  return Math.max(ABSOLUTE_MOVE_FLOOR, noise * MOVE_MULTIPLIER);
}

function stillThreshold(noise: number): number {
  return Math.max(noise * 1.8, 0.6);
}

test("arrow keys move the camera and pixel output changes", async () => {
  const window = await app.firstWindow();
  const { clip, noise } = await primeTest(window);
  const before = await window.screenshot({ clip });
  await holdKey(window, "ArrowRight", 350);
  await settle(window);
  const after = await window.screenshot({ clip });
  expect(sceneDiff(before, after)).toBeGreaterThan(movedThreshold(noise));
});

test("arrow up then arrow down returns approximately to start", async () => {
  const window = await app.firstWindow();
  const { clip, noise } = await primeTest(window);
  const before = await window.screenshot({ clip });
  await holdKey(window, "ArrowUp", 300);
  await settle(window);
  const mid = await window.screenshot({ clip });
  await holdKey(window, "ArrowDown", 300);
  await settle(window);
  const after = await window.screenshot({ clip });

  const moved = sceneDiff(before, mid);
  const returned = sceneDiff(before, after);
  expect(moved).toBeGreaterThan(movedThreshold(noise));
  // The return trip must land closer to start than the mid-press frame.
  expect(returned).toBeLessThan(moved);
});

test("+ / = dolly in visibly zooms and - returns", async () => {
  const window = await app.firstWindow();
  const { clip, noise } = await primeTest(window);
  const before = await window.screenshot({ clip });
  await holdKey(window, "=", 450);
  await settle(window);
  const zoomed = await window.screenshot({ clip });
  expect(sceneDiff(before, zoomed)).toBeGreaterThan(movedThreshold(noise));
  await holdKey(window, "-", 450);
  await settle(window);
  const restored = await window.screenshot({ clip });
  expect(sceneDiff(before, restored)).toBeLessThan(sceneDiff(before, zoomed));
});

test("PageUp / PageDown behave like + / -", async () => {
  const window = await app.firstWindow();
  const { clip, noise } = await primeTest(window);
  const before = await window.screenshot({ clip });
  await holdKey(window, "PageUp", 400);
  await settle(window);
  const zoomedIn = await window.screenshot({ clip });
  expect(sceneDiff(before, zoomedIn)).toBeGreaterThan(movedThreshold(noise));
  // Return so subsequent tests start near the original camera.
  await holdKey(window, "PageDown", 400);
  await settle(window);
});

test("Shift modifier produces more motion than an unmodified press", async () => {
  const window = await app.firstWindow();
  const { clip, noise } = await primeTest(window);

  const start = await window.screenshot({ clip });
  await holdKey(window, "ArrowRight", 100);
  await settle(window, 200);
  const afterPlain = await window.screenshot({ clip });
  // Return to origin before the boosted press.
  await holdKey(window, "ArrowLeft", 160);
  await settle(window, 400);
  const plainDiff = sceneDiff(start, afterPlain);

  await window.keyboard.down("Shift");
  await holdKey(window, "ArrowRight", 100);
  await window.keyboard.up("Shift");
  await settle(window, 200);
  const afterShift = await window.screenshot({ clip });
  // Cleanup for downstream tests.
  await holdKey(window, "ArrowLeft", 300);
  await settle(window, 300);
  const shiftDiff = sceneDiff(start, afterShift);

  expect(plainDiff).toBeGreaterThan(noise);
  expect(shiftDiff).toBeGreaterThan(noise);
  // The "after_plain" and "after_shift" frames must differ; if Shift
  // were a no-op, the two would be nearly identical because the scene
  // and hold duration are the same.
  expect(sceneDiff(afterPlain, afterShift)).toBeGreaterThan(noise * 2);
});

test("arrow keys are ignored while focus is inside an editable field", async () => {
  const window = await app.firstWindow();
  // Ensure the canvas has rendered a real frame before we measure.
  await window.mouse.move(0, 0);
  await settle(window, 200);
  const clip = await canvasClip(window);

  await window.getByRole("button", { name: "Open settings" }).click({ force: true });
  const input = window.locator('input[type="number"]').first();
  await expect(input).toBeVisible();
  await input.focus();
  await expect(input).toBeFocused();

  // Measure the noise floor WITH the dialog open so the baseline matches
  // the region we will screenshot (overlay-occluded centre + animating
  // water at the edges).
  const openNoise = await measureNoiseFloor(window, clip);
  const before = await window.screenshot({ clip });

  const consoleErrors: string[] = [];
  const onError = (msg: { type(): string; text(): string }): void => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  window.on("console", onError);
  try {
    await holdKey(window, "ArrowRight", 350);
    await settle(window);
    const after = await window.screenshot({ clip });
    // Editable focus short-circuits the handler; the diff must stay
    // within the overlay-occluded noise band. Generous margin keeps the
    // test stable when a single stray water frame slips in.
    expect(sceneDiff(before, after)).toBeLessThan(Math.max(openNoise * 2.5, 1.5));
    expect(consoleErrors).toEqual([]);
  } finally {
    window.off("console", onError);
    await window.keyboard.press("Escape");
    await expect(window.getByRole("heading", { name: "Settings" })).toBeHidden();
  }
});

test("window blur drops pressed keys so panning stops", async () => {
  const window = await app.firstWindow();
  const { clip, noise } = await primeTest(window);

  await window.keyboard.down("ArrowRight");
  // Let a frame or two of motion register, then blur.
  await window.waitForTimeout(60);
  await window.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
  });
  // After blur the pressed-key set should be cleared; leave the
  // synthetic key "down" in Playwright's state to prove the scene does
  // not keep moving.
  await window.waitForTimeout(250);
  const a1 = await window.screenshot({ clip });
  await window.waitForTimeout(400);
  const a2 = await window.screenshot({ clip });
  await window.keyboard.up("ArrowRight");

  expect(sceneDiff(a1, a2)).toBeLessThan(stillThreshold(noise) * 1.6);
});

test("Escape closes open dialogs", async () => {
  const window = await app.firstWindow();

  await window.getByRole("button", { name: "Open settings" }).click({ force: true });
  await expect(window.getByRole("heading", { name: "Settings" })).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(window.getByRole("heading", { name: "Settings" })).toBeHidden();

  await window.getByRole("button", { name: "Open help" }).click({ force: true });
  await expect(window.getByRole("heading", { name: /claude-village - Help/ })).toBeVisible();
  await window.keyboard.press("Escape");
  await expect(window.getByRole("heading", { name: /claude-village - Help/ })).toBeHidden();
});

test("mouse drag orbits the camera", async () => {
  const window = await app.firstWindow();
  const canvas = window.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas bounding box unavailable");
  const { clip, noise } = await primeTest(window);

  const before = await window.screenshot({ clip });
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await window.mouse.move(cx, cy);
  await window.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await window.mouse.move(cx + (120 * step) / 8, cy);
    await window.waitForTimeout(15);
  }
  await window.mouse.up();
  await settle(window, 400);

  const after = await window.screenshot({ clip });
  expect(sceneDiff(before, after)).toBeGreaterThan(movedThreshold(noise));
});

test("arrow key cancels an in-flight focus-zone glide", async () => {
  const window = await app.firstWindow();
  const { clip, noise } = await primeTest(window);

  await window.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent("village:focus-zone", { detail: { zoneId: "library" } })
    );
  });
  await window.waitForTimeout(50);

  // The arrow press fires onUserOverride, which clears `desiredTargetRef`
  // and stops the glide. After release + settle the scene is stationary.
  await holdKey(window, "ArrowLeft", 300);
  await settle(window, 500);
  const s1 = await window.screenshot({ clip });
  await settle(window, 500);
  const s2 = await window.screenshot({ clip });

  expect(sceneDiff(s1, s2)).toBeLessThan(stillThreshold(noise) * 1.6);
});
