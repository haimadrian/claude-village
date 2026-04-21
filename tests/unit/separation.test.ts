import { describe, it, expect } from "vitest";
import { computeSeparation } from "../../src/renderer/village/separation";

const opts = { radius: 0.8, strength: 3, maxStep: 2 };

describe("computeSeparation", () => {
  it("returns zero when no neighbours are in range", () => {
    const r = computeSeparation({ x: 0, z: 0 }, [{ x: 5, z: 5 }], opts);
    expect(r).toEqual({ x: 0, z: 0 });
  });

  it("returns zero with no neighbours at all", () => {
    const r = computeSeparation({ x: 0, z: 0 }, [], opts);
    expect(r).toEqual({ x: 0, z: 0 });
  });

  it("pushes away from a single close neighbour along the axis of separation", () => {
    // Neighbour at (0.3, 0) is well inside the 0.8 radius; self is at origin.
    // Expected push direction is -x (self pushed away from positive-x neighbour).
    const r = computeSeparation({ x: 0, z: 0 }, [{ x: 0.3, z: 0 }], opts);
    expect(r.x).toBeLessThan(0);
    expect(r.z).toBeCloseTo(0);
    expect(Math.abs(r.x)).toBeLessThanOrEqual(opts.maxStep);
  });

  it("pushes harder when the neighbour is closer (linear falloff)", () => {
    const close = computeSeparation({ x: 0, z: 0 }, [{ x: 0.1, z: 0 }], opts);
    const far = computeSeparation({ x: 0, z: 0 }, [{ x: 0.7, z: 0 }], opts);
    expect(Math.abs(close.x)).toBeGreaterThan(Math.abs(far.x));
  });

  it("sums pushes from multiple neighbours", () => {
    // Two neighbours on +x and +z each push the agent in -x and -z respectively.
    const r = computeSeparation(
      { x: 0, z: 0 },
      [
        { x: 0.3, z: 0 },
        { x: 0, z: 0.3 }
      ],
      opts
    );
    expect(r.x).toBeLessThan(0);
    expect(r.z).toBeLessThan(0);
  });

  it("clamps total displacement to maxStep", () => {
    // Many very-close neighbours in the same direction would otherwise produce
    // an enormous push. The clamp keeps it bounded.
    const neighbours = Array.from({ length: 20 }, () => ({ x: 0.01, z: 0 }));
    const r = computeSeparation({ x: 0, z: 0 }, neighbours, opts);
    const mag = Math.sqrt(r.x * r.x + r.z * r.z);
    expect(mag).toBeLessThanOrEqual(opts.maxStep + 1e-9);
  });

  it("separates agents stacked exactly on top of each other deterministically", () => {
    // Zero-distance overlap is a degenerate case - we must still produce a
    // non-zero push so two agents spawned on the same cell don't freeze in
    // place.
    const r = computeSeparation({ x: 0, z: 0 }, [{ x: 0, z: 0 }], opts);
    expect(r.x).not.toBe(0);
  });
});
