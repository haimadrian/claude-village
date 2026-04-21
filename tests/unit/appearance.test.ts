import { describe, it, expect } from "vitest";
import { hairColor, shirtColorFor, __test } from "../../src/renderer/village/appearance";

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

describe("shirtColorFor", () => {
  it("returns the fixed mayor shirt colour for main agents, ignoring their hashed skinColor", () => {
    const mayor = { kind: "main" as const, skinColor: "#123456" };
    expect(shirtColorFor(mayor)).toBe(__test.MAYOR_SHIRT_COLOR);
    // Even if skinColor changes, the mayor shirt is stable.
    expect(shirtColorFor({ ...mayor, skinColor: "#abcdef" })).toBe(__test.MAYOR_SHIRT_COLOR);
  });

  it("returns the agent's hashed skinColor for subagents so they stay distinct", () => {
    const a = { kind: "subagent" as const, skinColor: "#112233" };
    const b = { kind: "subagent" as const, skinColor: "#445566" };
    expect(shirtColorFor(a)).toBe("#112233");
    expect(shirtColorFor(b)).toBe("#445566");
  });
});
