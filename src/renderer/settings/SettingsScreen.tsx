import { useEffect, useMemo, useState } from "react";
import { AboutModal } from "./AboutModal";
import {
  loadFilter,
  saveFilter,
  SESSION_AGE_FILTER_OPTIONS,
  type SessionAgeFilter
} from "./sessionFilter";

const HOOK_SNIPPET: string = JSON.stringify(
  {
    hooks: {
      PreToolUse: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command:
                "curl -sS -X POST -H 'Content-Type: application/json' -d \"$CLAUDE_HOOK_PAYLOAD\" http://127.0.0.1:49251/event"
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command:
                "curl -sS -X POST -H 'Content-Type: application/json' -d \"$CLAUDE_HOOK_PAYLOAD\" http://127.0.0.1:49251/event"
            }
          ]
        }
      ],
      SessionStart: [
        {
          hooks: [
            {
              type: "command",
              command:
                "curl -sS -X POST -H 'Content-Type: application/json' -d \"$CLAUDE_HOOK_PAYLOAD\" http://127.0.0.1:49251/event"
            }
          ]
        }
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command:
                "curl -sS -X POST -H 'Content-Type: application/json' -d \"$CLAUDE_HOOK_PAYLOAD\" http://127.0.0.1:49251/event"
            }
          ]
        }
      ]
    }
  },
  null,
  2
);

export function SettingsScreen({ onClose }: { onClose: () => void }): JSX.Element {
  const [about, setAbout] = useState(false);
  const [ghostMinutes, setGhostMinutes] = useState(3);
  const [copied, setCopied] = useState(false);
  const [ageFilter, setAgeFilter] = useState<SessionAgeFilter>(() => loadFilter());

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        if (about) {
          setAbout(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [about, onClose]);

  const copyTimerRef = useMemo(() => ({ id: null as ReturnType<typeof setTimeout> | null }), []);
  useEffect(() => {
    return () => {
      if (copyTimerRef.id !== null) {
        clearTimeout(copyTimerRef.id);
      }
    };
  }, [copyTimerRef]);

  const handleCopy = async (): Promise<void> => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(HOOK_SNIPPET);
      }
      setCopied(true);
      if (copyTimerRef.id !== null) clearTimeout(copyTimerRef.id);
      copyTimerRef.id = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may fail in restricted contexts; surface a best-effort no-op.
      setCopied(false);
    }
  };

  const handleFilterChange = (next: SessionAgeFilter): void => {
    setAgeFilter(next);
    saveFilter(next);
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2500
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1f2a1f",
          color: "#eee",
          padding: 24,
          borderRadius: 8,
          width: 460,
          maxHeight: "90vh",
          overflowY: "auto"
        }}
      >
        <h2 id="settings-title" style={{ margin: "0 0 16px" }}>
          Settings
        </h2>
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Data source</h3>
          <div style={{ fontSize: 13, marginBottom: 8, opacity: 0.85 }}>
            Tailing JSONL files (always on).
          </div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            To also enable low-latency hooks, paste the snippet below into{" "}
            <code>~/.claude/settings.json</code>:
          </div>
          <div style={{ position: "relative" }}>
            <pre
              style={{
                background: "#0e1a0e",
                color: "#cde",
                padding: 10,
                borderRadius: 4,
                fontSize: 11,
                lineHeight: 1.4,
                maxHeight: 180,
                overflow: "auto",
                margin: 0,
                border: "1px solid #2a3"
              }}
            >
              {HOOK_SNIPPET}
            </pre>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 6
              }}
            >
              <button
                type="button"
                onClick={() => {
                  void handleCopy();
                }}
                style={{
                  background: "#2a3a2a",
                  color: "#eee",
                  border: "1px solid #3a4",
                  borderRadius: 4,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                Copy snippet
              </button>
              {copied && (
                <span style={{ fontSize: 12, color: "#8dff8d" }} role="status">
                  Copied!
                </span>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12, marginTop: 8, opacity: 0.75 }}>
            Paste this into <code>~/.claude/settings.json</code> to enable low-latency live mode.
            Automated install is planned.
          </div>
        </section>
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Session list</h3>
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            Show sessions from the last
            <select
              value={ageFilter}
              onChange={(e) => handleFilterChange(e.target.value as SessionAgeFilter)}
              style={{
                background: "#0e1a0e",
                color: "#eee",
                border: "1px solid #2a3",
                borderRadius: 4,
                padding: "4px 8px",
                fontSize: 13
              }}
            >
              {SESSION_AGE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Ghost retirement</h3>
          <label style={{ fontSize: 13 }}>
            Timer (minutes):{" "}
            <input
              type="number"
              value={ghostMinutes}
              min={1}
              max={60}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) {
                  setGhostMinutes(next);
                }
              }}
              style={{ width: 50 }}
            />
          </label>
        </section>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button onClick={() => setAbout(true)}>About</button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
      {about && <AboutModal onClose={() => setAbout(false)} />}
    </div>
  );
}
