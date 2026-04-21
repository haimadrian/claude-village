import { describe, it, expect } from "vitest";
import {
  generateFishPaths,
  fishPositionAt,
  FISH_PATHS,
  FISH_COUNT,
  FISH_COLORS,
  FISH_MIN_Y,
  FISH_MAX_Y,
  FISH_ORBIT_MIN_RADIUS,
  FISH_ORBIT_MAX_RADIUS
} from "../../src/renderer/village/fish";

describe("generateFishPaths", () => {
  it("is deterministic for the same seed", () => {
    const a = generateFishPaths(FISH_COUNT, 0xdecaf);
    const b = generateFishPaths(FISH_COUNT, 0xdecaf);
    expect(a).toEqual(b);
  });

  it("produces the requested count", () => {
    const paths = generateFishPaths(7, 1);
    expect(paths).toHaveLength(7);
  });

  it("default school uses FISH_COUNT entries", () => {
    expect(FISH_PATHS).toHaveLength(FISH_COUNT);
  });

  it("keeps every base depth inside [FISH_MIN_Y, FISH_MAX_Y]", () => {
    for (const p of FISH_PATHS) {
      expect(p.baseY).toBeGreaterThanOrEqual(FISH_MIN_Y);
      expect(p.baseY).toBeLessThanOrEqual(FISH_MAX_Y);
    }
  });

  it("uses orbit radii inside the configured horizontal range", () => {
    for (const p of FISH_PATHS) {
      expect(p.radius).toBeGreaterThanOrEqual(FISH_ORBIT_MIN_RADIUS);
      expect(p.radius).toBeLessThanOrEqual(FISH_ORBIT_MAX_RADIUS);
    }
  });

  it("uses valid palette indices", () => {
    for (const p of FISH_PATHS) {
      expect(p.colorIndex).toBeGreaterThanOrEqual(0);
      expect(p.colorIndex).toBeLessThan(FISH_COLORS.length);
    }
  });

  it("uses non-zero angular speeds (both directions in general)", () => {
    for (const p of FISH_PATHS) {
      expect(Math.abs(p.angularSpeed)).toBeGreaterThan(0);
    }
  });
});

describe("fishPositionAt", () => {
  const path = {
    centerX: 0,
    centerZ: 0,
    radius: 10,
    baseY: -5,
    bobAmplitude: 0.5,
    angularSpeed: 0.2,
    phase: 0,
    colorIndex: 0,
    scale: 1
  };

  it("keeps horizontal distance from the centre equal to the radius", () => {
    for (const t of [0, 1, 3.7, 12]) {
      const { position } = fishPositionAt(path, t);
      const dx = position[0] - path.centerX;
      const dz = position[2] - path.centerZ;
      expect(Math.sqrt(dx * dx + dz * dz)).toBeCloseTo(path.radius, 5);
    }
  });

  it("bobs around baseY within the configured amplitude", () => {
    const ys = [0, 0.5, 1.1, 2, 3.3].map((t) => fishPositionAt(path, t).position[1]);
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(path.baseY - path.bobAmplitude - 0.001);
      expect(y).toBeLessThanOrEqual(path.baseY + path.bobAmplitude + 0.001);
    }
  });

  it("returns a unit tangent aligned with direction of travel", () => {
    const { position: p0 } = fishPositionAt(path, 0);
    const { position: p1, tangent } = fishPositionAt(path, 0.001);
    const tlen = Math.sqrt(tangent[0] * tangent[0] + tangent[2] * tangent[2]);
    expect(tlen).toBeCloseTo(1, 5);
    const dx = p1[0] - p0[0];
    const dz = p1[2] - p0[2];
    const dlen = Math.sqrt(dx * dx + dz * dz);
    if (dlen > 0) {
      const dot = (dx / dlen) * tangent[0] + (dz / dlen) * tangent[2];
      expect(dot).toBeGreaterThan(0.99);
    }
  });

  it("reverses the tangent when angular speed flips sign", () => {
    const fwd = fishPositionAt({ ...path, angularSpeed: 0.2 }, 0).tangent;
    const rev = fishPositionAt({ ...path, angularSpeed: -0.2 }, 0).tangent;
    expect(fwd[0]).toBeCloseTo(-rev[0], 5);
    expect(fwd[2]).toBeCloseTo(-rev[2], 5);
  });
});
