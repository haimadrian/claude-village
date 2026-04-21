import type { ZoneId } from "./zones";

export type AgentKind = "main" | "subagent";

// Derived so adding a zone in `zones.ts` automatically yields the matching
// `work-<zone>` animation. Prevents typos from slipping past a stringly-typed cast.
export type WorkAnimation = `work-${ZoneId}`;
export type AnimationState = "idle" | "walk" | WorkAnimation | "ghost";

export interface AgentEvent {
  sessionId: string;
  agentId: string;
  parentAgentId?: string;
  kind: AgentKind;
  timestamp: number;
  type:
    | "session-start"
    | "session-end"
    | "subagent-start"
    | "subagent-end"
    | "user-message"
    | "assistant-message"
    | "pre-tool-use"
    | "post-tool-use"
    | "session-title";
  toolName?: string;
  toolArgsSummary?: string;
  resultSummary?: string;
  messageExcerpt?: string;
  sessionTitle?: string;
  rawLine?: string;
}

export interface AgentAction {
  timestamp: number;
  zone: ZoneId;
  summary: string; // ready-to-render label (pre-truncated upstream)
}

export interface AgentState {
  id: string;
  kind: AgentKind;
  parentId?: string;
  currentZone: ZoneId;
  targetZone: ZoneId;
  animation: AnimationState;
  recentActions: AgentAction[]; // ring buffer, max 5
  ghostExpiresAt?: number; // epoch ms
  /**
   * Last time we observed any event for this agent (session-start,
   * subagent-start, pre/post-tool-use, user-message, assistant-message, or a
   * session-end affecting the mayor). Drives the idle-to-ghost transition
   * inside `SessionStore.expireGhosts`.
   */
  lastSeenAt?: number;
  skinColor: string; // hex, derived from hash(id)
  /**
   * True when the agent has finished its last turn and is waiting for input
   * (from the user for the mayor, from the orchestrator for a subagent).
   * Drives a 3D yellow "!" indicator in the renderer. Cleared the moment any
   * new activity (tool-use, user-message, assistant-message) arrives.
   * Optional and defaults to undefined so existing serialized state stays
   * backwards compatible.
   */
  waitingForInput?: boolean;
}

export interface SessionState {
  sessionId: string;
  projectPath: string;
  startedAt: number;
  lastActivityAt: number;
  status: "active" | "idle" | "ended";
  title?: string;
  agents: Map<string, AgentState>; // main-process only; serialized to AgentState[] across IPC
  timeline: TimelineLine[]; // ring buffer, max 500
}

export interface TimelineLine {
  id: string; // event hash, stable across re-renders
  timestamp: number;
  agentId: string;
  agentKind: AgentKind;
  kind: "user" | "assistant" | "tool-call" | "tool-result";
  text: string; // condensed, already truncated for display
}

export interface Classification {
  zone: ZoneId;
  animation: AnimationState;
  tooltip: string;
  timelineText: string;
}
