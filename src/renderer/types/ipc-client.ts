import type { SessionState, TimelineLine, AgentState } from "../../shared/types";

// Mirrors `SessionPatch` from `src/main/session-store.ts`. Redeclared here because
// the renderer tsconfig (`tsconfig.web.json`) does not include `src/main`, and we
// want the renderer to depend only on a stable IPC contract, not on main-process
// internals.
export interface SessionPatch {
  sessionId: string;
  changes: Array<
    | { kind: "session-upsert"; session: Omit<SessionState, "agents" | "timeline"> }
    | { kind: "agent-upsert"; agent: AgentState }
    | { kind: "agent-remove"; agentId: string }
    | { kind: "timeline-append"; line: TimelineLine }
  >;
}

// Wire representation of a session across IPC: `agents` and `timeline` are
// serialized as arrays (Map is not structured-clonable across contextBridge).
export type SessionWire = Omit<SessionState, "agents" | "timeline"> & {
  agents: AgentState[];
  timeline: TimelineLine[];
};

export interface ClaudeVillageAPI {
  listSessions: () => Promise<SessionWire[]>;
  getSession: (id: string) => Promise<SessionWire | null>;
  pinSession: (id: string) => Promise<void>;
  unpinSession: (id: string) => Promise<void>;
  onPatch: (cb: (p: SessionPatch) => void) => () => void;
  onMenuAbout: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    claudeVillage: ClaudeVillageAPI;
  }
}
