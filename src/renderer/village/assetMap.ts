import type { ZoneId } from "../../shared/zones";

/**
 * Tier 2 asset map. Resolves the bundled GLB URL for each zone building and
 * character kind. Uses `new URL(..., import.meta.url)` so Vite picks the
 * files up at build time and emits them into the renderer asset pipeline;
 * at runtime this yields a file:// or blob: URL that `useGLTF` can load
 * without touching the network.
 *
 * Swapping placeholder GLBs for real Kenney GLBs is a matter of replacing
 * the files under ../assets/models/ - no code change required.
 */

export type CharacterKind = "mayor" | "villager";

function zoneUrl(id: ZoneId): string {
  // We intentionally list each zone explicitly rather than build the path
  // with string concatenation. Vite's asset graph only picks up `new URL(...)`
  // calls whose argument is a literal string, so we cannot template this.
  switch (id) {
    case "office":
      return new URL("../assets/models/zone-office.glb", import.meta.url).href;
    case "library":
      return new URL("../assets/models/zone-library.glb", import.meta.url).href;
    case "mine":
      return new URL("../assets/models/zone-mine.glb", import.meta.url).href;
    case "forest":
      return new URL("../assets/models/zone-forest.glb", import.meta.url).href;
    case "farm":
      return new URL("../assets/models/zone-farm.glb", import.meta.url).href;
    case "nether":
      return new URL("../assets/models/zone-nether.glb", import.meta.url).href;
    case "signpost":
      return new URL("../assets/models/zone-signpost.glb", import.meta.url).href;
    case "spawner":
      return new URL("../assets/models/zone-spawner.glb", import.meta.url).href;
    case "tavern":
      return new URL("../assets/models/zone-tavern.glb", import.meta.url).href;
    default: {
      // Exhaustiveness check - if ZoneId ever gains a new variant, TS errors
      // here and forces us to add the matching asset.
      const _exhaustive: never = id;
      throw new Error(`no zone model for id: ${String(_exhaustive)}`);
    }
  }
}

function characterUrl(kind: CharacterKind): string {
  switch (kind) {
    case "mayor":
      return new URL("../assets/models/character-mayor.glb", import.meta.url).href;
    case "villager":
      return new URL("../assets/models/character-villager.glb", import.meta.url).href;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`no character model for kind: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Public: fetch the GLB URL for a zone building.
 */
export function zoneModel(id: ZoneId): string {
  return zoneUrl(id);
}

/**
 * Public: fetch the GLB URL for a character.
 */
export function characterModel(kind: CharacterKind): string {
  return characterUrl(kind);
}

/**
 * The full list of bundled model URLs. Consumed by useGLTF.preload at app
 * startup so the first scene render doesn't stutter while loading every
 * building at once.
 */
export function allModelUrls(): string[] {
  const zoneIds: ZoneId[] = [
    "office",
    "library",
    "mine",
    "forest",
    "farm",
    "nether",
    "signpost",
    "spawner",
    "tavern"
  ];
  const characterKinds: CharacterKind[] = ["mayor", "villager"];
  return [...zoneIds.map(zoneUrl), ...characterKinds.map(characterUrl)];
}

/**
 * Stable string keys used purely for asset-mapping unit tests. These are the
 * canonical filenames; we compare the .href suffix against them to avoid
 * depending on the runtime URL base (which differs between dev, test and
 * prod bundlers).
 */
export const ZONE_MODEL_BASENAMES: Record<ZoneId, string> = {
  office: "zone-office.glb",
  library: "zone-library.glb",
  mine: "zone-mine.glb",
  forest: "zone-forest.glb",
  farm: "zone-farm.glb",
  nether: "zone-nether.glb",
  signpost: "zone-signpost.glb",
  spawner: "zone-spawner.glb",
  tavern: "zone-tavern.glb"
};

export const CHARACTER_MODEL_BASENAMES: Record<CharacterKind, string> = {
  mayor: "character-mayor.glb",
  villager: "character-villager.glb"
};
