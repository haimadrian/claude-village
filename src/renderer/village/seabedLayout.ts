/**
 * Deterministic scatter helpers for the seabed decorations.
 *
 * The seabed itself is a subdivided, gently displaced plane built
 * directly in the renderer component. This module generates the
 * positions + per-instance parameters for:
 *  - rocks (grey chunks)
 *  - seagrass clusters (tufts of tall thin blades that sway)
 *  - corals / sea flowers (coloured tufts)
 *
 * All layouts are seeded so the ocean floor is reproducible.
 */

import { SEABED_RADIUS, MAIN_ISLAND_RADIUS } from "./sceneConstants";

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

/** Rocks: scattered chunks of grey stone. */
export interface RockPlacement {
  position: [number, number]; // XZ, y comes from the seabed height at that point
  scale: [number, number, number];
  rotationY: number;
  /** 0-based index into a small grey palette. */
  shadeIndex: number;
}

/** Seagrass: a cluster of 3-5 tall thin blades at one location. */
export interface SeagrassCluster {
  position: [number, number];
  /** Per-blade offsets (relative to cluster centre) + height. */
  blades: Array<{ offset: [number, number]; height: number; phase: number }>;
  colorIndex: number;
}

/** Coral / sea flower tuft. */
export interface CoralPlacement {
  position: [number, number];
  scale: number;
  colorIndex: number;
  /** 0: cone, 1: icosahedron, 2: sphere cluster. */
  shape: 0 | 1 | 2;
}

export interface SeabedLayout {
  rocks: RockPlacement[];
  seagrass: SeagrassCluster[];
  corals: CoralPlacement[];
}

export const ROCK_SHADES: readonly string[] = Object.freeze([
  "#6e6a66",
  "#7a7470",
  "#8a8581",
  "#5e5a55"
]);

export const SEAGRASS_COLORS: readonly string[] = Object.freeze([
  "#2f6a3a",
  "#4a8f4a",
  "#3a7d4e",
  "#5ca55f"
]);

export const CORAL_COLORS: readonly string[] = Object.freeze([
  "#ff7f7f",
  "#ffbdbd",
  "#ff99cc",
  "#a65fd6",
  "#ffe066",
  "#ff6ba3"
]);

export const SEABED_SEED = 0x5ea7bed0;
export const DEFAULT_ROCK_COUNT = 60;
export const DEFAULT_SEAGRASS_COUNT = 45;
export const DEFAULT_CORAL_COUNT = 30;

/** Inner scatter radius - stay clear of the main island's underwater footprint. */
export const SEABED_INNER_RADIUS = MAIN_ISLAND_RADIUS + 2;

/**
 * Height of the seabed surface at position (x, z), relative to the
 * plane's own y=0. The seabed mesh sits at `SEABED_Y`, and vertices are
 * displaced by this function to give gentle dunes. Pure function so
 * it's reusable from the renderer (for placing rocks on the surface)
 * and from unit tests.
 */
export function seabedHeightAt(x: number, z: number): number {
  // Sum of two cheap sinusoids + a low-frequency radial mound so the
  // floor is not completely flat near the centre.
  const a = Math.sin(x * 0.12) * 0.8;
  const b = Math.cos(z * 0.15) * 0.7;
  const c = Math.sin((x + z) * 0.07) * 0.5;
  const r = Math.sqrt(x * x + z * z);
  const mound = Math.cos(r * 0.04) * 0.6;
  return a + b + c + mound;
}

/** Sample a point uniformly in the seabed annulus. */
function sampleSeabedPoint(rand: () => number): [number, number] {
  const innerSq = SEABED_INNER_RADIUS * SEABED_INNER_RADIUS;
  const outerSq = SEABED_RADIUS * SEABED_RADIUS;
  const u = rand();
  const r = Math.sqrt(u * (outerSq - innerSq) + innerSq);
  const theta = rand() * Math.PI * 2;
  return [Math.cos(theta) * r, Math.sin(theta) * r];
}

export function generateSeabedLayout(
  rockCount: number = DEFAULT_ROCK_COUNT,
  seagrassCount: number = DEFAULT_SEAGRASS_COUNT,
  coralCount: number = DEFAULT_CORAL_COUNT,
  seed: number = SEABED_SEED
): SeabedLayout {
  const rand = mulberry32(seed);

  const rocks: RockPlacement[] = [];
  for (let i = 0; i < rockCount; i++) {
    const [x, z] = sampleSeabedPoint(rand);
    const baseScale = 0.4 + rand() * 1.1;
    rocks.push({
      position: [x, z],
      scale: [
        baseScale * (0.8 + rand() * 0.4),
        baseScale * (0.6 + rand() * 0.3),
        baseScale * (0.8 + rand() * 0.4)
      ],
      rotationY: rand() * Math.PI * 2,
      shadeIndex: Math.floor(rand() * ROCK_SHADES.length)
    });
  }

  const seagrass: SeagrassCluster[] = [];
  for (let i = 0; i < seagrassCount; i++) {
    const [x, z] = sampleSeabedPoint(rand);
    const bladeCount = 3 + Math.floor(rand() * 3); // [3,5]
    const blades = [];
    for (let b = 0; b < bladeCount; b++) {
      blades.push({
        offset: [(rand() - 0.5) * 0.4, (rand() - 0.5) * 0.4] as [number, number],
        height: 0.9 + rand() * 0.8,
        phase: rand() * Math.PI * 2
      });
    }
    seagrass.push({
      position: [x, z],
      blades,
      colorIndex: Math.floor(rand() * SEAGRASS_COLORS.length)
    });
  }

  const corals: CoralPlacement[] = [];
  for (let i = 0; i < coralCount; i++) {
    const [x, z] = sampleSeabedPoint(rand);
    corals.push({
      position: [x, z],
      scale: 0.35 + rand() * 0.5,
      colorIndex: Math.floor(rand() * CORAL_COLORS.length),
      shape: Math.floor(rand() * 3) as 0 | 1 | 2
    });
  }

  return { rocks, seagrass, corals };
}

export const SEABED_LAYOUT: Readonly<SeabedLayout> = Object.freeze(generateSeabedLayout());
