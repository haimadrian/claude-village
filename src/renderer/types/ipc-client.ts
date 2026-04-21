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

export interface HookReadOk {
  ok: true;
  settingsPath: string;
  currentText: string;
  currentParsed: unknown;
  mergedText: string;
  diffText: string;
  isInstalled: boolean;
}

export interface HookMutationOk {
  ok: true;
  settingsPath: string;
  previousText: string;
  nextText: string;
  changed: boolean;
}

export interface HookErr {
  ok: false;
  error: string;
}

export type HookReadResponse = HookReadOk | HookErr;
export type HookMutationResponse = HookMutationOk | HookErr;

export interface UserSettingsReadOk {
  ok: true;
  idleBeforeGhostMinutes: number;
}

export interface UserSettingsWriteOk {
  ok: true;
  changed: boolean;
  next: { idleBeforeGhostMinutes: number };
}

export interface UserSettingsErr {
  ok: false;
  error: string;
}

export type UserSettingsReadResponse = UserSettingsReadOk | UserSettingsErr;
export type UserSettingsWriteResponse = UserSettingsWriteOk | UserSettingsErr;

export interface ClaudeVillageAPI {
  listSessions: () => Promise<SessionWire[]>;
  getSession: (id: string) => Promise<SessionWire | null>;
  pinSession: (id: string) => Promise<void>;
  unpinSession: (id: string) => Promise<void>;
  onPatch: (cb: (p: SessionPatch) => void) => () => void;
  onMenuAbout: (cb: () => void) => () => void;
  readHooks: () => Promise<HookReadResponse>;
  installHooks: () => Promise<HookMutationResponse>;
  uninstallHooks: () => Promise<HookMutationResponse>;
  readUserSettings: () => Promise<UserSettingsReadResponse>;
  writeUserSettings: (payload: {
    idleBeforeGhostMinutes: number;
  }) => Promise<UserSettingsWriteResponse>;
}

declare global {
  interface Window {
    claudeVillage: ClaudeVillageAPI;
  }
}
