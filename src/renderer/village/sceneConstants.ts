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
