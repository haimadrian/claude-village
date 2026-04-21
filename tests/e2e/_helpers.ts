import net from "node:net";
import zlib from "node:zlib";
import type { Page } from "@playwright/test";

/**
 * Ask the OS for a free TCP port by binding to port 0, reading the
 * assigned port, and closing the listener. There is a tiny TOCTOU gap
 * between close and the child re-binding, but on a single-process test
 * runner nothing else is competing for the ephemeral range, so it is
 * sufficient in practice.
 */
export async function pickFreePort(): Promise<number> {
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

export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DecodedImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Minimal PNG decoder: walks IHDR + IDAT chunks, inflates the bitstream,
 * and undoes the Paeth / Up / Sub / Average filters to produce raw RGBA
 * bytes. We only need this for RGB / RGBA, 8 bits per channel,
 * non-interlaced images, which is exactly what Playwright's screenshot
 * emits. This exists so we can compute real pixel MSE diffs between two
 * canvas screenshots without pulling in pngjs / sharp as test deps.
 */
export function decodePng(buf: Buffer): DecodedImage {
  if (
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47 ||
    buf[4] !== 0x0d ||
    buf[5] !== 0x0a ||
    buf[6] !== 0x1a ||
    buf[7] !== 0x0a
  ) {
    throw new Error("not a PNG");
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatParts: Buffer[] = [];
  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.slice(pos + 4, pos + 8).toString("ascii");
    const data = buf.slice(pos + 8, pos + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + length;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`unsupported color type ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const stride = width * channels;
  const out = new Uint8Array(stride * height);
  let rawPos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rawPos]!;
    rawPos += 1;
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[rowStart + x - channels]! : 0;
      const up = y > 0 ? out[rowStart - stride + x]! : 0;
      const upLeft = x >= channels && y > 0 ? out[rowStart - stride + x - channels]! : 0;
      const v = raw[rawPos + x]!;
      let pred = 0;
      switch (filter) {
        case 0:
          pred = 0;
          break;
        case 1:
          pred = left;
          break;
        case 2:
          pred = up;
          break;
        case 3:
          pred = (left + up) >>> 1;
          break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          break;
        }
        default:
          throw new Error(`bad filter ${filter}`);
      }
      out[rowStart + x] = (v + pred) & 0xff;
    }
    rawPos += stride;
  }
  return { width, height, data: out };
}

/**
 * Mean absolute per-channel difference between two screenshot PNGs of
 * the same geometry. Returns 0..255; typical idle-animation noise is
 * ~0.3-1, and meaningful camera motion pushes it well above 2.
 */
export function sceneDiff(a: Buffer, b: Buffer): number {
  const ia = decodePng(a);
  const ib = decodePng(b);
  const n = Math.min(ia.data.length, ib.data.length);
  let sum = 0;
  const step = 3;
  let samples = 0;
  for (let i = 0; i < n; i += step) {
    sum += Math.abs(ia.data[i]! - ib.data[i]!);
    samples += 1;
  }
  return samples > 0 ? sum / samples : 0;
}

/**
 * Measure the idle-animation noise floor: diffs observed between two
 * screenshots taken with no input while the water + sky shaders keep
 * animating. We return the max of several samples so "significant
 * motion" thresholds are always well above background noise.
 */
export async function measureNoiseFloor(window: Page, clip: Clip): Promise<number> {
  let maxDiff = 0;
  let prev = await window.screenshot({ clip });
  for (let i = 0; i < 4; i++) {
    await window.waitForTimeout(180);
    const next = await window.screenshot({ clip });
    const d = sceneDiff(prev, next);
    if (d > maxDiff) maxDiff = d;
    prev = next;
  }
  return maxDiff;
}

/**
 * Bounding box of the canvas as a Playwright screenshot `clip`. Retries
 * on a cold-started run: the canvas occasionally reports null for its
 * first couple of `boundingBox()` calls.
 */
export async function canvasClip(window: Page): Promise<Clip> {
  const canvas = window.locator("canvas").first();
  let box = await canvas.boundingBox();
  for (let i = 0; i < 5 && (!box || box.width < 10); i++) {
    await window.waitForTimeout(100);
    box = await canvas.boundingBox();
  }
  if (!box) throw new Error("canvas bounding box unavailable");
  // A centred 60% square patch keeps pixel counts small while still
  // sampling the interesting part of the scene.
  const size = Math.min(box.width, box.height) * 0.6;
  return {
    x: Math.floor(box.x + (box.width - size) / 2),
    y: Math.floor(box.y + (box.height - size) / 2),
    width: Math.floor(size),
    height: Math.floor(size)
  };
}

/**
 * Wait until the canvas has rendered at least one non-trivial frame. We
 * decode the centre patch and demand the mean per-channel value is above
 * a tiny floor, so tests do not accidentally start while the canvas is
 * still showing the WebGL clear colour.
 */
export async function waitForMeaningfulCanvas(window: Page): Promise<void> {
  const canvas = window.locator("canvas").first();
  if (!(await canvas.isVisible())) {
    await canvas.waitFor({ state: "visible", timeout: 10_000 });
  }
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const clip = await canvasClip(window);
    const shot = await window.screenshot({ clip });
    const { data } = decodePng(shot);
    let sum = 0;
    const step = 53;
    let samples = 0;
    for (let i = 0; i < data.length; i += step) {
      sum += data[i]!;
      samples += 1;
    }
    const mean = samples > 0 ? sum / samples : 0;
    if (mean > 30) return;
    await window.waitForTimeout(200);
  }
  throw new Error("canvas never rendered a non-trivial frame");
}

export async function holdKey(window: Page, key: string, ms: number): Promise<void> {
  await window.keyboard.down(key);
  await window.waitForTimeout(ms);
  await window.keyboard.up(key);
}

export async function settle(window: Page, ms = 250): Promise<void> {
  await window.waitForTimeout(ms);
}
