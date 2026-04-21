import { describe, it, expect } from "vitest";
import {
  isUnderwater,
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
