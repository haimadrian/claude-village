import { describe, it, expect } from "vitest";
import { boatOrbitAt, BOAT_FLEET_CONFIG, BOAT_COUNT } from "../../src/renderer/village/Boat";
import { MAIN_ISLAND_RADIUS } from "../../src/renderer/village/sceneConstants";

describe("boatOrbitAt", () => {
  const orbit = { radius: 20, angularSpeed: 0.1, phase: 0, baseY: -0.15 };

  it("keeps the boat on a circle of the configured radius (ignoring bob)", () => {
    for (const t of [0, 1, 5, 13.7]) {
      const { position } = boatOrbitAt(orbit, t);
      const d = Math.sqrt(position[0] * position[0] + position[2] * position[2]);
      expect(d).toBeCloseTo(orbit.radius, 5);
    }
  });

  it("bobs the boat vertically around the orbit baseY", () => {
    const samples = [0, 0.5, 1, 1.5, 2].map((t) => boatOrbitAt(orbit, t).position[1]);
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    // Bob amplitude is 0.05, so max - min should be non-zero but small.
    expect(max - min).toBeGreaterThan(0);
    expect(max - min).toBeLessThanOrEqual(0.11);
    // All samples within [baseY - 0.05, baseY + 0.05].
    for (const y of samples) {
      expect(y).toBeGreaterThanOrEqual(orbit.baseY - 0.051);
      expect(y).toBeLessThanOrEqual(orbit.baseY + 0.051);
    }
  });

  it("returns a unit-length tangent aligned with the direction of travel", () => {
    const { position: p0 } = boatOrbitAt(orbit, 0);
    const { position: p1, tangent } = boatOrbitAt(orbit, 0.001);
    // Tangent length is 1 (cos/sin with sign multiplier).
    const tlen = Math.sqrt(tangent[0] * tangent[0] + tangent[2] * tangent[2]);
    expect(tlen).toBeCloseTo(1, 5);
    // Direction of travel (p1 - p0 in XZ) is parallel to tangent.
    const dx = p1[0] - p0[0];
    const dz = p1[2] - p0[2];
    const dlen = Math.sqrt(dx * dx + dz * dz);
    if (dlen > 0) {
      const dot = (dx / dlen) * tangent[0] + (dz / dlen) * tangent[2];
      expect(dot).toBeGreaterThan(0.99);
    }
  });

  it("reverses the tangent when angular speed is negative", () => {
    const forward = boatOrbitAt({ ...orbit, angularSpeed: 0.1 }, 0).tangent;
    const reverse = boatOrbitAt({ ...orbit, angularSpeed: -0.1 }, 0).tangent;
    expect(forward[0]).toBeCloseTo(-reverse[0], 5);
    expect(forward[2]).toBeCloseTo(-reverse[2], 5);
  });
});

describe("BOAT_FLEET_CONFIG", () => {
  it("has BOAT_COUNT entries", () => {
    expect(BOAT_FLEET_CONFIG).toHaveLength(BOAT_COUNT);
  });

  it("places every boat outside the main island", () => {
    for (const orbit of BOAT_FLEET_CONFIG) {
      expect(orbit.radius).toBeGreaterThan(MAIN_ISLAND_RADIUS);
    }
  });

  it("uses slow angular speeds (under 0.15 rad/s magnitude)", () => {
    for (const orbit of BOAT_FLEET_CONFIG) {
      expect(Math.abs(orbit.angularSpeed)).toBeLessThan(0.15);
      expect(Math.abs(orbit.angularSpeed)).toBeGreaterThan(0);
    }
  });
});
