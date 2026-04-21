/* eslint-disable no-console */
/**
 * Generate small placeholder GLB models for the 9 zone buildings and the 2
 * character kinds (mayor, villager). These are stand-ins for Kenney.nl CC0
 * voxel assets; swapping to real Kenney GLBs is a single file-drop away once
 * network access to kenney.nl is available in the build environment.
 *
 * Usage: node scripts/generate-placeholder-glbs.mjs
 *
 * Writes files into src/renderer/assets/models/.
 *
 * Why do this at all rather than commit a single shared cube? The whole point
 * of Tier 2 is to wire the asset pipeline end-to-end (useGLTF, Clone,
 * preload, fallback) so Tier 1 is only one diff away from real voxel assets.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

// ---------------------------------------------------------------------------
// Minimal browser polyfills so three's GLTFExporter can produce a GLB in Node.
// The exporter uses Blob + FileReader to assemble the final binary buffer.
// Node 20 ships Blob natively but not FileReader, so stub just enough of the
// latter to feed the exporter's readAsArrayBuffer + readAsDataURL flows.
// ---------------------------------------------------------------------------
class FileReaderPolyfill {
  constructor() {
    this.onloadend = null;
    this.onload = null;
    this.onerror = null;
    this.result = null;
  }
  async readAsArrayBuffer(blob) {
    try {
      this.result = await blob.arrayBuffer();
    } catch (err) {
      if (this.onerror) this.onerror(err);
      return;
    }
    if (this.onload) this.onload({ target: this });
    if (this.onloadend) this.onloadend({ target: this });
  }
  async readAsDataURL(blob) {
    try {
      const buf = Buffer.from(await blob.arrayBuffer());
      this.result = `data:${blob.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
    } catch (err) {
      if (this.onerror) this.onerror(err);
      return;
    }
    if (this.onload) this.onload({ target: this });
    if (this.onloadend) this.onloadend({ target: this });
  }
}
globalThis.FileReader = FileReaderPolyfill;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.resolve(__dirname, "..", "src", "renderer", "assets", "models");

fs.mkdirSync(OUT_DIR, { recursive: true });

/**
 * Build a stacked-box "building" mesh for a zone. Palette per zone keeps
 * the placeholder recognisable in-scene before real Kenney assets land.
 */
function buildZoneScene(zoneId, palette) {
  const scene = new THREE.Scene();
  scene.name = `${zoneId}_building`;

  const baseMat = new THREE.MeshStandardMaterial({ color: palette.base });
  const accentMat = new THREE.MeshStandardMaterial({ color: palette.accent });
  const roofMat = new THREE.MeshStandardMaterial({ color: palette.roof });

  // Ground plate.
  const ground = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), baseMat);
  ground.name = "ground";
  ground.position.set(0, 0.1, 0);
  scene.add(ground);

  // Main body.
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.4), accentMat);
  body.name = "body";
  body.position.set(0, 1.0, 0);
  scene.add(body);

  // Roof cap (a second stacked box; cheap differentiator per zone).
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.4, 2.8), roofMat);
  roof.name = "roof";
  roof.position.set(0, 2.0, 0);
  scene.add(roof);

  // Small spire so zones are visually distinct at a glance.
  const spire = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), roofMat);
  spire.name = "spire";
  spire.position.set(0, 2.6, 0);
  scene.add(spire);

  return scene;
}

/**
 * Build a minimal two-box voxel character (body + head), mirroring the Tier 1
 * geometry so fallback / non-fallback look similar. The body uses white so
 * per-agent hashed tinting (applied via material.color at runtime) stays
 * effective after loading.
 */
function buildCharacterScene(kind) {
  const scene = new THREE.Scene();
  scene.name = `${kind}_character`;

  // Body colour white so runtime `skinColor` tinting of the cloned material
  // multiplies correctly. Head uses a warm neutral for "skin".
  const bodyMat = new THREE.MeshStandardMaterial({ color: "#ffffff" });
  const headMat = new THREE.MeshStandardMaterial({ color: "#f3c89a" });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.4), bodyMat);
  body.name = "body";
  body.position.set(0, 0.5, 0);
  scene.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMat);
  head.name = "head";
  head.position.set(0, 1.25, 0);
  scene.add(head);

  // Mayor gets a tiny hat so mayors and villagers differ visually even before
  // the real Kenney swap (matches design spec: "distinctive skin").
  if (kind === "mayor") {
    const hatMat = new THREE.MeshStandardMaterial({ color: "#3a2a1a" });
    const hat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.6), hatMat);
    hat.name = "hat";
    hat.position.set(0, 1.6, 0);
    scene.add(hat);
  }

  return scene;
}

async function exportGLB(scene, outPath) {
  const exporter = new GLTFExporter();
  const arrayBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => resolve(result),
      (err) => reject(err),
      { binary: true }
    );
  });
  const bytes = new Uint8Array(arrayBuffer);
  fs.writeFileSync(outPath, bytes);
  console.log(`  wrote ${path.relative(process.cwd(), outPath)} (${bytes.byteLength} bytes)`);
}

// Zone palettes chosen to loosely match Tier 1 zoneColor() mapping so the
// Tier 2 look feels continuous with Tier 1.
const ZONE_PALETTES = {
  office: { base: "#b0c4de", accent: "#8fa7c4", roof: "#4d5c74" },
  library: { base: "#8b6f47", accent: "#a8875a", roof: "#4a3921" },
  mine: { base: "#5a5a5a", accent: "#7a7a7a", roof: "#2e2e2e" },
  forest: { base: "#2e7d32", accent: "#4caf50", roof: "#1b5e20" },
  farm: { base: "#d4a017", accent: "#f0c040", roof: "#8a6a10" },
  nether: { base: "#8b0000", accent: "#b22222", roof: "#3d0000" },
  signpost: { base: "#c19a6b", accent: "#a07850", roof: "#5a3e20" },
  spawner: { base: "#9370db", accent: "#b39ae8", roof: "#4b3780" },
  tavern: { base: "#a0522d", accent: "#c67a50", roof: "#5a2a10" }
};

async function main() {
  console.log(`generating placeholder GLBs into ${path.relative(process.cwd(), OUT_DIR)}`);
  for (const [zoneId, palette] of Object.entries(ZONE_PALETTES)) {
    const scene = buildZoneScene(zoneId, palette);
    await exportGLB(scene, path.join(OUT_DIR, `zone-${zoneId}.glb`));
  }
  for (const kind of ["mayor", "villager"]) {
    const scene = buildCharacterScene(kind);
    await exportGLB(scene, path.join(OUT_DIR, `character-${kind}.glb`));
  }
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
