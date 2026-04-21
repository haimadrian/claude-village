/**
 * Deterministic parameters for the underwater fish school.
 *
 * Each fish follows a slow horizontal circular path with a sinusoidal
 * vertical bob. Rendering is gated by camera y elsewhere; this module
 * only exposes pure helpers.
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

export interface FishPath {
  /** Centre of the circular path in XZ. */
  centerX: number;
  centerZ: number;
  /** Radius of the circle. */
  radius: number;
  /** Mean depth (y) the fish swims around. */
  baseY: number;
  /** Vertical bob amplitude. */
  bobAmplitude: number;
  /** Angular speed in rad/s. Positive is CCW. */
  angularSpeed: number;
  /** Starting phase in radians. */
  phase: number;
  /** Palette index for the fish body colour. */
  colorIndex: number;
  /** Body length multiplier (per-fish size variation). */
  scale: number;
}

export const FISH_COLORS: readonly string[] = Object.freeze([
  "#ffb85c",
  "#5fb0ff",
  "#ff6b6b",
  "#f5d65c",
  "#b48cff",
  "#5fd9a3",
  "#ff93c6"
]);

/** Where fish are allowed to swim vertically (world y). */
export const FISH_MIN_Y = -14;
export const FISH_MAX_Y = -2;

/** Horizontal extents for the centre of each fish's orbit. */
export const FISH_ORBIT_MIN_RADIUS = 5;
export const FISH_ORBIT_MAX_RADIUS = 35;

export const FISH_COUNT = 22;
export const FISH_SEED = 0xf15c0111;

export function generateFishPaths(
  count: number = FISH_COUNT,
  seed: number = FISH_SEED
): FishPath[] {
  const rand = mulberry32(seed);
  const paths: FishPath[] = [];
  for (let i = 0; i < count; i++) {
    const centerR = rand() * 25;
    const centerTheta = rand() * Math.PI * 2;
    paths.push({
      centerX: Math.cos(centerTheta) * centerR,
      centerZ: Math.sin(centerTheta) * centerR,
      radius: FISH_ORBIT_MIN_RADIUS + rand() * (FISH_ORBIT_MAX_RADIUS - FISH_ORBIT_MIN_RADIUS),
      baseY: FISH_MIN_Y + rand() * (FISH_MAX_Y - FISH_MIN_Y),
      bobAmplitude: 0.3 + rand() * 0.9,
      angularSpeed: (rand() < 0.5 ? -1 : 1) * (0.15 + rand() * 0.25),
      phase: rand() * Math.PI * 2,
      colorIndex: Math.floor(rand() * FISH_COLORS.length),
      scale: 0.8 + rand() * 0.8
    });
  }
  return paths;
}

/**
 * Pure helper - where is this fish at time `t`, and which direction is
 * it heading? Exported so the path math can be unit tested.
 */
export function fishPositionAt(
  path: FishPath,
  t: number
): { position: [number, number, number]; tangent: [number, number, number] } {
  const angle = path.phase + path.angularSpeed * t;
  const x = path.centerX + Math.cos(angle) * path.radius;
  const z = path.centerZ + Math.sin(angle) * path.radius;
  const y = path.baseY + Math.sin(t * 0.7 + path.phase) * path.bobAmplitude;
  const sign = Math.sign(path.angularSpeed) || 1;
  const tx = -Math.sin(angle) * sign;
  const tz = Math.cos(angle) * sign;
  return { position: [x, y, z], tangent: [tx, 0, tz] };
}

export const FISH_PATHS: readonly FishPath[] = Object.freeze(generateFishPaths());
