import { describe, it, expect } from "vitest";
import {
  generateMinorIslands,
  MINOR_INNER_RADIUS,
  MINOR_OUTER_RADIUS,
  SECONDARY_ISLAND_COUNT,
  MINOR_ISLANDS
} from "../../src/renderer/village/minorIslands";

describe("generateMinorIslands", () => {
  it("produces a deterministic layout for the same seed", () => {
    const a = generateMinorIslands(SECONDARY_ISLAND_COUNT, 0xabc123);
    const b = generateMinorIslands(SECONDARY_ISLAND_COUNT, 0xabc123);
    expect(a).toEqual(b);
  });

  it("returns the requested count (or fewer only when scatter space is exhausted)", () => {
    const islands = generateMinorIslands(SECONDARY_ISLAND_COUNT);
    expect(islands.length).toBeGreaterThanOrEqual(SECONDARY_ISLAND_COUNT - 1);
    expect(islands.length).toBeLessThanOrEqual(SECONDARY_ISLAND_COUNT);
  });

  it("places every island inside the [MINOR_INNER_RADIUS, MINOR_OUTER_RADIUS] annulus", () => {
    for (const island of MINOR_ISLANDS) {
      const [x, , z] = island.center;
      const d = Math.sqrt(x * x + z * z);
      expect(d).toBeGreaterThanOrEqual(MINOR_INNER_RADIUS);
      expect(d).toBeLessThanOrEqual(MINOR_OUTER_RADIUS);
    }
  });

  it("keeps island discs non-overlapping (with a small clearance)", () => {
    for (let i = 0; i < MINOR_ISLANDS.length; i++) {
      for (let j = i + 1; j < MINOR_ISLANDS.length; j++) {
        const a = MINOR_ISLANDS[i]!;
        const b = MINOR_ISLANDS[j]!;
        const dx = a.center[0] - b.center[0];
        const dz = a.center[2] - b.center[2];
        const d = Math.sqrt(dx * dx + dz * dz);
        expect(d).toBeGreaterThan(a.radius + b.radius);
      }
    }
  });

  it("places every tree strictly inside its host island disc", () => {
    for (const island of MINOR_ISLANDS) {
      for (const tree of island.trees) {
        const [ox, oz] = tree.offset;
        const d = Math.sqrt(ox * ox + oz * oz);
        expect(d).toBeLessThanOrEqual(island.radius);
      }
    }
  });

  it("uses sensible sizes for trunks and canopies", () => {
    for (const island of MINOR_ISLANDS) {
      expect(island.trees.length).toBeGreaterThanOrEqual(1);
      expect(island.trees.length).toBeLessThanOrEqual(3);
      for (const t of island.trees) {
        expect(t.trunkHeight).toBeGreaterThan(0);
        expect(t.canopyHeight).toBeGreaterThan(0);
        expect(t.trunkRadius).toBeGreaterThan(0);
        expect(t.canopyRadius).toBeGreaterThan(0);
      }
    }
  });
});
