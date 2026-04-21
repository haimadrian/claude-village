import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logger } from "./logger";

/**
 * Automated install / uninstall of the claude-village hook entries in
 * `~/.claude/settings.json` (or the `CLAUDE_CONFIG_DIR`-overridden path).
 *
 * Pure helpers (`computeMerged`, `computeRemoved`) live here without any
 * filesystem or IPC coupling so they can be unit-tested directly. The
 * filesystem wrappers (`readSettings`, `writeSettingsAtomic`, etc.) are the
 * thin IO layer the IPC bridge calls.
 *
 * Merge rules:
 * - We own hook entries whose `hooks[].command` mentions our port (49251) on
 *   127.0.0.1. Any other user-authored hook is preserved untouched.
 * - Re-installing is idempotent: if an identical (matcher, command) entry
 *   already exists for an event, we skip it rather than duplicate.
 * - Uninstall removes only our owned entries, leaving user hooks intact.
 */

export const HOOK_PORT = 49251;
const HOOK_HOST = "127.0.0.1";
const HOOK_URL = `http://${HOOK_HOST}:${HOOK_PORT}/event`;
const HOOK_COMMAND = `curl -s --max-time 2 -X POST -H 'Content-Type: application/json' --data-binary @- ${HOOK_URL} >/dev/null 2>&1 || true`;

// The set of Claude Code hook event types we install into. Kept in sync with
// the matchers the hook-server recognises (`SessionStart`, `PreToolUse`,
// `PostToolUse`, `SubagentStart`, `Stop`).
type EventName = "PreToolUse" | "PostToolUse" | "SessionStart" | "SubagentStart" | "Stop";

interface HookEntry {
  type: string;
  command: string;
}

interface MatcherGroup {
  matcher?: string;
  hooks: HookEntry[];
  [k: string]: unknown;
}

interface HooksBlock {
  [event: string]: MatcherGroup[] | undefined;
}

interface SettingsShape {
  hooks?: HooksBlock;
  [k: string]: unknown;
}

interface DesiredEntry {
  event: EventName;
  matcher?: string;
}

// Events that should use the `.*` matcher (tool-use style). Others have no
// matcher key at all (session lifecycle events). Must match the shape of the
// snippet currently shown in SettingsScreen so a user hand-pasting the old
// snippet still gets recognised as "already installed".
const DESIRED: DesiredEntry[] = [
  { event: "PreToolUse", matcher: ".*" },
  { event: "PostToolUse", matcher: ".*" },
  { event: "SessionStart" },
  { event: "SubagentStart" },
  { event: "Stop" }
];

export function resolveSettingsPath(env: NodeJS.ProcessEnv = process.env): string {
  const dir = env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
  return path.join(dir, "settings.json");
}

/**
 * True when `cmd` is a claude-village hook command (targets our loopback port).
 * We match on the string form rather than parsing because Claude Code runs
 * the command via shell, so anything that POSTs to our port is "ours" for
 * merge / uninstall purposes.
 */
function isOurCommand(cmd: string): boolean {
  if (typeof cmd !== "string") return false;
  return cmd.includes(`${HOOK_HOST}:${HOOK_PORT}`);
}

function cloneSettings(input: unknown): SettingsShape {
  if (!input || typeof input !== "object") return {};
  // `structuredClone` is fine here - settings files are small and never
  // contain non-cloneable values like functions. Falls back to JSON on
  // older Node just in case.
  try {
    return structuredClone(input) as SettingsShape;
  } catch {
    return JSON.parse(JSON.stringify(input)) as SettingsShape;
  }
}

function ensureHooks(s: SettingsShape): HooksBlock {
  if (!s.hooks || typeof s.hooks !== "object") s.hooks = {};
  return s.hooks;
}

function ensureEventArr(hooks: HooksBlock, event: EventName): MatcherGroup[] {
  const existing = hooks[event];
  if (Array.isArray(existing)) return existing;
  const arr: MatcherGroup[] = [];
  hooks[event] = arr;
  return arr;
}

