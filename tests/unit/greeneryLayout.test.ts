import { describe, it, expect } from "vitest";
import {
  generateIslandGreenery,
  ISLAND_GREENERY,
  DEFAULT_TUFT_COUNT,
  DEFAULT_FLOWER_COUNT,
  GREENERY_INNER_RADIUS,
  GREENERY_OUTER_RADIUS,
  GRASS_COLORS,
  FLOWER_COLORS
} from "../../src/renderer/village/greeneryLayout";
import { ZONES } from "../../src/shared/zones";
import { ZONE_RING_RADIUS } from "../../src/renderer/village/sceneConstants";
import { allSlotPositions } from "../../src/renderer/village/slots";

function zoneCenters(): Array<[number, number]> {
  const n = ZONES.length;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    out.push([Math.cos(angle) * ZONE_RING_RADIUS, Math.sin(angle) * ZONE_RING_RADIUS]);
  }
  return out;
}

describe("generateIslandGreenery", () => {
  it("is deterministic for the same seed", () => {
    const a = generateIslandGreenery(DEFAULT_TUFT_COUNT, DEFAULT_FLOWER_COUNT, 0xcafef00d);
    const b = generateIslandGreenery(DEFAULT_TUFT_COUNT, DEFAULT_FLOWER_COUNT, 0xcafef00d);
    expect(a).toEqual(b);
  });

  it("produces a different layout for a different seed", () => {
    const a = generateIslandGreenery(DEFAULT_TUFT_COUNT, DEFAULT_FLOWER_COUNT, 1);
    const b = generateIslandGreenery(DEFAULT_TUFT_COUNT, DEFAULT_FLOWER_COUNT, 999);
    expect(a).not.toEqual(b);
  });

  it("produces up to the requested number of tufts and flowers", () => {
    const { tufts, flowers } = generateIslandGreenery(20, 10, 0xabc);
    expect(tufts.length).toBeGreaterThanOrEqual(10);
    expect(tufts.length).toBeLessThanOrEqual(20);
    expect(flowers.length).toBeGreaterThanOrEqual(5);
    expect(flowers.length).toBeLessThanOrEqual(10);
  });

  it("keeps every placement inside the safe disc", () => {
    const all = [
      ...ISLAND_GREENERY.tufts.map((t) => t.position),
      ...ISLAND_GREENERY.flowers.map((f) => f.position)
    ];
    for (const [x, z] of all) {
      const d = Math.sqrt(x * x + z * z);
      expect(d).toBeGreaterThanOrEqual(GREENERY_INNER_RADIUS - 0.001);
      expect(d).toBeLessThanOrEqual(GREENERY_OUTER_RADIUS + 0.001);
    }
  });

  it("excludes a safe band around every zone centre", () => {
    const centers = zoneCenters();
    const all = [
      ...ISLAND_GREENERY.tufts.map((t) => t.position),
      ...ISLAND_GREENERY.flowers.map((f) => f.position)
    ];
    for (const [x, z] of all) {
      for (const [cx, cz] of centers) {
        const dx = x - cx;
        const dz = z - cz;
        // Zone clearance in the helper is sqrt(4.5) ~= 2.12.
        expect(Math.sqrt(dx * dx + dz * dz)).toBeGreaterThan(2.1);
      }
    }
  });

  it("excludes a small band around every character slot", () => {
    const centers = zoneCenters();
    const slots: Array<[number, number]> = [];
    for (const [cx, cz] of centers) {
      for (const slot of allSlotPositions([cx, 0, cz])) {
        slots.push([slot[0], slot[2]]);
      }
    }
    const all = [
      ...ISLAND_GREENERY.tufts.map((t) => t.position),
      ...ISLAND_GREENERY.flowers.map((f) => f.position)
    ];
    for (const [x, z] of all) {
      for (const [sx, sz] of slots) {
        const dx = x - sx;
        const dz = z - sz;
        expect(Math.sqrt(dx * dx + dz * dz)).toBeGreaterThan(0.95);
      }
    }
  });

  it("uses in-range palette indices and positive sizes", () => {
    for (const t of ISLAND_GREENERY.tufts) {
      expect(t.colorIndex).toBeGreaterThanOrEqual(0);
      expect(t.colorIndex).toBeLessThan(GRASS_COLORS.length);
      expect(t.heightScale).toBeGreaterThan(0);
    }
    for (const f of ISLAND_GREENERY.flowers) {
      expect(f.colorIndex).toBeGreaterThanOrEqual(0);
      expect(f.colorIndex).toBeLessThan(FLOWER_COLORS.length);
      expect(f.stemHeight).toBeGreaterThan(0);
    }
  });
});
