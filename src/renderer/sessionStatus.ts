// Shared session-status derivation. The store persists an explicit
// status ("active" | "idle" | "ended") but it is a coarse signal - a
// session can be "active" with no recent activity, and callers also care
// about idleness. This helper layers a time-based check on top so both
// the sidebar and the tab status line show the same live answer.
//
// - If the store says "ended", trust it.
// - Otherwise, activity within ACTIVE_MS counts as "active", within
//   IDLE_MS as "idle", and anything older degrades to "ended".
//
// Kept as a pure function (no React, no DOM) so it is cheap to unit test
// and safe to call from any render path.

export const ACTIVE_MS = 60_000;
export const IDLE_MS = 10 * 60_000;

export type LiveStatus = "active" | "idle" | "ended";

export function deriveStatus(
  s: { status: "active" | "idle" | "ended"; lastActivityAt: number },
  now: number = Date.now()
): LiveStatus {
  if (s.status === "ended") return "ended";
  const age = now - s.lastActivityAt;
  if (age < ACTIVE_MS) return "active";
  if (age < IDLE_MS) return "idle";
  return "ended";
}
