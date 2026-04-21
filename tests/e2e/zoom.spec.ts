import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import zlib from "node:zlib";

/**
 * Regression guard for the "mouse zoom washes the canvas clear white"
 * rendering bug. The symptom was that after aggressive zoom-in via the
 * mouse wheel (especially after a click-to-focus on a zone), the
 * underwater atmosphere flipped on, hid the sky dome, and the island
 * in the foreground made the frame read as a near-uniform wash.
 *
 * Playwright cannot sample the WebGL framebuffer directly (readPixels
 * against the presented buffer returns zeros), so this spec captures
 * canvas screenshots, decodes them, and asserts the average brightness
 * stays in a normal range across the full zoom sweep.
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

interface DecodedPng {
  w: number;
  h: number;
  rgba: Buffer;
}

// Minimal PNG decoder: supports 8-bit RGB / RGBA with all 5 filters.
// Purpose is brightness sampling in tests, not production use.
function decodePng(buf: Buffer): DecodedPng {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("not a PNG");
  let i = 8;
  let w = 0;
  let h = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("ascii");
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    i += 8 + len + 4;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const stride = w * channels;
  const rgba = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const b = raw[rowStart + x]!;
      const a = x >= channels ? row[x - channels]! : 0;
      const c = prev[x]!;
      const d = x >= channels ? prev[x - channels]! : 0;
      let v: number;
      switch (filter) {
        case 0:
          v = b;
          break;
        case 1:
          v = (b + a) & 0xff;
          break;
        case 2:
          v = (b + c) & 0xff;
          break;
        case 3:
          v = (b + Math.floor((a + c) / 2)) & 0xff;
          break;
        case 4: {
          const p = a + c - d;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - c);
          const pc = Math.abs(p - d);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? c : d;
          v = (b + pr) & 0xff;
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter}`);
      }
      row[x] = v;
    }
    for (let x = 0; x < w; x++) {
      rgba[(y * w + x) * 4 + 0] = row[x * channels + 0]!;
      rgba[(y * w + x) * 4 + 1] = row[x * channels + 1]!;
      rgba[(y * w + x) * 4 + 2] = row[x * channels + 2]!;
      rgba[(y * w + x) * 4 + 3] = channels === 4 ? row[x * channels + 3]! : 255;
    }
    prev = row;
  }
  return { w, h, rgba };
}

function brightnessStats(png: Buffer): { mean: number; whiteFraction: number } {
  const { w, h, rgba } = decodePng(png);
  let sum = 0;
  let whiteCount = 0;
  const pixels = w * h;
  for (let i = 0; i < pixels; i++) {
    const r = rgba[i * 4 + 0]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    const m = (r + g + b) / 3;
    sum += m;
    // A "near-white" pixel: all three channels >= 240 (out of 255).
    if (r >= 240 && g >= 240 && b >= 240) whiteCount++;
  }
  return { mean: sum / (pixels * 255), whiteFraction: whiteCount / pixels };
}

test.beforeAll(async () => {
  fakeClaude = fs.mkdtempSync(path.join(os.tmpdir(), "cv-e2e-zoom-"));
  fs.mkdirSync(path.join(fakeClaude, "projects"), { recursive: true });
  hookPort = await pickFreePort();
  app = await electron.launch({
    args: ["out/main/index.js"],
    env: { ...process.env, CLAUDE_CONFIG_DIR: fakeClaude, CV_HOOK_PORT: String(hookPort) }
  });
});

test.afterAll(async () => {
  await app?.close();
  if (fakeClaude) fs.rmSync(fakeClaude, { recursive: true, force: true });
});

test("mouse zoom across full dolly range never washes the canvas to white", async () => {
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  // Seed a session so the active tab renders a canvas.
  const sessionId = "cv-e2e-zoom-001";
  const res = await fetch(`http://127.0.0.1:${hookPort}/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hook_event_name: "SessionStart", session_id: sessionId })
  });
  if (!res.ok) throw new Error(`hook POST failed: ${res.status}`);

  const canvas = window.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 5_000 });
  // Give the scene a moment to finish its first render pass (GLB
  // preloads, sky dome, water plane all resolve asynchronously).
  await window.waitForTimeout(1500);

  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas bounding box unavailable");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // OrbitControls listens for `wheel` events that bubble from the
  // canvas. Native `page.mouse.wheel` works in a real browser but the
  // Electron-headless driver does not reliably synthesise WheelEvents
  // here, so we dispatch them directly on the canvas DOM element.
  const dispatchWheel = async (deltaY: number, count: number): Promise<void> => {
    await window.evaluate(
      ([d, n, x, y]) => {
        const el = document.querySelector("canvas") as HTMLCanvasElement | null;
        if (!el) return;
        for (let i = 0; i < (n as number); i++) {
          el.dispatchEvent(
            new WheelEvent("wheel", {
              deltaY: d as number,
              clientX: x as number,
              clientY: y as number,
              bubbles: true,
              cancelable: true
            })
          );
        }
      },
      [deltaY, count, cx, cy]
    );
  };

  const assertNotWhite = async (label: string): Promise<void> => {
    const shot = await canvas.screenshot();
    const { mean, whiteFraction } = brightnessStats(shot);
    // A scene filled with the "clear white" bug sits at mean > 0.95 and
    // near-white fraction > 0.9. Healthy frames typically have mean in
    // [0.05, 0.6] and whiteFraction well below 0.1.
    expect(mean, `[${label}] mean brightness should not read as white wash`).toBeLessThan(0.9);
    expect(
      whiteFraction,
      `[${label}] fraction of near-white pixels should stay small`
    ).toBeLessThan(0.5);
  };

  await window.mouse.move(cx, cy);
  await assertNotWhite("baseline");

  // 1. Zoom in to minDistance.
  await dispatchWheel(-120, 80);
  await window.waitForTimeout(300);
  await assertNotWhite("zoom-in-from-default");

  // 2. Zoom out past maxDistance.
  await dispatchWheel(120, 120);
  await window.waitForTimeout(300);
  await assertNotWhite("zoom-out-to-max");

  // 3. Focus a zone (orbit target glides to (x, 1, z)) then zoom hard.
  //    This is the exact path that used to dip the camera below the
  //    UNDERWATER_CAMERA_Y threshold while the view was still over the
  //    island, flipping the atmosphere and washing the frame.
  await window.evaluate(() =>
    window.dispatchEvent(new CustomEvent("village:focus-zone", { detail: { zoneId: "library" } }))
  );
  await window.waitForTimeout(1000);
  await dispatchWheel(-120, 120);
  await window.waitForTimeout(400);
  await assertNotWhite("focus-zone-then-zoom-in");

  // 4. Orbit-drag the camera low and zoom again.
  await window.mouse.move(cx, cy);
  await window.mouse.down();
  await window.mouse.move(cx, cy + 500, { steps: 30 });
  await window.mouse.up();
  await window.waitForTimeout(400);
  await dispatchWheel(-120, 120);
  await window.waitForTimeout(400);
  await assertNotWhite("orbit-low-then-zoom-in");

  // Return the pointer off the canvas for a clean teardown.
  await window.mouse.move(0, 0);
});
