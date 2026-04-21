import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_IDLE_BEFORE_GHOST_MINUTES,
  MAX_IDLE_BEFORE_GHOST_MINUTES,
  MIN_IDLE_BEFORE_GHOST_MINUTES,
  defaultUserSettings,
  mergeUserSettings,
  parseUserSettings,
  readUserSettings,
  writeUserSettingsAtomic
} from "../../src/main/user-settings";

// Pure helpers first. These never touch disk so they can be asserted with
// plain JS values; the filesystem layer is exercised separately below.

describe("parseUserSettings", () => {
  it("returns defaults for non-object input", () => {
    expect(parseUserSettings(undefined)).toEqual(defaultUserSettings());
    expect(parseUserSettings(null)).toEqual(defaultUserSettings());
    expect(parseUserSettings(42)).toEqual(defaultUserSettings());
    expect(parseUserSettings("foo")).toEqual(defaultUserSettings());
  });

  it("uses default when idleBeforeGhostMinutes is missing", () => {
    expect(parseUserSettings({})).toEqual({
      idleBeforeGhostMinutes: DEFAULT_IDLE_BEFORE_GHOST_MINUTES
    });
  });

  it("accepts an in-range integer", () => {
    expect(parseUserSettings({ idleBeforeGhostMinutes: 7 })).toEqual({
      idleBeforeGhostMinutes: 7
    });
    expect(parseUserSettings({ idleBeforeGhostMinutes: MIN_IDLE_BEFORE_GHOST_MINUTES })
    ).toEqual({ idleBeforeGhostMinutes: MIN_IDLE_BEFORE_GHOST_MINUTES });
    expect(parseUserSettings({ idleBeforeGhostMinutes: MAX_IDLE_BEFORE_GHOST_MINUTES })
    ).toEqual({ idleBeforeGhostMinutes: MAX_IDLE_BEFORE_GHOST_MINUTES });
  });

  it("falls back to default for out-of-range or non-integer values", () => {
    expect(parseUserSettings({ idleBeforeGhostMinutes: 0 }).idleBeforeGhostMinutes).toBe(
      DEFAULT_IDLE_BEFORE_GHOST_MINUTES
    );
    expect(
      parseUserSettings({ idleBeforeGhostMinutes: MAX_IDLE_BEFORE_GHOST_MINUTES + 1 })
        .idleBeforeGhostMinutes
    ).toBe(DEFAULT_IDLE_BEFORE_GHOST_MINUTES);
    expect(parseUserSettings({ idleBeforeGhostMinutes: 3.5 }).idleBeforeGhostMinutes).toBe(
      DEFAULT_IDLE_BEFORE_GHOST_MINUTES
    );
    expect(parseUserSettings({ idleBeforeGhostMinutes: "5" }).idleBeforeGhostMinutes).toBe(
      DEFAULT_IDLE_BEFORE_GHOST_MINUTES
    );
  });

  it("ignores unknown keys", () => {
    const parsed = parseUserSettings({ idleBeforeGhostMinutes: 10, somethingElse: true });
    expect(parsed).toEqual({ idleBeforeGhostMinutes: 10 });
  });
});

describe("mergeUserSettings", () => {
  it("returns a copy when patch is empty", () => {
    const base = { idleBeforeGhostMinutes: 5 };
    const merged = mergeUserSettings(base, {});
    expect(merged).toEqual(base);
    expect(merged).not.toBe(base);
  });

  it("overrides when patch has a valid value", () => {
    const merged = mergeUserSettings({ idleBeforeGhostMinutes: 5 }, {
      idleBeforeGhostMinutes: 12
    });
    expect(merged.idleBeforeGhostMinutes).toBe(12);
  });

  it("ignores an out-of-range patch value (keeps current)", () => {
    const merged = mergeUserSettings({ idleBeforeGhostMinutes: 5 }, {
      idleBeforeGhostMinutes: 0
    });
    expect(merged.idleBeforeGhostMinutes).toBe(5);
  });
});

// Filesystem layer. Every test uses an isolated tmp dir so parallel runs
// don't collide.

describe("readUserSettings / writeUserSettingsAtomic", () => {
  let tmpDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "cv-user-settings-"));
    settingsPath = path.join(tmpDir, "user-settings.json");
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("missing file returns defaults", async () => {
    const result = await readUserSettings(settingsPath);
    expect(result).toEqual(defaultUserSettings());
  });

  it("malformed JSON returns defaults", async () => {
    await fsp.writeFile(settingsPath, "{not json", "utf8");
    const result = await readUserSettings(settingsPath);
    expect(result).toEqual(defaultUserSettings());
  });

  it("out-of-range value falls back to default", async () => {
    await fsp.writeFile(
      settingsPath,
      JSON.stringify({ idleBeforeGhostMinutes: 999 }),
      "utf8"
    );
    const result = await readUserSettings(settingsPath);
    expect(result.idleBeforeGhostMinutes).toBe(DEFAULT_IDLE_BEFORE_GHOST_MINUTES);
  });

  it("write-then-read round-trips the value", async () => {
    await writeUserSettingsAtomic(settingsPath, { idleBeforeGhostMinutes: 17 });
    const result = await readUserSettings(settingsPath);
    expect(result.idleBeforeGhostMinutes).toBe(17);
  });

  it("atomic write leaves no leftover .tmp files on success", async () => {
    await writeUserSettingsAtomic(settingsPath, { idleBeforeGhostMinutes: 9 });
    const entries = await fsp.readdir(tmpDir);
    // Only the settings file itself; no stray `.user-settings.json.<pid>.tmp`
    // temp files from the atomic rename.
    expect(entries).toEqual(["user-settings.json"]);
  });

  it("write creates parent directories when missing", async () => {
    const nestedPath = path.join(tmpDir, "deeper", "dir", "user-settings.json");
    await writeUserSettingsAtomic(nestedPath, { idleBeforeGhostMinutes: 4 });
    expect(fs.existsSync(nestedPath)).toBe(true);
    const result = await readUserSettings(nestedPath);
    expect(result.idleBeforeGhostMinutes).toBe(4);
  });
});
