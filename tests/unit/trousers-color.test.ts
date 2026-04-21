import { describe, it, expect } from "vitest";
import { trousersColor, __test } from "../../src/renderer/village/appearance";

const HEX = /^#[0-9a-fA-F]{6}$/;

describe("trousersColor", () => {
  it("returns a valid 6-digit hex string from the palette", () => {
    const colour = trousersColor("agent-123");
    expect(colour).toMatch(HEX);
    expect(__test.TROUSERS_PALETTE).toContain(colour);
  });

  it("is deterministic for the same id", () => {
    expect(trousersColor("same-agent")).toBe(trousersColor("same-agent"));
    expect(trousersColor("another")).toBe(trousersColor("another"));
  });

  it("spreads a batch of ids across multiple palette buckets", () => {
    const ids = Array.from({ length: 50 }, (_, i) => `agent-${i}`);
    const picks = new Set(ids.map(trousersColor));
    // With 50 ids and a 5-colour palette we expect at least 3 distinct
    // buckets. Guards against a future regression where the hash collapses
    // to a single value.
    expect(picks.size).toBeGreaterThanOrEqual(3);
  });

  it("handles the empty string without throwing", () => {
    const colour = trousersColor("");
    expect(colour).toMatch(HEX);
  });
});
