import { describe, it, expect } from "vitest";
import {
  zoneModel,
  characterModel,
  allModelUrls,
  ZONE_MODEL_BASENAMES,
  CHARACTER_MODEL_BASENAMES
} from "../../src/renderer/village/assetMap";
import { ZONES } from "../../src/shared/zones";

/**
 * Pure-string assertions only. We can't exercise useGLTF or the real GLB
 * loader under vitest (no WebGL, no GLTFLoader support). What matters at
 * this layer is that the map returns a distinct, correctly-named URL for
 * every zone and character kind.
 */
describe("assetMap", () => {
  it("returns a GLB URL for every zone with the expected basename", () => {
    for (const zone of ZONES) {
      const url = zoneModel(zone.id);
      expect(url).toMatch(/\.glb$/);
      expect(url).toContain(ZONE_MODEL_BASENAMES[zone.id]);
    }
  });

  it("returns distinct URLs per zone", () => {
    const urls = ZONES.map((z) => zoneModel(z.id));
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("returns a GLB URL for every character kind with the expected basename", () => {
    for (const kind of ["mayor", "villager"] as const) {
      const url = characterModel(kind);
      expect(url).toMatch(/\.glb$/);
      expect(url).toContain(CHARACTER_MODEL_BASENAMES[kind]);
    }
  });

  it("allModelUrls lists every zone + character exactly once", () => {
    const urls = allModelUrls();
    expect(urls.length).toBe(ZONES.length + 2);
    expect(new Set(urls).size).toBe(urls.length);
    for (const zone of ZONES) {
      expect(urls.some((u) => u.endsWith(ZONE_MODEL_BASENAMES[zone.id]))).toBe(true);
    }
    expect(urls.some((u) => u.endsWith("character-mayor.glb"))).toBe(true);
    expect(urls.some((u) => u.endsWith("character-villager.glb"))).toBe(true);
  });
});
