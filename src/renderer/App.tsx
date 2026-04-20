import { useCallback, useEffect, useState } from "react";
import { SessionProvider, useSessions } from "./context/SessionContext";
import { VillageScene } from "./village/VillageScene";
import { TimelineStrip } from "./village/TimelineStrip";
import { BubbleDrawer } from "./village/BubbleDrawer";
import { SettingsScreen } from "./settings/SettingsScreen";
import { AboutModal } from "./settings/AboutModal";

export default function App(): JSX.Element {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}

function Shell(): JSX.Element {
  const { sessions, openTabIds, activeTabId, setActiveTab, closeTab, togglePin, openTab } =
    useSessions();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

  // Preload may not fully populate during dev; guard for existence so the
  // renderer does not crash before the bridge is ready.
  useEffect(() => {
    const unsubscribe = window.claudeVillage?.onMenuAbout?.(() => setAboutOpen(true));
    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr",
        height: "100vh",
        fontFamily: "Inter, -apple-system, sans-serif"
      }}
    >
      <aside
        style={{
          background: "#1f2a1f",
          color: "#dde",
          overflow: "auto",
          padding: 12
        }}
      >
        <h3 style={{ margin: 0, fontSize: 14 }}>Sessions</h3>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
          {Array.from(sessions.values()).map((s) => (
            <li key={s.sessionId} style={{ marginBottom: 4 }}>
              <button
                onClick={() => openTab(s.sessionId)}
                style={{ all: "unset", cursor: "pointer", fontSize: 12 }}
              >
                {s.sessionId.slice(0, 8)} ({s.status})
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#0e1a0e",
          color: "#dde"
        }}
      >
        <nav
          style={{
            display: "flex",
            background: "#182418",
            borderBottom: "1px solid #2a3"
          }}
        >
          {openTabIds.map((id) => {
            const s = sessions.get(id);
            const isActive = id === activeTabId;
            return (
              <div
                key={id}
                style={{
                  padding: "8px 12px",
                  background: isActive ? "#0e1a0e" : "transparent",
                  borderRight: "1px solid #2a3",
                  display: "flex",
                  gap: 8,
                  alignItems: "center"
                }}
              >
                <button
                  onClick={() => setActiveTab(id)}
                  style={{ all: "unset", cursor: "pointer" }}
                >
                  {id.slice(0, 8)}
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
        <section style={{ flex: 1, padding: 24 }}>
          {activeTabId ? <TabBody sessionId={activeTabId} /> : <div>No active session</div>}
        </section>
      </main>
      <button
        onClick={() => setSettingsOpen(true)}
        title="Settings"
        aria-label="Open settings"
        style={{
          position: "fixed",
          top: 8,
          right: 8,
          zIndex: 100,
          background: "#1f2a1f",
          color: "#eee",
          border: "1px solid #2a3",
          borderRadius: 4,
          padding: "4px 8px",
          cursor: "pointer"
        }}
      >
        ⚙
      </button>
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
    </div>
  );
}

function TabBody({ sessionId }: { sessionId: string }): JSX.Element {
  const { sessions } = useSessions();
  const s = sessions.get(sessionId);
  const onFocusAgent = useCallback(
    (id: string) =>
      window.dispatchEvent(new CustomEvent("village:focus-agent", { detail: { agentId: id } })),
    []
  );
  if (!s) return <div>Loading...</div>;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <VillageScene sessionId={sessionId} />
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
      <TimelineStrip timeline={s.timeline} agents={s.agents} onFocusAgent={onFocusAgent} />
      <BubbleDrawer agents={s.agents} />
    </div>
  );
}
