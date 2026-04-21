/**
 * Deterministic layout generator for grass tufts and tiny flowers
 * scattered on the main island's grass cap. Purely decorative.
 *
 * The scatter avoids:
 *  - the main island's outer rim (we stay inside `MAIN_ISLAND_RADIUS - 2`),
 *  - every zone centre (5-unit radius guard around each zone),
 *  - every character slot (1-unit guard around each slot).
 *
 * Layout is generated once using a seeded Mulberry32 PRNG so the scene
 * is reproducible across renders and tests.
 */

import { ZONES } from "../../shared/zones";
import { MAIN_ISLAND_RADIUS, ZONE_RING_RADIUS } from "./sceneConstants";
import { allSlotPositions } from "./slots";

/** A single grass tuft placement. */
export interface GrassTuftPlacement {
  /** World XZ position (y is always 0 - the grass cap). */
  position: [number, number];
  /** Rotation around Y in radians (so tufts don't all face the same way). */
  rotationY: number;
  /** Height multiplier (slight per-instance variation). */
  heightScale: number;
  /** Index into a small green-shade palette. */
  colorIndex: number;
}

/** A single flower placement. */
export interface FlowerPlacement {
  /** World XZ position. */
  position: [number, number];
  /** Stem height. */
  stemHeight: number;
  /** Index into the petal-colour palette. */
  colorIndex: number;
}

export interface IslandGreeneryLayout {
  tufts: GrassTuftPlacement[];
  flowers: FlowerPlacement[];
}

/**
 * Mulberry32 - same PRNG used by `minorIslands.ts`. Small, deterministic,
 * good enough spread for decorative scatter.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Green shade palette - dark mossy to light fresh grass. */
export const GRASS_COLORS: readonly string[] = Object.freeze([
  "#4d7a1f",
  "#5b9a2a",
  "#6b8e23",
  "#7aad3a",
  "#3f6a18"
]);

/** Flower palette - cheerful meadow colours. */
export const FLOWER_COLORS: readonly string[] = Object.freeze([
  "#ffe066", // yellow
  "#ff9ecf", // pink
  "#ffffff", // white
  "#c38fff" // violet
]);

export const GREENERY_SEED = 0x07a5517e;
export const DEFAULT_TUFT_COUNT = 90;
export const DEFAULT_FLOWER_COUNT = 32;

/** Inner scatter radius - stay off the immediate centre where terrain may be busy. */
export const GREENERY_INNER_RADIUS = 1.5;

/** Outer scatter radius - stay well clear of the island edge. */
export const GREENERY_OUTER_RADIUS = MAIN_ISLAND_RADIUS - 2;

/** Minimum clearance (squared distance) from each zone centre. */
const ZONE_CLEARANCE = 4.5;
/** Minimum clearance from each character slot. */
const SLOT_CLEARANCE = 1.0;

function computeZoneCenters(): Array<[number, number]> {
  const n = ZONES.length;
  const centers: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    centers.push([Math.cos(angle) * ZONE_RING_RADIUS, Math.sin(angle) * ZONE_RING_RADIUS]);
  }
  return centers;
}

/** Build a flat list of every forbidden {x,z,r} circle on the island. */
function buildExclusions(): Array<{ x: number; z: number; r: number }> {
  const zoneCenters = computeZoneCenters();
  const ex: Array<{ x: number; z: number; r: number }> = [];
  for (const [zx, zz] of zoneCenters) {
    ex.push({ x: zx, z: zz, r: ZONE_CLEARANCE });
    for (const slot of allSlotPositions([zx, 0, zz])) {
      ex.push({ x: slot[0], z: slot[2], r: SLOT_CLEARANCE });
    }
  }
  return ex;
}

function isClearOf(x: number, z: number, exclusions: Array<{ x: number; z: number; r: number }>) {
  for (const e of exclusions) {
    const dx = x - e.x;
    const dz = z - e.z;
    if (dx * dx + dz * dz < e.r * e.r) return false;
  }
  return true;
}

export function generateIslandGreenery(
  tuftCount: number = DEFAULT_TUFT_COUNT,
  flowerCount: number = DEFAULT_FLOWER_COUNT,
  seed: number = GREENERY_SEED
): IslandGreeneryLayout {
  const rand = mulberry32(seed);
  const exclusions = buildExclusions();
  const innerSq = GREENERY_INNER_RADIUS * GREENERY_INNER_RADIUS;
  const outerSq = GREENERY_OUTER_RADIUS * GREENERY_OUTER_RADIUS;

  const samplePoint = (): [number, number] | null => {
    for (let attempt = 0; attempt < 30; attempt++) {
      // Uniform sample in the disc via sqrt of U for radius.
      const u = rand();
      const r = Math.sqrt(u * (outerSq - innerSq) + innerSq);
      const theta = rand() * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      if (isClearOf(x, z, exclusions)) return [x, z];
    }
    return null;
  };

  const tufts: GrassTuftPlacement[] = [];
  for (let i = 0; i < tuftCount; i++) {
    const p = samplePoint();
    if (!p) continue;
    tufts.push({
      position: p,
      rotationY: rand() * Math.PI * 2,
      heightScale: 0.7 + rand() * 0.6,
      colorIndex: Math.floor(rand() * GRASS_COLORS.length)
    });
  }

  const flowers: FlowerPlacement[] = [];
  for (let i = 0; i < flowerCount; i++) {
    const p = samplePoint();
    if (!p) continue;
    flowers.push({
      position: p,
      stemHeight: 0.22 + rand() * 0.16,
      colorIndex: Math.floor(rand() * FLOWER_COLORS.length)
    });
  }

  return { tufts, flowers };
}

/** Frozen default layout - imported directly by the renderer. */
export const ISLAND_GREENERY: Readonly<IslandGreeneryLayout> =
  Object.freeze(generateIslandGreenery());
