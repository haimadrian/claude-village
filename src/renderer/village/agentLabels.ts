/**
 * Compute readable display names for every agent in a session.
 *
 * The raw `agent.id` is either the session id (for the main agent, which is
 * a UUID in production) or `${sessionId}:${tool_use_id}` for subagents. Neither
 * is pleasant to read above a character's head. This helper turns them into
 * short stable labels:
 *
 *   - main  agent -> "Mayor"
 *   - subagents  -> "Agent 1", "Agent 2", ...  (1-based, ordered by first
 *     appearance in the agents Map - `Map` preserves insertion order, and the
 *     session store adds subagents exactly once each, so the ordering is
 *     stable for the lifetime of the session).
 *
 * The function is pure: same input Map -> same output Map. It never mutates
 * the input. Callers pass the result down to the `Character`/tooltip
 * components so the naming logic lives in one place.
 */
import type { AgentState } from "../../shared/types";

export type AgentLabelMap = Map<string, string>;

export function buildAgentLabels(agents: Iterable<AgentState>): AgentLabelMap {
  const labels: AgentLabelMap = new Map();
  let subagentIndex = 0;
  for (const agent of agents) {
    if (agent.kind === "main") {
      labels.set(agent.id, "Mayor");
    } else {
      subagentIndex += 1;
      labels.set(agent.id, `Agent ${subagentIndex}`);
    }
  }
  return labels;
}

/**
 * Convenience lookup with a readable fallback. Used by components that may
 * render before the labels map has been recomputed (e.g. during a transient
 * mid-frame state). Falls back to "Agent" so the UI never shows an empty
 * bubble.
 */
export function labelFor(labels: AgentLabelMap, agent: AgentState): string {
  return labels.get(agent.id) ?? (agent.kind === "main" ? "Mayor" : "Agent");
}
