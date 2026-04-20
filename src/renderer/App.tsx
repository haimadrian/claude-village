import { useCallback, useEffect, useMemo, useState } from "react";
import { SessionProvider, useSessions } from "./context/SessionContext";
import { VillageScene } from "./village/VillageScene";
import { TimelineStrip } from "./village/TimelineStrip";
import { BubbleDrawer } from "./village/BubbleDrawer";
import { SettingsScreen } from "./settings/SettingsScreen";
import { AboutModal } from "./settings/AboutModal";
import {
  FILTER_CHANGED_EVENT,
  filterMs,
  loadFilter,
  type SessionAgeFilter
} from "./settings/sessionFilter";

const ACTIVE_MS = 60_000;
const IDLE_MS = 10 * 60_000;

// Injected once at the root so the Electron window itself never scrolls and
// so the tab nav can scroll horizontally without showing the scrollbar chrome.
const GLOBAL_STYLE = `
html, body { margin: 0; height: 100%; overflow: hidden; }
#root { height: 100%; overflow: hidden; }
.cv-no-scrollbar::-webkit-scrollbar { display: none; }
@keyframes cv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

function deriveStatus(s: {
  status: "active" | "idle" | "ended";
  lastActivityAt: number;
}): "active" | "idle" | "ended" {
  if (s.status === "ended") return "ended";
  const age = Date.now() - s.lastActivityAt;
  if (age < ACTIVE_MS) return "active";
  if (age < IDLE_MS) return "idle";
  return "ended";
}

export default function App(): JSX.Element {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}

function Shell(): JSX.Element {
  const {
    sessions,
    openTabIds,
    activeTabId,
    setActiveTab,
    closeTab,
    togglePin,
    openTab,
    refreshSessions
  } = useSessions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [ageFilter, setAgeFilter] = useState<SessionAgeFilter>(() => loadFilter());
  const [refreshing, setRefreshing] = useState(false);

  const onRefreshClick = useCallback(() => {
    setRefreshing(true);
    void refreshSessions().finally(() => {
      // Hold the spin briefly even on instant responses so the feedback is
      // visible; the spin animation itself runs for ~600ms regardless.
      window.setTimeout(() => setRefreshing(false), 600);
    });
  }, [refreshSessions]);

  // Preload may not fully populate during dev; guard for existence so the
  // renderer does not crash before the bridge is ready.
  useEffect(() => {
    const unsubscribe = window.claudeVillage?.onMenuAbout?.(() => setAboutOpen(true));
    return () => {
      unsubscribe?.();
    };
  }, []);

  // React to filter changes dispatched from the Settings screen without
  // requiring a reload. The custom event fires synchronously after saveFilter.
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ filter?: SessionAgeFilter }>).detail;
      if (detail?.filter) {
        setAgeFilter(detail.filter);
      } else {
        setAgeFilter(loadFilter());
      }
    };
    window.addEventListener(FILTER_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(FILTER_CHANGED_EVENT, handler);
    };
  }, []);

  const visibleSessions = useMemo(() => {
    const cutoff = filterMs(ageFilter);
    const now = Date.now();
    const list = Array.from(sessions.values()).sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    if (cutoff === null) return list;
    return list.filter((s) => now - s.lastActivityAt <= cutoff);
  }, [sessions, ageFilter]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px minmax(0, 1fr)",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        minHeight: 0,
        minWidth: 0,
        fontFamily: "Inter, -apple-system, sans-serif"
      }}
    >
      <style>{GLOBAL_STYLE}</style>
      <aside
        style={{
          background: "#1f2a1f",
          color: "#dde",
          overflow: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          minHeight: 0
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8
          }}
        >
          <h3 style={{ margin: 0, fontSize: 15 }}>Sessions</h3>
          <button
            onClick={onRefreshClick}
            disabled={refreshing}
            title="Refresh"
            aria-label="Refresh session list"
            style={{
              background: "transparent",
              color: "#dde",
              border: "1px solid #2a3",
              borderRadius: 4,
              padding: "2px 6px",
              cursor: refreshing ? "default" : "pointer",
              fontSize: 14,
              lineHeight: 1,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <span
              style={{
                display: "inline-block",
                animation: refreshing ? "cv-spin 600ms linear" : "none"
              }}
            >
              {"\u21bb"}
            </span>
          </button>
        </div>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 8, flex: 1, minHeight: 0 }}>
          {visibleSessions.map((s) => {
            const live = deriveStatus(s);
            const label = s.title ?? s.sessionId.slice(0, 8);
            const truncated = label.length > 28 ? label.slice(0, 27) + "\u2026" : label;
            return (
              <li key={s.sessionId} style={{ marginBottom: 4 }}>
                <button
                  onClick={() => openTab(s.sessionId)}
                  title={label}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    fontSize: 14,
                    padding: "5px 4px",
                    display: "block",
                    opacity: live === "active" ? 1 : live === "idle" ? 0.7 : 0.45
                  }}
                >
                  {truncated} ({live})
                </button>
              </li>
            );
          })}
        </ul>
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Open settings"
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            textAlign: "left",
            background: "transparent",
            color: "#dde",
            border: "none",
            borderRadius: 6,
            padding: "8px 10px",
            cursor: "pointer",
            fontSize: 14,
            fontFamily: "inherit"
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#17241a";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <span aria-hidden="true">{"\u2699"}</span>
          <span>Settings</span>
        </button>
      </aside>
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#0e1a0e",
          color: "#dde",
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          overflow: "hidden"
        }}
      >
        <nav
          className="cv-no-scrollbar"
          style={{
            display: "flex",
            background: "#182418",
            borderBottom: "1px solid #2a3",
            overflowX: "auto",
            overflowY: "hidden",
            flexShrink: 0,
            maxWidth: "100%",
            scrollbarWidth: "none",
            msOverflowStyle: "none"
          }}
        >
          {openTabIds.map((id) => {
            const s = sessions.get(id);
            const isActive = id === activeTabId;
            const fullLabel = s?.title ?? id.slice(0, 8);
            const tabLabel = fullLabel.length > 14 ? fullLabel.slice(0, 14) + "\u2026" : fullLabel;
            return (
              <div
                key={id}
                style={{
                  padding: "8px 12px",
                  background: isActive ? "#0e1a0e" : "transparent",
                  borderRight: "1px solid #2a3",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexShrink: 0
                }}
              >
                <button
                  onClick={() => setActiveTab(id)}
                  title={fullLabel}
                  style={{ all: "unset", cursor: "pointer" }}
                >
                  {tabLabel}
                </button>
                <button onClick={() => togglePin(id)} title="pin">
                  {s?.pinned ? "📌" : "📍"}
                </button>
                <button onClick={() => closeTab(id)} title="close">
                  ✕
                </button>
              </div>
            );
          })}
        </nav>
        <section
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            position: "relative"
          }}
        >
          {activeTabId ? (
            <TabBody sessionId={activeTabId} />
          ) : (
            <div style={{ padding: 24 }}>No active session</div>
          )}
        </section>
      </main>
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}

function TabBody({ sessionId }: { sessionId: string }): JSX.Element {
  const { sessions, refreshSession } = useSessions();
  const [refreshing, setRefreshing] = useState(false);
  const s = sessions.get(sessionId);
  const onFocusAgent = useCallback(
    (id: string) =>
      window.dispatchEvent(new CustomEvent("village:focus-agent", { detail: { agentId: id } })),
    []
  );
  const onRefreshSession = useCallback(() => {
    setRefreshing(true);
    void refreshSession(sessionId).finally(() => {
      window.setTimeout(() => setRefreshing(false), 600);
    });
  }, [refreshSession, sessionId]);
  if (!s) return <div style={{ padding: 24 }}>Loading...</div>;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          overflow: "hidden"
        }}
      >
        <VillageScene sessionId={sessionId} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          background: "rgba(0,0,0,0.5)",
          padding: 8,
          borderRadius: 4,
          pointerEvents: "none"
        }}
      >
        <div>{sessionId.slice(0, 8)}</div>
        <div>Agents: {s.agents.size}</div>
        <div>Status: {s.status}</div>
      </div>
      <button
        onClick={onRefreshSession}
        disabled={refreshing}
        title="Refresh session"
        aria-label="Refresh session"
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 10,
          background: "rgba(0,0,0,0.5)",
          color: "#dde",
          border: "1px solid #2a3",
          borderRadius: 4,
          padding: "4px 8px",
          cursor: refreshing ? "default" : "pointer",
          fontSize: 14,
          lineHeight: 1
        }}
      >
        <span
          style={{
            display: "inline-block",
            animation: refreshing ? "cv-spin 600ms linear" : "none"
          }}
        >
          {"\u21bb"}
        </span>
      </button>
      <TimelineStrip timeline={s.timeline} agents={s.agents} onFocusAgent={onFocusAgent} />
      <BubbleDrawer agents={s.agents} />
    </div>
  );
}
