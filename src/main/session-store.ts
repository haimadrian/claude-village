import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { classify } from "./classifier";
import { logger } from "./logger";
import type { AgentEvent, SessionState, AgentState, TimelineLine } from "../shared/types";

const GHOST_MS = 3 * 60 * 1000;
const TIMELINE_CAP = 500;
const ACTIONS_CAP = 5;

export interface SessionPatch {
  sessionId: string;
  changes: Array<
    | { kind: "session-upsert"; session: Omit<SessionState, "agents" | "timeline"> }
    | { kind: "agent-upsert"; agent: AgentState }
    | { kind: "agent-remove"; agentId: string }
    | { kind: "timeline-append"; line: TimelineLine }
  >;
}

/**
 * In-memory session state plus a tiny JSON file for the pinned-session list.
 *
 * We used to use `better-sqlite3` here, but the only thing we actually persist
 * is a set of pinned session ids - there is no SQL to speak of, and the native
 * module turned into a packaging nightmare (ABI mismatches, pnpm symlink
 * issues, node-gyp/python dependencies). A flat JSON file on disk is
 * dramatically simpler and works everywhere Electron does.
 *
 * Pass ":memory:" for `pinnedPath` in unit tests to skip all disk I/O.
 */
export class SessionStore extends EventEmitter {
  private sessions = new Map<string, SessionState>();
  private pinnedIds = new Set<string>();
  private readonly pinnedPath: string;

  constructor(pinnedPath: string) {
    super();
    this.pinnedPath = pinnedPath === ":memory:" ? "" : pinnedPath;
    this.loadPinned();
  }

  listSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  getSession(id: string): SessionState | undefined {
    return this.sessions.get(id);
  }

  isPinned(id: string): boolean {
    return this.pinnedIds.has(id);
  }

  pin(id: string): void {
    if (this.pinnedIds.has(id)) return;
    this.pinnedIds.add(id);
    this.flushPinned();
  }

  unpin(id: string): void {
    if (!this.pinnedIds.has(id)) return;
    this.pinnedIds.delete(id);
    this.flushPinned();
  }

  apply(event: AgentEvent): void {
    try {
      this.applyInner(event);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.warn("SessionStore apply failed", {
        sessionId: event.sessionId,
        agentId: event.agentId,
        type: event.type,
        message: e.message
      });
    }
  }

