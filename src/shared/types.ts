import type { ZoneId } from "./zones";

export type AgentKind = "main" | "subagent";

export type AnimationState =
  | "idle"
  | "walk"
  | "work-office"
  | "work-library"
  | "work-mine"
  | "work-forest"
  | "work-farm"
  | "work-nether"
  | "work-signpost"
  | "work-spawner"
  | "work-tavern"
  | "ghost";

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
    | "post-tool-use";
  toolName?: string;
  toolArgsSummary?: string;
  resultSummary?: string;
  messageExcerpt?: string;
  rawLine?: string;
}

export interface AgentAction {
  timestamp: number;
  zone: ZoneId;
  summary: string;
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
  skinColor: string; // hex, derived from hash(id)
}

export interface SessionState {
  sessionId: string;
  projectPath: string;
  startedAt: number;
  lastActivityAt: number;
  status: "active" | "idle" | "ended";
  agents: Map<string, AgentState>;
  timeline: TimelineLine[]; // ring buffer, max 500
}

export interface TimelineLine {
  id: string;
  timestamp: number;
  agentId: string;
  agentKind: AgentKind;
  kind: "user" | "assistant" | "tool-call" | "tool-result";
  text: string;
}

export interface Classification {
  zone: ZoneId;
  animation: AnimationState;
  tooltip: string;
  timelineText: string;
}
