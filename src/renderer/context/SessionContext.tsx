import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AgentState, TimelineLine } from "../../shared/types";
import type { SessionPatch } from "../types/ipc-client";
import { logger } from "../logger";

export interface TabSession {
  sessionId: string;
  startedAt: number;
  lastActivityAt: number;
  status: "active" | "idle" | "ended";
  title?: string;
  agents: Map<string, AgentState>;
  timeline: TimelineLine[];
  pinned: boolean;
}

interface Ctx {
  sessions: Map<string, TabSession>;
  openTabIds: string[];
  activeTabId: string | null;
  setActiveTab: (id: string) => void;
  closeTab: (id: string) => void;
  togglePin: (id: string) => void;
  openTab: (id: string) => void;
  refreshSessions: () => Promise<void>;
  refreshSession: (sessionId: string) => Promise<void>;
}

const SessionCtx = createContext<Ctx | null>(null);

export const useSessions = (): Ctx => {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSessions must be used inside SessionProvider");
  return c;
};

export function SessionProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [sessions, setSessions] = useState<Map<string, TabSession>>(new Map());
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [closedTabIds, setClosedTabIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const list = await window.claudeVillage.listSessions();
      if (cancelled) return;
      const map = new Map<string, TabSession>();
      for (const s of list) {
        map.set(s.sessionId, {
          sessionId: s.sessionId,
          startedAt: s.startedAt,
          lastActivityAt: s.lastActivityAt,
          status: s.status,
          ...(s.title !== undefined ? { title: s.title } : {}),
          agents: new Map(s.agents.map((a) => [a.id, a])),
          timeline: s.timeline,
          pinned: false
        });
      }
      setSessions(map);
      // Only auto-open tabs for sessions that received activity in the last
      // 60 seconds. Anything older is reachable via the sidebar - without
      // this guard the app flips open a tab for every historical JSONL on
      // disk and pushes the village off-screen.
      const ACTIVE_WINDOW_MS = 60_000;
      const active = list
        .filter((s) => Date.now() - s.lastActivityAt < ACTIVE_WINDOW_MS)
        .map((s) => s.sessionId);
      setOpenTabIds(active);
      setActiveTabId(active[0] ?? null);
    })();

    const applyPatch = (p: SessionPatch): void => {
      setSessions((prev) => {
        const next = new Map(prev);
        let session = next.get(p.sessionId);
        // Lazily materialise the session if an `agent-upsert` or
        // `timeline-append` arrives before a `session-upsert` (e.g. a
        // subagent-start patch reaches the renderer slightly ahead of the
        // parent's session-start patch, or the main-process ordering is
        // ever changed). Without this, the change is silently dropped and
        // the character never spawns. `session-upsert` still fills in the
        // authoritative fields when its patch arrives later.
        const ensureSession = (): TabSession => {
          if (session) return session;
          const now = Date.now();
          session = {
            sessionId: p.sessionId,
            startedAt: now,
            lastActivityAt: now,
            status: "active",
            agents: new Map(),
            timeline: [],
            pinned: false
          };
          return session;
        };
        try {
          for (const change of p.changes) {
            if (change.kind === "session-upsert") {
              ensureSession();
              session = { ...session!, ...change.session };
            } else if (change.kind === "agent-upsert") {
              ensureSession();
              const agents = new Map(session!.agents);
              agents.set(change.agent.id, change.agent);
              session = { ...session!, agents };
            } else if (change.kind === "agent-remove" && session) {
              const agents = new Map(session.agents);
              agents.delete(change.agentId);
              session = { ...session, agents };
            } else if (change.kind === "timeline-append") {
              ensureSession();
              const timeline = [...session!.timeline, change.line].slice(-500);
              session = { ...session!, timeline };
            }
          }
        } catch (err) {
          const e = err instanceof Error ? err : new Error(String(err));
          logger.warn("SessionContext failed to apply IPC patch", {
            sessionId: p.sessionId,
            message: e.message
          });
        }
        if (session) next.set(p.sessionId, session);
        return next;
      });

      setOpenTabIds((prev) => {
        if (prev.includes(p.sessionId)) return prev;
        if (closedTabIds.has(p.sessionId)) return prev;
        return [...prev, p.sessionId];
      });
      setActiveTabId((prev) => prev ?? p.sessionId);
    };

    const unsubscribe = window.claudeVillage.onPatch(applyPatch);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [closedTabIds]);

  const setActiveTab = useCallback((id: string) => setActiveTabId(id), []);

  const openTab = useCallback((id: string) => {
    logger.info("session tab opened", { sessionId: id });
    setClosedTabIds((prev) => {
      if (!prev.has(id)) return prev;
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    logger.info("session tab closed", { sessionId: id });
    setOpenTabIds((prev) => prev.filter((x) => x !== id));
    setClosedTabIds((prev) => {
      if (prev.has(id)) return prev;
      const n = new Set(prev);
      n.add(id);
      return n;
    });
    setActiveTabId((prev) => (prev === id ? null : prev));
  }, []);

  const refreshSessions = useCallback(async (): Promise<void> => {
    // Chokidar can miss JSONL files created after startup on some platforms.
    // This callback re-queries the main process for the authoritative list
    // and merges any previously unseen sessions into state.
    try {
      const list = await window.claudeVillage.listSessions();
      setSessions((prev) => {
        const next = new Map(prev);
        for (const s of list) {
          const existing = next.get(s.sessionId);
          if (existing) {
            // Preserve live in-memory data (timeline/agents) that may be
            // richer than what the main process serializes back, but pick
            // up any new title/status/timestamp fields.
            next.set(s.sessionId, {
              ...existing,
              startedAt: s.startedAt,
              lastActivityAt: s.lastActivityAt,
              status: s.status,
              ...(s.title !== undefined ? { title: s.title } : {})
            });
          } else {
            next.set(s.sessionId, {
              sessionId: s.sessionId,
              startedAt: s.startedAt,
              lastActivityAt: s.lastActivityAt,
              status: s.status,
              ...(s.title !== undefined ? { title: s.title } : {}),
              agents: new Map(s.agents.map((a) => [a.id, a])),
              timeline: s.timeline,
              pinned: false
            });
          }
        }
        return next;
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.warn("SessionContext refreshSessions failed", { message: e.message });
    }
  }, []);

  const refreshSession = useCallback(async (sessionId: string): Promise<void> => {
    // Force-refresh a single session by re-fetching the authoritative snapshot
    // from the main process and replacing the entry in state. We preserve the
    // local `pinned` flag because it lives purely on the renderer side.
    try {
      const snapshot = await window.claudeVillage.getSession(sessionId);
      if (!snapshot) return;
      setSessions((prev) => {
        const next = new Map(prev);
        const existing = next.get(sessionId);
        const pinned = existing?.pinned ?? false;
        next.set(sessionId, {
          sessionId: snapshot.sessionId,
          startedAt: snapshot.startedAt,
          lastActivityAt: snapshot.lastActivityAt,
          status: snapshot.status,
          ...(snapshot.title !== undefined ? { title: snapshot.title } : {}),
          agents: new Map(snapshot.agents.map((a) => [a.id, a])),
          timeline: snapshot.timeline,
          pinned
        });
        return next;
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.warn("SessionContext refreshSession failed", {
        sessionId,
        message: e.message
      });
    }
  }, []);

  const togglePin = useCallback((id: string) => {
    setSessions((prev) => {
      const s = prev.get(id);
      if (!s) return prev;
      const pinned = !s.pinned;
      logger.info("session pin toggled", { sessionId: id, pinned });
      const next = new Map(prev);
      next.set(id, { ...s, pinned });
      void (pinned ? window.claudeVillage.pinSession(id) : window.claudeVillage.unpinSession(id));
      return next;
    });
  }, []);

  return (
    <SessionCtx.Provider
      value={{
        sessions,
        openTabIds,
        activeTabId,
        setActiveTab,
        closeTab,
        togglePin,
        openTab,
        refreshSessions,
        refreshSession
      }}
    >
      {children}
    </SessionCtx.Provider>
  );
}
