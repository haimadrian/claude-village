import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { classify, isTrivialSummary } from "./classifier";
import { logger } from "./logger";
import type { AgentEvent, SessionState, AgentState, TimelineLine } from "../shared/types";

/**
 * Idle timer: once an agent has received no events (tool use, message, or
 * session lifecycle) for this long, the next `expireGhosts` tick flips it to
 * a ghost. Kept tight (3 minutes) because the scene feels abandoned well
 * before the ghost TTL below kicks in.
 */
const IDLE_BEFORE_GHOST_MS = 3 * 60 * 1000;
/**
 * Ghost TTL: how long a ghost lingers in the scene (fading out) before being
 * removed entirely. One hour gives users time to see "oh, that session is
 * done" without flooding the scene with ancient agents forever.
 */
const GHOST_TTL_MS = 60 * 60 * 1000;
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

    // If new activity arrives on a session we previously marked "ended"
    // (e.g. the main agent emitted a Stop line but subagents kept working,
    // or the user resumed the conversation), reopen it so the UI does not
    // lie about a running session being over. `session-end` below will
    // re-close it when the session actually ends; metadata-only events
    // (session-title, subagent-end) must not reopen.
    const isActivity =
      event.type === "session-start" ||
      event.type === "subagent-start" ||
      event.type === "user-message" ||
      event.type === "assistant-message" ||
      event.type === "pre-tool-use" ||
      event.type === "post-tool-use";
    const reopened = isActivity && session.status === "ended";
    if (reopened) {
      session.status = "active";
    }

    const changes: SessionPatch["changes"] = [];
    // If we just flipped the session back to active, emit a session-upsert
    // up front so the renderer picks up the new status even when the
    // branches below only push agent/timeline updates.
    if (reopened) {
      changes.push({ kind: "session-upsert", session: stripRelations(session) });
    }

    if (event.type === "session-start") {
      logger.info("SessionStore session started", {
        sessionId: event.sessionId,
        agentId: event.agentId
      });
      session.status = "active";
      const agent = this.ensureAgent(session, event.agentId, event.kind, event.parentAgentId);
      agent.lastSeenAt = event.timestamp;
      changes.push({ kind: "session-upsert", session: stripRelations(session) });
      changes.push({ kind: "agent-upsert", agent });
    } else if (event.type === "subagent-start") {
      const agent = this.ensureAgent(session, event.agentId, "subagent", event.parentAgentId);
      // A subagent coming back to life is not waiting on anyone.
      if (agent.waitingForInput === true) agent.waitingForInput = false;
      agent.lastSeenAt = event.timestamp;
      changes.push({ kind: "agent-upsert", agent });
    } else if (event.type === "session-end") {
      logger.info("SessionStore session ended", { sessionId: event.sessionId });
      session.status = "ended";
      // Bump lastSeenAt on the mayor so the idle-to-ghost timer starts at the
      // Stop moment, not at whatever the last tool event was. Without this, a
      // session that emitted Stop minutes after its last tool would ghost
      // almost immediately on the next expireGhosts tick.
      const mayor = session.agents.get(event.agentId);
      if (mayor) {
        mayor.lastSeenAt = event.timestamp;
        changes.push({ kind: "agent-upsert", agent: mayor });
      }
      changes.push({ kind: "session-upsert", session: stripRelations(session) });
    } else if (event.type === "subagent-end") {
      const agent = session.agents.get(event.agentId);
      if (agent) {
        agent.animation = "ghost";
        agent.currentZone = "tavern";
        agent.targetZone = "tavern";
        agent.ghostExpiresAt = event.timestamp + GHOST_TTL_MS;
        agent.lastSeenAt = event.timestamp;
        // A subagent that just ended has handed control back to its
        // orchestrator; until the orchestrator dispatches it again (or any
        // follow-up activity arrives), it is effectively waiting for input.
        // Any follow-up tool / message event clears this below.
        if (agent.waitingForInput !== true) {
          agent.waitingForInput = true;
        }
        changes.push({ kind: "agent-upsert", agent });
      }
    } else if (event.type === "pre-tool-use" || event.type === "post-tool-use") {
      const agent = this.ensureAgent(session, event.agentId, event.kind, event.parentAgentId);
      const c = classify(event);
      // Any tool activity means the agent is actively working, not waiting.
      if (agent.waitingForInput === true) {
        agent.waitingForInput = false;
      }
      // Revive a ghost on activity: clear the TTL so expireGhosts will not
      // despawn it, and let the classifier set the correct animation below.
      if (agent.animation === "ghost") {
        delete agent.ghostExpiresAt;
      }
      agent.lastSeenAt = event.timestamp;
      // Advance the semantic zone immediately. The renderer animates the
      // character between zones over time; it no longer relies on
      // `currentZone` for the mount-time position (that is latched on first
      // render), but keeping `currentZone` in sync with `targetZone` keeps
      // other code paths (e.g. camera focus-agent, tooltips) correct.
      agent.currentZone = c.zone;
      agent.targetZone = c.zone;
      agent.animation = c.animation;
      // Never overwrite the speech bubble with empty/punctuation-only content.
      // The classifier already substitutes "Done" for trivial post-tool-use
      // summaries, but this guard also covers anything else upstream that
      // might leak an arrow or blank string through. If the new summary is
      // junk and the agent already has a readable action, keep the old one
      // visible. The timeline still gets every event via the code below.
      const summary = c.tooltip;
      if (!isTrivialSummary(summary) || agent.recentActions.length === 0) {
        agent.recentActions.push({
          timestamp: event.timestamp,
          zone: c.zone,
          summary
        });
        if (agent.recentActions.length > ACTIONS_CAP) agent.recentActions.shift();
      }
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
      // Track waiting-for-input on the agent the message belongs to. On an
      // assistant-message, Claude has finished a turn; if it actually calls a
      // tool next, the subsequent pre-tool-use clears the flag a tick later -
      // a self-correcting one-frame false positive that matches the user's
      // expectation: the "!" only lingers when Claude is genuinely idle.
      // A user-message is the human (or orchestrator) replying, so the agent
      // is no longer waiting.
      const agent = this.ensureAgent(session, event.agentId, event.kind, event.parentAgentId);
      const nextWaiting = event.type === "assistant-message";
      const waitingChanged = (agent.waitingForInput ?? false) !== nextWaiting;
      if (waitingChanged) {
        if (nextWaiting) {
          agent.waitingForInput = true;
        } else {
          agent.waitingForInput = false;
        }
      }
      agent.lastSeenAt = event.timestamp;
      // Revive a ghost on any message activity. Flip back to idle so the
      // renderer stops fading the character; downstream tool events will
      // pick the right work animation.
      const revived = agent.animation === "ghost";
      if (revived) {
        agent.animation = "idle";
        delete agent.ghostExpiresAt;
      }
      if (waitingChanged || revived) {
        changes.push({ kind: "agent-upsert", agent });
      }

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

  /**
   * Two-stage retirement sweep:
   *
   * 1. Non-ghost agents whose `lastSeenAt` is older than `IDLE_BEFORE_GHOST_MS`
   *    flip to ghost in the tavern with a fresh `GHOST_TTL_MS` countdown, and
   *    emit an `agent-upsert` so the renderer fades them.
   * 2. Already-ghost agents whose `ghostExpiresAt` has passed get removed
   *    from the session and emit an `agent-remove`.
   *
   * Called on a timer from `ipc-bridge.ts`. Side effects are limited to
   * mutating agent state inside the store and emitting patches.
   */
  expireGhosts(now: number): void {
    for (const session of this.sessions.values()) {
      for (const agent of Array.from(session.agents.values())) {
        if (agent.animation === "ghost") {
          if (agent.ghostExpiresAt !== undefined && agent.ghostExpiresAt < now) {
            session.agents.delete(agent.id);
            this.emit("patch", {
              sessionId: session.sessionId,
              changes: [{ kind: "agent-remove", agentId: agent.id }]
            } satisfies SessionPatch);
          }
          continue;
        }
        if (agent.lastSeenAt !== undefined && now - agent.lastSeenAt > IDLE_BEFORE_GHOST_MS) {
          agent.animation = "ghost";
          agent.targetZone = "tavern";
          agent.ghostExpiresAt = now + GHOST_TTL_MS;
          this.emit("patch", {
            sessionId: session.sessionId,
            changes: [{ kind: "agent-upsert", agent }]
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
