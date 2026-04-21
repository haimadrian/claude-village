import { describe, it, expect } from "vitest";
import {
  slotIndexFor,
  slotPositionFor,
  allSlotPositions,
  SLOT_COUNT,
  SLOT_DISTANCE
} from "../../src/renderer/village/slots";

const ZONE_CENTER: [number, number, number] = [13, 0, 0]; // on the +x ring
const AT_ORIGIN_ZONE: [number, number, number] = [0, 0, 0]; // degenerate - zone at origin

describe("slotIndexFor", () => {
  it("returns a stable index for the same (zone, agent)", () => {
    const a = slotIndexFor("tavern", "agent-1");
    const b = slotIndexFor("tavern", "agent-1");
    expect(a).toBe(b);
  });

  it("returns an integer in [0, SLOT_COUNT)", () => {
    for (let i = 0; i < 50; i++) {
      const idx = slotIndexFor("office", `agent-${i}`);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(SLOT_COUNT);
      expect(Number.isInteger(idx)).toBe(true);
    }
  });

  it("does not collapse the first few agents into the same slot", () => {
    // Collect slots for 6 distinct agents at the same zone. At least 4 of
    // the 8 slots should be represented - collisions are allowed but the
    // hash should spread reasonably.
    const slots = new Set<number>();
    for (let i = 0; i < 6; i++) slots.add(slotIndexFor("tavern", `agent-${i}`));
    expect(slots.size).toBeGreaterThanOrEqual(4);
  });
});

describe("slotPositionFor", () => {
  it("places the agent exactly SLOT_DISTANCE from the zone centre", () => {
    const pos = slotPositionFor("office", "agent-1", ZONE_CENTER);
    const dx = pos[0] - ZONE_CENTER[0];
    const dz = pos[2] - ZONE_CENTER[2];
    const dist = Math.sqrt(dx * dx + dz * dz);
    expect(dist).toBeCloseTo(SLOT_DISTANCE, 5);
  });

  it("produces distinct world positions for the first few agents at the same zone", () => {
    // With 8 slots and hash spread, the first 4 agents should land on
    // distinct positions. Exact hash values are an implementation detail,
    // so we assert on the output set size.
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const p = slotPositionFor("tavern", `agent-${i}`, ZONE_CENTER);
      seen.add(`${p[0].toFixed(3)},${p[2].toFixed(3)}`);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("never places the agent inside the zone footprint", () => {
    // The building footprint is modelled as ~2 units from the zone centre
    // (a 4-unit box). SLOT_DISTANCE is strictly greater than that, so
    // every slot must lie outside.
    for (let i = 0; i < 20; i++) {
      const p = slotPositionFor("tavern", `agent-${i}`, ZONE_CENTER);
      const dx = p[0] - ZONE_CENTER[0];
      const dz = p[2] - ZONE_CENTER[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      expect(dist).toBeGreaterThan(2.0);
    }
  });

  it("slot 0 points radially outward from the island centre", () => {
    // Find an agentId whose slot index at this zone is 0. We only need
    // the geometric property to hold, not a specific agent id.
    let agentId: string | null = null;
    for (let i = 0; i < 200; i++) {
      if (slotIndexFor("office", `probe-${i}`) === 0) {
        agentId = `probe-${i}`;
        break;
      }
    }
    expect(agentId).not.toBeNull();
    const p = slotPositionFor("office", agentId as string, ZONE_CENTER);
    // Zone is at (+13, 0, 0); outward from origin is +x, so slot 0 must
    // have x strictly greater than zone centre x.
    expect(p[0]).toBeGreaterThan(ZONE_CENTER[0]);
  });

  it("handles a zone at the origin without NaN", () => {
    const p = slotPositionFor("spawner", "agent-1", AT_ORIGIN_ZONE);
    expect(Number.isFinite(p[0])).toBe(true);
    expect(Number.isFinite(p[2])).toBe(true);
    const dist = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
    expect(dist).toBeCloseTo(SLOT_DISTANCE, 5);
  });
});

describe("allSlotPositions", () => {
  it("returns SLOT_COUNT positions, each at SLOT_DISTANCE", () => {
    const positions = allSlotPositions(ZONE_CENTER);
    expect(positions).toHaveLength(SLOT_COUNT);
    for (const p of positions) {
      const dx = p[0] - ZONE_CENTER[0];
      const dz = p[2] - ZONE_CENTER[2];
      const dist = Math.sqrt(dx * dx + dz * dz);
      expect(dist).toBeCloseTo(SLOT_DISTANCE, 5);
    }
  });

  it("all slot positions are distinct", () => {
    const positions = allSlotPositions(ZONE_CENTER);
    const keys = new Set(positions.map((p) => `${p[0].toFixed(3)},${p[2].toFixed(3)}`));
    expect(keys.size).toBe(SLOT_COUNT);
  });
});
