/**
 * Deterministic layout generator for the scatter of small secondary
 * islands around the main village island. Each entry describes the
 * island disc itself (centre, radius, top height) and a small set of
 * cone-on-trunk trees placed on top.
 *
 * The layout is generated once at module load using a seeded Mulberry32
 * PRNG so every renderer session paints the identical archipelago.
 * Keeping the scatter deterministic also keeps the e2e snapshots and
 * any future visual regression checks stable.
 */

import { MAIN_ISLAND_RADIUS } from "./sceneConstants";

/** Placement of a single tree on a minor island, relative to the island centre. */
export interface TreePlacement {
  /** Offset from the island centre in the XZ plane. */
  offset: [number, number];
  /** Trunk height in world units. */
  trunkHeight: number;
  /** Trunk radius in world units. */
  trunkRadius: number;
  /** Canopy (cone) height in world units. */
  canopyHeight: number;
  /** Canopy (cone) base radius in world units. */
  canopyRadius: number;
}

export interface MinorIslandLayout {
  /** Stable id - `mi-0`, `mi-1`, ... */
  id: string;
  /** Centre in world space. `y` is the top of the island disc. */
  center: [number, number, number];
  /** Radius of the island disc. */
  radius: number;
  /** Vertical thickness of the island (cylinder height). */
  height: number;
  /** Trees placed on the island. */
  trees: TreePlacement[];
}

/**
 * Mulberry32 - tiny 32-bit PRNG that returns a float in [0,1). Good
 * enough spread for decorative scatter; not cryptographic.
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

/**
 * Inner limit - islands placed outside this ring so they never overlap
 * the main island's grass ring. A small buffer (`+4`) keeps their
 * bounding discs clear of the village floor even accounting for their
 * own radii.
 */
export const MINOR_INNER_RADIUS = MAIN_ISLAND_RADIUS + 4;

/** Outer scatter limit - kept well inside the typical camera frustum. */
export const MINOR_OUTER_RADIUS = 70;

/** How many secondary islands to generate. */
export const SECONDARY_ISLAND_COUNT = 8;

/** Stable seed - changing this reshuffles the archipelago. */
export const MINOR_ISLANDS_SEED = 0xd15ea5ed;

export function generateMinorIslands(
  count: number = SECONDARY_ISLAND_COUNT,
  seed: number = MINOR_ISLANDS_SEED
): MinorIslandLayout[] {
  const rand = mulberry32(seed);
  const islands: MinorIslandLayout[] = [];
  const placed: Array<{ x: number; z: number; r: number }> = [];

  let attempts = 0;
  while (islands.length < count && attempts < count * 40) {
    attempts++;
    // Sample a point uniformly in the annulus [MINOR_INNER_RADIUS, MINOR_OUTER_RADIUS].
    const t = rand();
    const r = Math.sqrt(
      t * (MINOR_OUTER_RADIUS * MINOR_OUTER_RADIUS - MINOR_INNER_RADIUS * MINOR_INNER_RADIUS) +
        MINOR_INNER_RADIUS * MINOR_INNER_RADIUS
    );
    const theta = rand() * Math.PI * 2;
    const cx = Math.cos(theta) * r;
    const cz = Math.sin(theta) * r;
    const radius = 1.5 + rand() * 1.5; // [1.5, 3.0]

    // Reject if this disc overlaps any previously placed island.
    let overlaps = false;
    for (const p of placed) {
      const dx = p.x - cx;
      const dz = p.z - cz;
      const minGap = p.r + radius + 1.5;
      if (dx * dx + dz * dz < minGap * minGap) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    const treeCount = 1 + Math.floor(rand() * 3); // [1, 3]
    const trees: TreePlacement[] = [];
    for (let i = 0; i < treeCount; i++) {
      // Keep trees inside the island disc with a safe margin so no
      // trunk juts off the edge.
      const tMax = Math.max(0.1, radius - 0.6);
      const tR = rand() * tMax;
      const tTheta = rand() * Math.PI * 2;
      trees.push({
        offset: [Math.cos(tTheta) * tR, Math.sin(tTheta) * tR],
        trunkHeight: 0.5 + rand() * 0.3,
        trunkRadius: 0.1 + rand() * 0.05,
        canopyHeight: 1.2 + rand() * 0.8,
        canopyRadius: 0.5 + rand() * 0.35
      });
    }

    const height = 1.0 + rand() * 0.4;
    islands.push({
      id: `mi-${islands.length}`,
      center: [cx, 0, cz],
      radius,
      height,
      trees
    });
    placed.push({ x: cx, z: cz, r: radius });
  }
  return islands;
}

/** Frozen default archipelago - imported directly by `VillageScene`. */
export const MINOR_ISLANDS: readonly MinorIslandLayout[] = Object.freeze(generateMinorIslands());
