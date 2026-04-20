import { describe, it, expect } from "vitest";
import { computePath } from "../../src/renderer/village/pathfinding";

describe("computePath", () => {
  it("returns a straight path on an empty grid", () => {
    const g = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
    const p = computePath({ x: 0, z: 0 }, { x: 4, z: 0 }, g);
    expect(p.length).toBeGreaterThan(0);
    expect(p[0]).toEqual({ x: 0, z: 0 });
    expect(p[p.length - 1]).toEqual({ x: 4, z: 0 });
  });

  it("routes around an obstacle", () => {
    const g = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
    for (let z = 0; z < 5; z++) g[2]![z] = false;
    g[2]![4] = true;
    const p = computePath({ x: 0, z: 2 }, { x: 4, z: 2 }, g);
    expect(p.length).toBeGreaterThan(5);
    expect(p.some((n) => n.x === 2 && n.z === 4)).toBe(true);
  });

  it("returns empty array when no path exists", () => {
    const g = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => true));
    for (let z = 0; z < 5; z++) g[2]![z] = false;
    const p = computePath({ x: 0, z: 2 }, { x: 4, z: 2 }, g);
    expect(p).toEqual([]);
  });
});
