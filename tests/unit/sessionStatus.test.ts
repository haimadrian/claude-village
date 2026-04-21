import { describe, it, expect } from "vitest";
import { deriveStatus, ACTIVE_MS, IDLE_MS } from "../../src/renderer/sessionStatus";

describe("deriveStatus", () => {
  const now = 1_700_000_000_000;

  it("returns 'ended' when the stored status is already ended", () => {
    expect(deriveStatus({ status: "ended", lastActivityAt: now }, now)).toBe("ended");
  });

  it("returns 'active' when activity is within ACTIVE_MS", () => {
    const s = { status: "active" as const, lastActivityAt: now - (ACTIVE_MS - 1) };
    expect(deriveStatus(s, now)).toBe("active");
  });

  it("returns 'idle' when activity is between ACTIVE_MS and IDLE_MS", () => {
    const s = { status: "active" as const, lastActivityAt: now - (ACTIVE_MS + 1000) };
    expect(deriveStatus(s, now)).toBe("idle");
  });

  it("returns 'ended' when activity is older than IDLE_MS", () => {
    const s = { status: "active" as const, lastActivityAt: now - (IDLE_MS + 1) };
    expect(deriveStatus(s, now)).toBe("ended");
  });

  it("ignores stored 'idle' and still classifies by age", () => {
    // Store occasionally keeps "active"/"idle" loosely; derivation is the
    // source of truth for display.
    const s = { status: "idle" as const, lastActivityAt: now - 1000 };
    expect(deriveStatus(s, now)).toBe("active");
  });
});
