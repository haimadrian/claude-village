import { SessionProvider, useSessions } from "./context/SessionContext";

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
    </div>
  );
}

function TabBody({ sessionId }: { sessionId: string }): JSX.Element {
  const { sessions } = useSessions();
  const s = sessions.get(sessionId);
  if (!s) return <div>Loading...</div>;
  return (
    <div>
      <h2>{sessionId}</h2>
      <p>Agents: {s.agents.size}</p>
      <p>Status: {s.status}</p>
      {/* TODO(integration): render <VillageScene /> after merge with Task 9 */}
      <div>Village scene mounts here</div>
    </div>
  );
}
