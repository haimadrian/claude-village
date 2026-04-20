import { useEffect, useRef, useState } from "react";
import type { AgentKind, AgentState, TimelineLine } from "../../shared/types";

interface Props {
  timeline: TimelineLine[];
  agents: Map<string, AgentState>;
  onFocusAgent: (agentId: string) => void;
}

const PALETTE = ["#f4a261", "#e76f51", "#2a9d8f", "#e9c46a", "#264653", "#c77dff", "#06a77d"];

const MAIN_COLOR = "#ffd166";

// Stable per-agent color: main agent always gets MAIN_COLOR, subagents hash to PALETTE.
// Exported for unit-testability and to keep the render path branch-free.
export function colorFor(agentId: string, kind: AgentKind): string {
  if (kind === "main") return MAIN_COLOR;
  let h = 0;
  for (let i = 0; i < agentId.length; i++) {
    h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length]!;
}

export function TimelineStrip({ timeline, agents, onFocusAgent }: Props) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [stuckToBottom, setStuckToBottom] = useState(true);

  // Auto-scroll to the newest line while the user is parked at the bottom; if
  // they have scrolled up to read history, we leave their position alone.
  useEffect(() => {
    if (open && stuckToBottom && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [timeline, open, stuckToBottom]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "rgba(0,0,0,0.85)",
        color: "#eee",
        fontFamily: "monospace",
        fontSize: 12,
        zIndex: 10
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "4px 8px",
          display: "block",
          width: "100%",
          background: "#222",
          boxSizing: "border-box"
        }}
      >
        {open ? "\u25BC Timeline" : "\u25B2 Timeline"} ({timeline.length})
      </button>
      {open && (
        <div
          ref={listRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            setStuckToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 8);
          }}
          style={{ height: 180, overflowY: "auto", padding: 8 }}
        >
          {timeline.map((line) => {
            const agent = agents.get(line.agentId);
            const kind: AgentKind = agent?.kind ?? line.agentKind;
            return (
              <div
                key={line.id}
                onClick={() => onFocusAgent(line.agentId)}
                style={{
                  cursor: "pointer",
                  marginBottom: 2,
                  color: colorFor(line.agentId, kind)
                }}
                title={`Focus camera on ${line.agentId.slice(0, 6)}`}
              >
                <span style={{ opacity: 0.6 }}>
                  {new Date(line.timestamp).toLocaleTimeString()}{" "}
                </span>
                <span style={{ opacity: 0.7 }}>[{line.agentId.slice(0, 6)}] </span>
                <span>{line.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
