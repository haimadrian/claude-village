import { describe, it, expect } from "vitest";
import {
  isUnderwater,
  isUnderwaterView,
  MAIN_ISLAND_RADIUS,
  UNDERWATER_CAMERA_Y
} from "../../src/renderer/village/sceneConstants";

describe("isUnderwater", () => {
  it("returns true when cameraY is below the default threshold", () => {
    expect(isUnderwater(-5)).toBe(true);
  });

  it("returns false when cameraY is above the default threshold", () => {
    expect(isUnderwater(10)).toBe(false);
  });

  it("treats the exact threshold as NOT underwater (strict <)", () => {
    expect(isUnderwater(UNDERWATER_CAMERA_Y)).toBe(false);
  });
});

describe("isUnderwaterView", () => {
  it("is true only when cameraY is below the threshold AND the camera is past the island rim", () => {
    // Below threshold and well outside the island (far to the east): true.
    expect(isUnderwaterView(40, -5, 0)).toBe(true);
  });

  it("returns false when camera is below the waterline but still over the island footprint", () => {
    // A tight zoom toward the centre with cameraY just below threshold
    // must NOT trigger underwater - this is the regression guard for
    // the zoom-to-white-screen bug.
    expect(isUnderwaterView(0, -5, 0)).toBe(false);
    expect(isUnderwaterView(MAIN_ISLAND_RADIUS * 0.5, -1, MAIN_ISLAND_RADIUS * 0.5)).toBe(false);
  });

  it("returns false whenever cameraY is above the waterline, regardless of xz", () => {
    expect(isUnderwaterView(100, 5, 100)).toBe(false);
    expect(isUnderwaterView(0, 0, 0)).toBe(false);
  });
});
