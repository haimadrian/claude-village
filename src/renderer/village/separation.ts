/**
 * Lightweight separation-steering helper for character collision avoidance.
 *
 * We deliberately keep this pure and framework-free so it can be unit-tested
 * without pulling in three.js. The renderer converts `THREE.Vector3` values to
 * plain `{x, z}` points before calling in.
 *
 * Given the position of a single agent and the positions of its neighbours,
 * return a small horizontal displacement that pushes it away from any neighbour
 * closer than `radius`. Multiple neighbours sum linearly. The returned vector
 * scales with `strength` and the overlap amount (closer => stronger push), so
 * distant neighbours contribute nothing.
 *
 * The caller is expected to scale by `dt` so the effect is frame-rate
 * independent. `maxStep` caps the total displacement per call to prevent
 * visible jitter when two agents end up perfectly on top of each other.
 */
export interface Point2D {
  x: number;
  z: number;
}

export interface SeparationOptions {
  /** Neighbours beyond this distance are ignored. World units. */
  radius: number;
  /** Multiplier on the push vector. Higher => stronger avoidance. */
  strength: number;
  /** Maximum per-call displacement magnitude (clamp to avoid jitter). */
  maxStep: number;
}

export function computeSeparation(
  self: Point2D,
  neighbours: readonly Point2D[],
  options: SeparationOptions
): Point2D {
  let dx = 0;
  let dz = 0;
  const { radius, strength, maxStep } = options;
  if (radius <= 0) return { x: 0, z: 0 };

  for (const other of neighbours) {
    const ox = self.x - other.x;
    const oz = self.z - other.z;
    const distSq = ox * ox + oz * oz;
    if (distSq >= radius * radius) continue;
    const dist = Math.sqrt(distSq);

    if (dist === 0) {
      // Degenerate overlap. Push in a deterministic direction so two agents
      // stacked on the same cell still separate instead of sitting frozen.
      dx += radius;
      continue;
    }
    // Linear falloff: `overlap / radius` is 1 when touching, 0 at the edge.
    const overlap = (radius - dist) / radius;
    dx += (ox / dist) * overlap;
    dz += (oz / dist) * overlap;
  }

  dx *= strength;
  dz *= strength;

  const mag = Math.sqrt(dx * dx + dz * dz);
  if (mag > maxStep) {
    dx = (dx / mag) * maxStep;
    dz = (dz / mag) * maxStep;
  }

  return { x: dx, z: dz };
}