function groupMatches(g: MatcherGroup, matcher?: string): boolean {
  // Treat missing matcher as equivalent to `undefined`. Claude Code itself
  // treats an absent matcher as "no filter", same as our desired behaviour.
  const a = g.matcher ?? undefined;
  const b = matcher ?? undefined;
  return a === b;
}

function groupHasOurCommand(g: MatcherGroup): boolean {
  if (!Array.isArray(g.hooks)) return false;
  return g.hooks.some((h) => h && typeof h === "object" && isOurCommand(h.command));
}

/**
 * Return a new settings object with our hook entries installed.
 * Idempotent: running on an already-installed file returns an equivalent
 * structure (same JSON stringification up to key order of existing user
 * entries).
 */
export function computeMerged(current: unknown): SettingsShape {
  const next = cloneSettings(current);
  const hooks = ensureHooks(next);

  for (const d of DESIRED) {
    const arr = ensureEventArr(hooks, d.event);

    // Look for an existing group with the same matcher. If it already has
    // our command, we leave it alone. If it has user commands but not ours,
    // we append ours to the same group rather than creating a sibling, which
    // keeps the file tidy.
    const sameMatcherGroup = arr.find((g) => groupMatches(g, d.matcher));

    if (sameMatcherGroup) {
      if (!groupHasOurCommand(sameMatcherGroup)) {
        if (!Array.isArray(sameMatcherGroup.hooks)) sameMatcherGroup.hooks = [];
        sameMatcherGroup.hooks.push({ type: "command", command: HOOK_COMMAND });
      }
      continue;
    }

    // No group with that matcher exists. Add a fresh group (with or without
    // a matcher key to match the shape of the legacy snippet).
    const group: MatcherGroup = d.matcher
      ? { matcher: d.matcher, hooks: [{ type: "command", command: HOOK_COMMAND }] }
      : { hooks: [{ type: "command", command: HOOK_COMMAND }] };
    arr.push(group);
  }

  return next;
}

/**
 * Return a new settings object with only claude-village hook entries removed.
 * Leaves unrelated hooks and unrelated top-level keys untouched. Cleans up
 * now-empty groups and empty event arrays so the file stays minimal.
 */
export function computeRemoved(current: unknown): SettingsShape {
  const next = cloneSettings(current);
  if (!next.hooks || typeof next.hooks !== "object") return next;

  for (const event of Object.keys(next.hooks)) {
    const arr = next.hooks[event];
    if (!Array.isArray(arr)) continue;

    const cleaned: MatcherGroup[] = [];
    for (const g of arr) {
      if (!g || typeof g !== "object") continue;
      const keptHooks = Array.isArray(g.hooks)
        ? g.hooks.filter((h) => !isOurCommand(h?.command))
        : [];
      if (keptHooks.length === 0) continue;
      cleaned.push({ ...g, hooks: keptHooks });
    }

    if (cleaned.length === 0) {
      delete next.hooks[event];
    } else {
      next.hooks[event] = cleaned;
    }
  }

  // If hooks is now empty, drop the key entirely so we don't leave a dangling
  // `"hooks": {}` behind.
  if (Object.keys(next.hooks).length === 0) {
    delete next.hooks;
  }

  return next;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function parseSettingsText(text: string): SettingsShape {
  const trimmed = text.trim();
  if (trimmed === "") return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? (parsed as SettingsShape) : {};
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    throw new Error(`settings.json is not valid JSON: ${e.message}`);
  }
}

export interface HookReadResult {
  settingsPath: string;
  currentText: string;
  currentParsed: SettingsShape;
  mergedText: string;
  diffText: string;
  isInstalled: boolean;
}

