import fsp from "node:fs/promises";
import path from "node:path";
import { logger } from "./logger";

/**
 * Persistent user preferences for claude-village.
 *
 * Currently a single knob: how many minutes an agent can stay idle before it
 * turns into a ghost. Persisted to `{app userData}/user-settings.json` so a
 * relaunch keeps the user's choice. Shape is deliberately small and
 * forward-compatible: unknown keys are ignored on read, and defaults fill in
 * anything missing so a partially-corrupt file never crashes the app.
 *
 * Pure helpers (`parseUserSettings`, `mergeUserSettings`) live here without
 * any I/O coupling so they are trivially unit-testable. The filesystem
 * wrappers (`readUserSettings`, `writeUserSettingsAtomic`) use the same
 * atomic temp-file + rename pattern as `hook-installer.ts` so a crash
 * mid-write never corrupts the file.
 */

export const DEFAULT_IDLE_BEFORE_GHOST_MINUTES = 3;
export const MIN_IDLE_BEFORE_GHOST_MINUTES = 1;
export const MAX_IDLE_BEFORE_GHOST_MINUTES = 60;

export interface UserSettings {
  idleBeforeGhostMinutes: number;
}

export function defaultUserSettings(): UserSettings {
  return { idleBeforeGhostMinutes: DEFAULT_IDLE_BEFORE_GHOST_MINUTES };
}

function isIntegerInRange(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

/**
 * Parse an arbitrary JS value into a valid `UserSettings`, falling back to
 * defaults for any missing or malformed field. Never throws: bad inputs
 * silently become the default so boot never fails on a corrupt file.
 */
export function parseUserSettings(input: unknown): UserSettings {
  const out = defaultUserSettings();
  if (!input || typeof input !== "object") return out;
  const obj = input as Record<string, unknown>;
  const n = obj.idleBeforeGhostMinutes;
  if (isIntegerInRange(n, MIN_IDLE_BEFORE_GHOST_MINUTES, MAX_IDLE_BEFORE_GHOST_MINUTES)) {
    out.idleBeforeGhostMinutes = n;
  }
  return out;
}

/**
 * Merge a patch into an existing settings object, keeping any fields the
 * patch does not supply. Range-validates `idleBeforeGhostMinutes` so callers
 * (e.g. the IPC write handler) cannot store an out-of-range value even if
 * the renderer validation is bypassed.
 */
export function mergeUserSettings(
  current: UserSettings,
  patch: Partial<UserSettings>
): UserSettings {
  const next: UserSettings = { ...current };
  if (patch.idleBeforeGhostMinutes !== undefined) {
    if (
      isIntegerInRange(
        patch.idleBeforeGhostMinutes,
        MIN_IDLE_BEFORE_GHOST_MINUTES,
        MAX_IDLE_BEFORE_GHOST_MINUTES
      )
    ) {
      next.idleBeforeGhostMinutes = patch.idleBeforeGhostMinutes;
    }
  }
  return next;
}

/**
 * Read `settingsPath`, returning a fully-populated `UserSettings`. Missing
 * file or malformed JSON yields defaults without throwing - first-run and
 * corrupt-file cases both resolve to a clean default rather than crashing.
 */
export async function readUserSettings(settingsPath: string): Promise<UserSettings> {
  let text = "";
  try {
    text = await fsp.readFile(settingsPath, "utf8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return defaultUserSettings();
    logger.warn("user-settings: read failed, using defaults", {
      settingsPath,
      message: e.message
    });
    return defaultUserSettings();
  }
  if (text.trim() === "") return defaultUserSettings();
  try {
    const parsed: unknown = JSON.parse(text);
    return parseUserSettings(parsed);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.warn("user-settings: JSON parse failed, using defaults", {
      settingsPath,
      message: e.message
    });
    return defaultUserSettings();
  }
}

/**
 * Atomic write: write to a sibling temp file in the same directory, then
 * rename. Rename is atomic within a filesystem on POSIX, so readers never
 * see a half-written file. Uses mode 0o600 so the file is not world-readable
 * (the data is not sensitive, but there's no reason to be loose).
 */
export async function writeUserSettingsAtomic(
  settingsPath: string,
  settings: UserSettings
): Promise<void> {
  const dir = path.dirname(settingsPath);
  await fsp.mkdir(dir, { recursive: true });
  const contents = JSON.stringify(settings, null, 2) + "\n";
  const tmp = path.join(dir, `.user-settings.json.${process.pid}.${Date.now()}.tmp`);
  await fsp.writeFile(tmp, contents, { encoding: "utf8", mode: 0o600 });
  try {
    await fsp.rename(tmp, settingsPath);
  } catch (err) {
    // Best-effort cleanup of the temp file before re-throwing.
    try {
      await fsp.unlink(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}
