import { describe, it, expect } from "vitest";
import {
  generateSeabedLayout,
  seabedHeightAt,
  SEABED_LAYOUT,
  SEABED_INNER_RADIUS,
  ROCK_SHADES,
  SEAGRASS_COLORS,
  CORAL_COLORS,
  DEFAULT_ROCK_COUNT,
  DEFAULT_SEAGRASS_COUNT,
  DEFAULT_CORAL_COUNT
} from "../../src/renderer/village/seabedLayout";
import { SEABED_RADIUS } from "../../src/renderer/village/sceneConstants";

describe("generateSeabedLayout", () => {
  it("is deterministic for the same seed", () => {
    const a = generateSeabedLayout(10, 10, 10, 0xbeef);
    const b = generateSeabedLayout(10, 10, 10, 0xbeef);
    expect(a).toEqual(b);
  });

  it("produces the requested counts", () => {
    const l = generateSeabedLayout(5, 7, 3, 1);
    expect(l.rocks).toHaveLength(5);
    expect(l.seagrass).toHaveLength(7);
    expect(l.corals).toHaveLength(3);
  });

  it("default layout uses the default counts", () => {
    expect(SEABED_LAYOUT.rocks).toHaveLength(DEFAULT_ROCK_COUNT);
    expect(SEABED_LAYOUT.seagrass).toHaveLength(DEFAULT_SEAGRASS_COUNT);
    expect(SEABED_LAYOUT.corals).toHaveLength(DEFAULT_CORAL_COUNT);
  });

  it("keeps every decoration inside the seabed annulus", () => {
    const all: Array<[number, number]> = [
      ...SEABED_LAYOUT.rocks.map((r) => r.position),
      ...SEABED_LAYOUT.seagrass.map((s) => s.position),
      ...SEABED_LAYOUT.corals.map((c) => c.position)
    ];
    for (const [x, z] of all) {
      const d = Math.sqrt(x * x + z * z);
      expect(d).toBeGreaterThanOrEqual(SEABED_INNER_RADIUS - 0.001);
      expect(d).toBeLessThanOrEqual(SEABED_RADIUS + 0.001);
    }
  });

  it("uses in-range palette indices and positive sizes", () => {
    for (const r of SEABED_LAYOUT.rocks) {
      expect(r.shadeIndex).toBeGreaterThanOrEqual(0);
      expect(r.shadeIndex).toBeLessThan(ROCK_SHADES.length);
      expect(r.scale[0]).toBeGreaterThan(0);
      expect(r.scale[1]).toBeGreaterThan(0);
      expect(r.scale[2]).toBeGreaterThan(0);
    }
    for (const c of SEABED_LAYOUT.corals) {
      expect(c.colorIndex).toBeGreaterThanOrEqual(0);
      expect(c.colorIndex).toBeLessThan(CORAL_COLORS.length);
      expect(c.scale).toBeGreaterThan(0);
      expect([0, 1, 2]).toContain(c.shape);
    }
    for (const s of SEABED_LAYOUT.seagrass) {
      expect(s.colorIndex).toBeGreaterThanOrEqual(0);
      expect(s.colorIndex).toBeLessThan(SEAGRASS_COLORS.length);
      expect(s.blades.length).toBeGreaterThanOrEqual(3);
      expect(s.blades.length).toBeLessThanOrEqual(5);
      for (const b of s.blades) {
        expect(b.height).toBeGreaterThan(0);
      }
    }
  });
});

describe("seabedHeightAt", () => {
  it("is deterministic", () => {
    expect(seabedHeightAt(1, 2)).toEqual(seabedHeightAt(1, 2));
    expect(seabedHeightAt(-5, 7.3)).toEqual(seabedHeightAt(-5, 7.3));
  });

  it("stays within a bounded range for sampled points", () => {
    for (let x = -50; x <= 50; x += 5) {
      for (let z = -50; z <= 50; z += 5) {
        const h = seabedHeightAt(x, z);
        // Sum of sinusoids with amplitudes 0.8 + 0.7 + 0.5 + 0.6 = 2.6 max.
        expect(Math.abs(h)).toBeLessThanOrEqual(2.7);
      }
    }
  });
});
