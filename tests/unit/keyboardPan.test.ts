import { describe, it, expect } from "vitest";
import {
  PAN_SPEED,
  panDeltaForKeys,
  dollyDeltaForKeys
} from "../../src/renderer/village/useKeyboardPan";

/**
 * Pure math tests for the keyboard-pan helper. We do not exercise the
 * React / three.js side (that would need a full Canvas) - just the
 * vector math that decides how the orbit target moves each frame.
 */
describe("panDeltaForKeys", () => {
  // A camera looking toward -z (classic "north") has forward = (0, 0, -1)
  // when projected onto xz. ArrowUp with this forward should move the
  // target in -z (away from the camera along its look direction).
  const FORWARD_NORTH = { x: 0, z: -1 };

  it("returns zero when no keys are pressed", () => {
    const d = panDeltaForKeys(new Set(), FORWARD_NORTH, PAN_SPEED, 0.016);
    expect(d).toEqual({ dx: 0, dz: 0 });
  });

  it("ArrowUp moves the target along the camera-forward axis", () => {
    const d = panDeltaForKeys(new Set(["ArrowUp"]), FORWARD_NORTH, PAN_SPEED, 1);
    expect(d.dx).toBeCloseTo(0);
    expect(d.dz).toBeCloseTo(-PAN_SPEED);
  });

  it("ArrowDown moves the target opposite camera-forward", () => {
    const d = panDeltaForKeys(new Set(["ArrowDown"]), FORWARD_NORTH, PAN_SPEED, 1);
    expect(d.dx).toBeCloseTo(0);
    expect(d.dz).toBeCloseTo(PAN_SPEED);
  });

  it("ArrowRight moves perpendicular to forward (camera-right)", () => {
    // Right of north-facing camera is +x in world space (right-hand rule).
    const d = panDeltaForKeys(new Set(["ArrowRight"]), FORWARD_NORTH, PAN_SPEED, 1);
    expect(d.dx).toBeCloseTo(-PAN_SPEED);
    expect(d.dz).toBeCloseTo(0);
  });

  it("ArrowLeft moves opposite camera-right", () => {
    const d = panDeltaForKeys(new Set(["ArrowLeft"]), FORWARD_NORTH, PAN_SPEED, 1);
    expect(d.dx).toBeCloseTo(PAN_SPEED);
    expect(d.dz).toBeCloseTo(0);
  });

  it("diagonal (Up+Right) is normalised to the same total speed", () => {
    const d = panDeltaForKeys(new Set(["ArrowUp", "ArrowRight"]), FORWARD_NORTH, PAN_SPEED, 1);
    const mag = Math.hypot(d.dx, d.dz);
    expect(mag).toBeCloseTo(PAN_SPEED, 3);
  });

  it("opposite keys cancel out to zero", () => {
    const d = panDeltaForKeys(new Set(["ArrowUp", "ArrowDown"]), FORWARD_NORTH, PAN_SPEED, 1);
    expect(d.dx).toBeCloseTo(0);
    expect(d.dz).toBeCloseTo(0);
  });

  it("scales linearly with dt", () => {
    const small = panDeltaForKeys(new Set(["ArrowUp"]), FORWARD_NORTH, PAN_SPEED, 0.1);
    const big = panDeltaForKeys(new Set(["ArrowUp"]), FORWARD_NORTH, PAN_SPEED, 1.0);
    expect(Math.abs(big.dz)).toBeCloseTo(Math.abs(small.dz) * 10, 3);
  });

  it("rotates with the forward vector (east-facing camera)", () => {
    // Camera now looking toward +x. ArrowUp should push target in +x.
    const east = { x: 1, z: 0 };
    const d = panDeltaForKeys(new Set(["ArrowUp"]), east, PAN_SPEED, 1);
    expect(d.dx).toBeCloseTo(PAN_SPEED);
    expect(d.dz).toBeCloseTo(0);
  });

  it("handles a degenerate (zero-length) forward vector by falling back to +z", () => {
    const d = panDeltaForKeys(new Set(["ArrowUp"]), { x: 0, z: 0 }, PAN_SPEED, 1);
    // Should not NaN or blow up; magnitude stays at PAN_SPEED.
    expect(Number.isFinite(d.dx)).toBe(true);
    expect(Number.isFinite(d.dz)).toBe(true);
    expect(Math.hypot(d.dx, d.dz)).toBeCloseTo(PAN_SPEED);
  });
});

describe("dollyDeltaForKeys", () => {
  it("returns zero when no dolly keys are pressed", () => {
    expect(dollyDeltaForKeys(new Set(), 4, 1)).toBe(0);
    expect(dollyDeltaForKeys(new Set(["ArrowUp"]), 4, 1)).toBe(0);
  });

  it("+/= keys dolly in (negative, toward target)", () => {
    expect(dollyDeltaForKeys(new Set(["+"]), 4, 1)).toBe(-4);
    expect(dollyDeltaForKeys(new Set(["="]), 4, 1)).toBe(-4);
    expect(dollyDeltaForKeys(new Set(["PageUp"]), 4, 1)).toBe(-4);
  });

  it("-/_ keys dolly out (positive, away from target)", () => {
    expect(dollyDeltaForKeys(new Set(["-"]), 4, 1)).toBe(4);
    expect(dollyDeltaForKeys(new Set(["_"]), 4, 1)).toBe(4);
    expect(dollyDeltaForKeys(new Set(["PageDown"]), 4, 1)).toBe(4);
  });

  it("opposite dolly keys cancel", () => {
    expect(dollyDeltaForKeys(new Set(["+", "-"]), 4, 1)).toBe(0);
  });
});
