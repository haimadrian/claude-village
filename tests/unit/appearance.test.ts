import { describe, it, expect } from "vitest";
import { hairColor, __test } from "../../src/renderer/village/appearance";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("hairColor", () => {
  it("returns a valid 6-digit hex string from the palette", () => {
    const colour = hairColor("agent-123");
    expect(colour).toMatch(HEX);
    expect(__test.HAIR_PALETTE).toContain(colour);
  });

  it("is deterministic for the same id", () => {
    expect(hairColor("same-agent")).toBe(hairColor("same-agent"));
    expect(hairColor("another")).toBe(hairColor("another"));
  });

  it("spreads a batch of ids across multiple palette buckets", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `agent-${i}`);
    const picks = new Set(ids.map(hairColor));
    // With 50 ids and a 5-colour palette we expect at least 3 distinct buckets.
    // This protects against a future regression where the hash collapses to
    // a single value (e.g. someone breaks stringHash and returns 0).
    expect(picks.size).toBeGreaterThanOrEqual(3);
  });

  it("handles the empty string without throwing", () => {
    const colour = hairColor("");
    expect(colour).toMatch(HEX);
  });
});
