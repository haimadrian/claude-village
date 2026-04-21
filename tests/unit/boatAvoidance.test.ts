import { describe, expect, it } from "vitest";
import {
  BOAT_ISLAND_CLEARANCE,
  deflectAroundIslands,
  type BoatObstacle
} from "../../src/renderer/village/Boat";

const obstacle = (x: number, z: number, r: number): BoatObstacle => ({
  center: { x, z },
  radius: r
});

describe("deflectAroundIslands", () => {
  it("leaves a position outside every safety disc unchanged", () => {
    const out = deflectAroundIslands({ x: 40, z: 40 }, [obstacle(0, 0, 3)]);
    expect(out).toEqual({ x: 40, z: 40 });
  });

  it("pushes a position inside an obstacle out to the safety-disc edge", () => {
    const islandR = 3;
    const safe = islandR + BOAT_ISLAND_CLEARANCE;
    // Proposed position sits 1 unit right of the island centre - well
    // inside the safety disc; it should end up exactly safe units right.
    const out = deflectAroundIslands({ x: 1, z: 0 }, [obstacle(0, 0, islandR)]);
    expect(out.x).toBeCloseTo(safe, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it("preserves the bearing from the obstacle centre to the proposed position", () => {
    const islandR = 3;
    const safe = islandR + BOAT_ISLAND_CLEARANCE;
    // Position at angle 135 degrees from the island centre, inside the
    // disc. After deflection it must still sit at that angle, just
    // further out.
    const angle = (135 * Math.PI) / 180;
    const r = 1.0;
    const px = Math.cos(angle) * r;
    const pz = Math.sin(angle) * r;
    const out = deflectAroundIslands({ x: px, z: pz }, [obstacle(0, 0, islandR)]);
    const outAngle = Math.atan2(out.z, out.x);
    expect(outAngle).toBeCloseTo(angle, 6);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(safe, 6);
  });

  it("falls back to +x when the proposed position coincides with the centre", () => {
    const islandR = 2;
    const safe = islandR + BOAT_ISLAND_CLEARANCE;
    const out = deflectAroundIslands({ x: 5, z: 5 }, [obstacle(5, 5, islandR)]);
    expect(out.x).toBeCloseTo(5 + safe, 6);
    expect(out.z).toBeCloseTo(5, 6);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.z)).toBe(true);
  });

  it("respects every obstacle in sequence", () => {
    const a = obstacle(0, 0, 2);
    const b = obstacle(10, 0, 2);
    // Inside island a; outside island b.
    const out = deflectAroundIslands({ x: 0.5, z: 0 }, [a, b]);
    // After pushing out of a along +x, the point is at safeRadius,0.
    // That sits inside neither disc, so b does not perturb it further.
    expect(out.x).toBeCloseTo(2 + BOAT_ISLAND_CLEARANCE, 6);
    expect(out.z).toBeCloseTo(0, 6);
  });

  it("honours a custom clearance", () => {
    const out = deflectAroundIslands({ x: 0.1, z: 0 }, [obstacle(0, 0, 1)], 3);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(4, 6);
  });
});
