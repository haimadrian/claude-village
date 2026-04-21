/**
 * Scene-level constants shared across VillageScene and its satellite
 * modules (minorIslands, Boat, tests). Keeping them in a single module
 * avoids an import cycle where VillageScene would import from a module
 * that also imports from VillageScene.
 */

/** Radius of the zone ring (zones placed on a circle of this radius). */
export const ZONE_RING_RADIUS = 13;

/** Radius of the main (central) grass island. */
export const MAIN_ISLAND_RADIUS = ZONE_RING_RADIUS + 5;

/** Walkable grid resolution (cells per side). */
export const GRID_SIZE = 48;

/**
 * Height of the main island cylinder. Pushed well below the water
 * surface so the camera can dive and see solid land above the seabed
 * rather than an empty void.
 */
export const MAIN_ISLAND_HEIGHT = 14;

/**
 * World-space y of the seabed plane (ocean floor). Deep enough that
 * the water column has real volume for fish to swim in.
 */
export const SEABED_Y = -18;

/** Radius of the seabed disc (also the scatter area for rocks/corals). */
export const SEABED_RADIUS = 100;

/**
 * Camera y threshold below which the scene is considered "underwater".
 * Matches `FishSchool`'s internal gate so the fish school and the
 * underwater atmosphere toggle together on the exact same frame.
 */
export const UNDERWATER_CAMERA_Y = -0.2;

/**
 * Fog + background colour used while the camera is underwater. A deep
 * teal-blue that reads as "ocean depth" rather than "night sky".
 */
export const UNDERWATER_COLOR = 0x0a3a6b;

/**
 * Exponential fog density underwater. FogExp2 attenuates by
 * exp(-(density * distance)^2), so 0.06 opened to ~90 percent fog at
 * 30 units - far too thick, the seabed's flowers and stones became
 * unreadable on a deep dive. 0.022 keeps a noticeable blue tint close
 * up, lets the seabed at ~30 units stay clearly visible, and still
 * blurs distant minor-island trunks past 60 units.
 */
export const UNDERWATER_FOG_DENSITY = 0.022;

/**
 * Pure helper for tests and callers that want to classify a camera
 * height without pulling in three.js. Mirrors the inline check used in
 * `UnderwaterAtmosphere` and `FishSchool`.
 */
export function isUnderwater(cameraY: number, threshold: number = UNDERWATER_CAMERA_Y): boolean {
  return cameraY < threshold;
}

/**
 * Refined underwater classification used by `UnderwaterAtmosphere`.
 * A camera that is below the water-line threshold but still sits over
 * the main island footprint is NOT considered "underwater" - it is
 * just zoomed in tight against the island surface, and flipping the
 * scene into underwater mode there would hide the sky dome while
 * leaving the island in view, producing a bright/washed-out frame.
 *
 * We only treat the view as underwater when the camera is also outside
 * the main island's horizontal footprint (so the camera is actually
 * over the ocean). A small tolerance keeps the transition smooth when
 * the user pans across the island edge.
 */
export function isUnderwaterView(
  cameraX: number,
  cameraY: number,
  cameraZ: number,
  threshold: number = UNDERWATER_CAMERA_Y,
  islandRadius: number = MAIN_ISLAND_RADIUS
): boolean {
  if (cameraY >= threshold) return false;
  const horizontal = Math.hypot(cameraX, cameraZ);
  // A 10% tolerance past the island rim avoids flicker when the user
  // pans the camera right along the shoreline.
  return horizontal > islandRadius * 1.1;
}
