import type { AgentState } from "../../shared/types";

export interface HuddleState {
  participants: string[]; // agent ids
  anchor: [number, number, number];
  startedAt: number;
  durationMs: number;
  excerpts: Record<string, string>;
}

const HUDDLE_MS = 1500;

/**
 * Pure helper - given a trigger event and the two agents involved, returns
 * the world-space anchor and metadata for a brief huddle animation. The
 * caller is responsible for driving the animation (the helper does no IO).
 *
 * - "spawn" huddles anchor at the spawner zone (mayor delivers the task)
 * - "return" huddles anchor at the mayor's current zone (subagent reports back)
 * Falls back to the tavern, then [0, 0, 0] if neither anchor exists.
 */
export function computeHuddle(
  triggerEvent: "spawn" | "return",
  mayor: AgentState,
  subagent: AgentState,
  zonePositions: Record<string, [number, number, number]>
): HuddleState {
  const anchor =
    triggerEvent === "spawn"
      ? zonePositions.spawner
      : (zonePositions[mayor.currentZone] ?? zonePositions.tavern);
  return {
    participants: [mayor.id, subagent.id],
    anchor: anchor ?? [0, 0, 0],
    startedAt: Date.now(),
    durationMs: HUDDLE_MS,
    excerpts: {}
  };
}
