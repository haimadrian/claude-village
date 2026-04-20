import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AgentState, TimelineLine } from "../../shared/types";
import type { SessionPatch } from "../types/ipc-client";

export interface TabSession {
  sessionId: string;
  startedAt: number;
  lastActivityAt: number;
  status: "active" | "idle" | "ended";
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
          agents: new Map(s.agents.map((a) => [a.id, a])),
          timeline: s.timeline,
          pinned: false
        });
      }
      setSessions(map);
      const active = list
        .filter((s) => Date.now() - s.lastActivityAt < 10 * 60 * 1000)
        .map((s) => s.sessionId);
      setOpenTabIds(active);
      setActiveTabId(active[0] ?? null);
    })();

    const applyPatch = (p: SessionPatch): void => {
      setSessions((prev) => {
        const next = new Map(prev);
        let session = next.get(p.sessionId);
        for (const change of p.changes) {
          if (change.kind === "session-upsert") {
            if (!session) {
              session = {
                sessionId: p.sessionId,
                startedAt: change.session.startedAt,
                lastActivityAt: change.session.lastActivityAt,
                status: change.session.status,
                agents: new Map(),
                timeline: [],
                pinned: false
              };
            }
            session = { ...session, ...change.session };
          } else if (change.kind === "agent-upsert" && session) {
            const agents = new Map(session.agents);
            agents.set(change.agent.id, change.agent);
            session = { ...session, agents };
          } else if (change.kind === "agent-remove" && session) {
            const agents = new Map(session.agents);
            agents.delete(change.agentId);
            session = { ...session, agents };
          } else if (change.kind === "timeline-append" && session) {
            const timeline = [...session.timeline, change.line].slice(-500);
            session = { ...session, timeline };
          }
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
    setOpenTabIds((prev) => prev.filter((x) => x !== id));
    setClosedTabIds((prev) => {
      if (prev.has(id)) return prev;
      const n = new Set(prev);
      n.add(id);
      return n;
    });
    setActiveTabId((prev) => (prev === id ? null : prev));
  }, []);

  const togglePin = useCallback((id: string) => {
    setSessions((prev) => {
      const s = prev.get(id);
      if (!s) return prev;
      const pinned = !s.pinned;
      const next = new Map(prev);
      next.set(id, { ...s, pinned });
      void (pinned ? window.claudeVillage.pinSession(id) : window.claudeVillage.unpinSession(id));
      return next;
    });
  }, []);

  return (
    <SessionCtx.Provider
      value={{ sessions, openTabIds, activeTabId, setActiveTab, closeTab, togglePin, openTab }}
    >
      {children}
    </SessionCtx.Provider>
  );
}