export async function readSettings(settingsPath = resolveSettingsPath()): Promise<HookReadResult> {
  let currentText = "";
  try {
    currentText = await fsp.readFile(settingsPath, "utf8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") throw err;
    currentText = "";
  }

  const currentParsed = parseSettingsText(currentText);
  const merged = computeMerged(currentParsed);
  const mergedText = formatJson(merged);
  const normalizedCurrent = currentText.trim() === "" ? "{}\n" : formatJson(currentParsed);

  return {
    settingsPath,
    currentText,
    currentParsed,
    mergedText,
    diffText: buildDiff(normalizedCurrent, mergedText),
    isInstalled: normalizedCurrent === mergedText
  };
}

/**
 * Atomic write: write to a sibling temp file in the same directory, then
 * rename. Rename is atomic within a filesystem on POSIX, so readers never
 * see a half-written file. Preserves the file mode of the existing
 * settings.json if it exists.
 */
export async function writeSettingsAtomic(settingsPath: string, contents: string): Promise<void> {
  const dir = path.dirname(settingsPath);
  await fsp.mkdir(dir, { recursive: true });

  let mode: number | undefined;
  try {
    const st = await fsp.stat(settingsPath);
    mode = st.mode & 0o777;
  } catch {
    mode = 0o600;
  }

  const tmp = path.join(dir, `.settings.json.${process.pid}.${Date.now()}.tmp`);
  await fsp.writeFile(tmp, contents, { encoding: "utf8", mode });
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

export interface HookMutationResult {
  settingsPath: string;
  previousText: string;
  nextText: string;
  changed: boolean;
}

export async function installHook(
  settingsPath = resolveSettingsPath()
): Promise<HookMutationResult> {
  let previousText = "";
  try {
    previousText = await fsp.readFile(settingsPath, "utf8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") throw err;
  }

  const parsed = previousText.trim() === "" ? {} : parseSettingsText(previousText);
  const merged = computeMerged(parsed);
  const nextText = formatJson(merged);
  const normalizedPrev = previousText.trim() === "" ? "{}\n" : formatJson(parsed);

  if (normalizedPrev === nextText && fs.existsSync(settingsPath)) {
    logger.info("hook-installer install: already installed, no write");
    return { settingsPath, previousText, nextText, changed: false };
  }

  await writeSettingsAtomic(settingsPath, nextText);
  logger.info("hook-installer install: wrote settings", { settingsPath });
  return { settingsPath, previousText, nextText, changed: true };
}

export async function uninstallHook(
  settingsPath = resolveSettingsPath()
): Promise<HookMutationResult> {
  let previousText = "";
  try {
    previousText = await fsp.readFile(settingsPath, "utf8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") throw err;
    return { settingsPath, previousText: "", nextText: "", changed: false };
  }

  const parsed = parseSettingsText(previousText);
  const removed = computeRemoved(parsed);
  // Preserve "empty object" form rather than writing literally "{}\n" when
  // the user started with a more complex file that only contained our hooks.
  const nextText = formatJson(removed);
  const normalizedPrev = formatJson(parsed);

  if (normalizedPrev === nextText) {
    logger.info("hook-installer uninstall: nothing to remove");
    return { settingsPath, previousText, nextText, changed: false };
  }

  await writeSettingsAtomic(settingsPath, nextText);
  logger.info("hook-installer uninstall: wrote settings", { settingsPath });
  return { settingsPath, previousText, nextText, changed: true };
}

/**
 * Minimal unified-diff-ish renderer. We avoid pulling in a diff library to
 * stay under the "no new runtime deps" constraint, and a simple line-by-line
 * `- old / + new` view is plenty for the confirmation dialog.
 */
export function buildDiff(before: string, after: string): string {
  if (before === after) return "(no changes)";
  const b = before.split("\n");
  const a = after.split("\n");
  const out: string[] = [];
  // Emit both blocks verbatim with +/- prefixes. This is not an LCS diff but
  // it gives the user an unambiguous before/after they can eyeball, and the
  // renderer also shows the full merged JSON separately.
  for (const line of b) out.push(line === "" ? "-" : `- ${line}`);
  out.push("---");
  for (const line of a) out.push(line === "" ? "+" : `+ ${line}`);
  return out.join("\n");
}
