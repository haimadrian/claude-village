import { useEffect, useState } from "react";
import type { AgentState } from "../../shared/types";

interface Props {
  agents: Map<string, AgentState>;
}

/**
 * Right-side drawer that shows the full recent-action history for one agent.
 * Opens in response to a `village:open-bubble` CustomEvent dispatched from
 * a Character bubble; closes on Esc or the X button.
 */
export function BubbleDrawer({ agents }: Props) {
  const [openFor, setOpenFor] = useState<string | null>(null);

  useEffect(() => {
    const open = (e: Event) => {
      const detail = (e as CustomEvent<{ agentId: string }>).detail;
      if (detail?.agentId) setOpenFor(detail.agentId);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFor(null);
    };
    window.addEventListener("village:open-bubble", open);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("village:open-bubble", open);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!openFor) return null;
  const agent = agents.get(openFor);
  if (!agent) return null;

  const reversed = agent.recentActions.slice().reverse();

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        background: "rgba(20,20,20,0.97)",
        color: "#eee",
        padding: 16,
        overflowY: "auto",
        zIndex: 2000
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12
        }}
      >
        <h3 style={{ margin: 0 }}>
          {agent.kind === "main" ? "🛡 " : ""}
          {agent.id.slice(0, 12)}
        </h3>
        <button
          onClick={() => setOpenFor(null)}
          style={{ all: "unset", cursor: "pointer", fontSize: 18 }}
          aria-label="Close drawer"
        >
          ✕
        </button>
      </div>
      {reversed.length === 0 && (
        <div style={{ opacity: 0.6, fontStyle: "italic" }}>No recent actions.</div>
      )}
      {reversed.map((a, i) => (
        <div
          key={`${a.timestamp}-${i}`}
          style={{
            marginBottom: 10,
            fontFamily: "monospace",
            fontSize: 12,
            padding: 8,
            background: "rgba(255,255,255,0.05)",
            borderRadius: 4
          }}
        >
          <div style={{ opacity: 0.6 }}>
            {new Date(a.timestamp).toLocaleTimeString()} · {a.zone}
          </div>
          <div>{a.summary}</div>
        </div>
      ))}
    </div>
  );
}
