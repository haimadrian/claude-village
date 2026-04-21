import { ZONES, type ZoneId } from "../../shared/zones";

/**
 * Characters no longer stand on the zone centre (where the building sits and
 * visually occludes them). Each zone has a small number of discrete
 * "slot" offsets arranged just outside the building footprint. An agent
 * hashes its id into a slot so multiple agents at the same zone fan out
 * instead of piling on top of each other.
 *
 * Slot 0 points radially outward from the island centre - the natural
 * "front" of the zone. The remaining slots rotate around the zone so
 * agents always stand on the visible side of the building, never inside
 * it, and never sharing the same cell unless more than `SLOT_COUNT`
 * agents are at the same zone.
 */

/** Distance from zone centre to a character slot, in world units. */
export const SLOT_DISTANCE = 2.75;

/** Number of distinct slots per zone. */
export const SLOT_COUNT = 8;

/**
 * Deterministic, non-cryptographic hash. We only need a stable integer
 * per agent id so slot assignment is repeatable across re-renders.
 */
function hashAgentId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * Unit vector pointing from the island centre (0,0) to the zone at
 * `zoneCenter`. If the zone is at the origin (defensive - should never
 * happen in practice), fall back to +x.
 */
function outwardDirection(zoneCenter: [number, number, number]): { x: number; z: number } {
  const [cx, , cz] = zoneCenter;
  const mag = Math.sqrt(cx * cx + cz * cz);
  if (mag === 0) return { x: 1, z: 0 };
  return { x: cx / mag, z: cz / mag };
}

/**
 * Return the slot index for a given agent at a given zone. Deterministic
 * and range-bounded to [0, SLOT_COUNT).
 */
export function slotIndexFor(zoneId: ZoneId | string, agentId: string): number {
  // Mix the zoneId in so the same agent lands on a different slot across
  // different zones - otherwise every zone would cluster identical
  // agent-id slot numbers in the same relative orientation.
  return hashAgentId(`${zoneId}:${agentId}`) % SLOT_COUNT;
}

/**
 * Compute the world-space slot position for `agentId` at `zoneCenter`.
 * Slot 0 is directly outward (away from the island centre); remaining
 * slots rotate around the zone by `2PI / SLOT_COUNT` each. All slots sit
 * exactly `SLOT_DISTANCE` units from the zone centre.
 */
export function slotPositionFor(
  zoneId: ZoneId | string,
  agentId: string,
  zoneCenter: [number, number, number]
): [number, number, number] {
  const idx = slotIndexFor(zoneId, agentId);
  const outward = outwardDirection(zoneCenter);
  // Base angle points outward, then we rotate by `idx * 2PI / SLOT_COUNT`.
  const baseAngle = Math.atan2(outward.z, outward.x);
  const angle = baseAngle + (idx * Math.PI * 2) / SLOT_COUNT;
  const x = zoneCenter[0] + Math.cos(angle) * SLOT_DISTANCE;
  const z = zoneCenter[2] + Math.sin(angle) * SLOT_DISTANCE;
  return [x, zoneCenter[1], z];
}

/**
 * All possible slot positions for a given zone. Mainly used by the
 * pathfinding grid so that no slot cell is blocked by the zone footprint.
 */
export function allSlotPositions(
  zoneCenter: [number, number, number]
): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const outward = outwardDirection(zoneCenter);
  const baseAngle = Math.atan2(outward.z, outward.x);
  for (let i = 0; i < SLOT_COUNT; i++) {
    const angle = baseAngle + (i * Math.PI * 2) / SLOT_COUNT;
    const x = zoneCenter[0] + Math.cos(angle) * SLOT_DISTANCE;
    const z = zoneCenter[2] + Math.sin(angle) * SLOT_DISTANCE;
    out.push([x, zoneCenter[1], z]);
  }
  return out;
}

/** Typed convenience: list of zone ids in a stable order. */
export const ZONE_IDS: readonly ZoneId[] = ZONES.map((z) => z.id);