  private applyInner(event: AgentEvent): void {
    logger.debug("SessionStore applying event", {
      sessionId: event.sessionId,
      agentId: event.agentId,
      type: event.type
    });
    let session = this.sessions.get(event.sessionId);
    if (!session) {
      session = {
        sessionId: event.sessionId,
        projectPath: "",
        startedAt: event.timestamp,
        lastActivityAt: event.timestamp,
        status: "active",
        agents: new Map(),
        timeline: []
      };
      this.sessions.set(event.sessionId, session);
    }

    // Session-title updates reflect metadata about a conversation, not
    // activity. Bumping lastActivityAt for them would cause title events
    // backfilled from old JSONL files to make stale sessions look active.
    if (event.type !== "session-title") {
      session.lastActivityAt = event.timestamp;
    }
    const changes: SessionPatch["changes"] = [];

    if (event.type === "session-start") {
      logger.info("SessionStore session started", {
        sessionId: event.sessionId,
        agentId: event.agentId
      });
      session.status = "active";
      this.ensureAgent(session, event.agentId, event.kind, event.parentAgentId);
      changes.push({ kind: "session-upsert", session: stripRelations(session) });
      const agent = session.agents.get(event.agentId);
      if (agent) changes.push({ kind: "agent-upsert", agent });
    } else if (event.type === "subagent-start") {
      this.ensureAgent(session, event.agentId, "subagent", event.parentAgentId);
      const agent = session.agents.get(event.agentId);
      if (agent) changes.push({ kind: "agent-upsert", agent });
    } else if (event.type === "session-end") {
      logger.info("SessionStore session ended", { sessionId: event.sessionId });
      session.status = "ended";
      changes.push({ kind: "session-upsert", session: stripRelations(session) });
    } else if (event.type === "subagent-end") {
      const agent = session.agents.get(event.agentId);
      if (agent) {
        agent.animation = "ghost";
        agent.targetZone = "tavern";
        agent.ghostExpiresAt = event.timestamp + GHOST_MS;
        changes.push({ kind: "agent-upsert", agent });
      }
    } else if (event.type === "pre-tool-use" || event.type === "post-tool-use") {
      const agent = this.ensureAgent(session, event.agentId, event.kind, event.parentAgentId);
      const c = classify(event);
      agent.targetZone = c.zone;
      agent.animation = c.animation;
      agent.recentActions.push({
        timestamp: event.timestamp,
        zone: c.zone,
        summary: c.tooltip
      });
      if (agent.recentActions.length > ACTIONS_CAP) agent.recentActions.shift();
      changes.push({ kind: "agent-upsert", agent });

      const line: TimelineLine = {
        id: `${event.sessionId}:${event.timestamp}:${Math.random().toString(36).slice(2, 6)}`,
        timestamp: event.timestamp,
        agentId: event.agentId,
        agentKind: event.kind,
        kind: event.type === "pre-tool-use" ? "tool-call" : "tool-result",
        text: c.timelineText
      };
      session.timeline.push(line);
      if (session.timeline.length > TIMELINE_CAP) session.timeline.shift();
      changes.push({ kind: "timeline-append", line });
    } else if (event.type === "session-title") {
      if (event.sessionTitle) {
        session.title = event.sessionTitle;
        changes.push({ kind: "session-upsert", session: stripRelations(session) });
      }
    } else if (event.type === "user-message" || event.type === "assistant-message") {
      const line: TimelineLine = {
        id: `${event.sessionId}:${event.timestamp}:${Math.random().toString(36).slice(2, 6)}`,
        timestamp: event.timestamp,
        agentId: event.agentId,
        agentKind: event.kind,
        kind: event.type === "user-message" ? "user" : "assistant",
        text: event.messageExcerpt ?? ""
      };
      session.timeline.push(line);
      if (session.timeline.length > TIMELINE_CAP) session.timeline.shift();
      changes.push({ kind: "timeline-append", line });
    }

    this.emit("patch", {
      sessionId: event.sessionId,
      changes
    } satisfies SessionPatch);
  }

  expireGhosts(now: number): void {
    for (const session of this.sessions.values()) {
      for (const agent of Array.from(session.agents.values())) {
        if (
          agent.animation === "ghost" &&
          agent.ghostExpiresAt !== undefined &&
          agent.ghostExpiresAt < now
        ) {
          session.agents.delete(agent.id);
          this.emit("patch", {
            sessionId: session.sessionId,
            changes: [{ kind: "agent-remove", agentId: agent.id }]
          } satisfies SessionPatch);
        }
      }
    }
  }

  private ensureAgent(
    session: SessionState,
    id: string,
    kind: "main" | "subagent",
    parentId?: string
  ): AgentState {
    const existing = session.agents.get(id);
    if (existing) return existing;
    const state: AgentState = {
      id,
      kind,
      currentZone: "tavern",
      targetZone: "tavern",
      animation: "idle",
      recentActions: [],
      skinColor: hashColor(id),
      ...(parentId !== undefined ? { parentId } : {})
    };
    session.agents.set(id, state);
    return state;
  }

  private loadPinned(): void {
    if (!this.pinnedPath) return;
    try {
      const content = fs.readFileSync(this.pinnedPath, "utf8");
      const parsed: unknown = JSON.parse(content);
      if (Array.isArray(parsed)) {
        for (const id of parsed) if (typeof id === "string") this.pinnedIds.add(id);
      }
    } catch {
      // Missing or malformed file - start with no pins. Not an error.
    }
  }

  private flushPinned(): void {
    if (!this.pinnedPath) return;
    try {
      fs.mkdirSync(path.dirname(this.pinnedPath), { recursive: true });
      fs.writeFileSync(this.pinnedPath, JSON.stringify(Array.from(this.pinnedIds)));
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.warn("SessionStore flush pinned failed", {
        pinnedPath: this.pinnedPath,
        message: e.message
      });
    }
  }
}

function stripRelations(s: SessionState): Omit<SessionState, "agents" | "timeline"> {
  return {
    sessionId: s.sessionId,
    projectPath: s.projectPath,
    startedAt: s.startedAt,
    lastActivityAt: s.lastActivityAt,
    status: s.status,
    ...(s.title !== undefined ? { title: s.title } : {})
  };
}

function hashColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 70% 55%)`;
}
