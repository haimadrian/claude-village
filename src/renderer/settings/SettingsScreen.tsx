import { useEffect, useMemo, useState } from "react";
import {
  loadFilter,
  saveFilter,
  SESSION_AGE_FILTER_OPTIONS,
  type SessionAgeFilter
} from "./sessionFilter";
import type { HookReadOk } from "../types/ipc-client";

const HOOK_SNIPPET: string = JSON.stringify(
  {
    hooks: {
      PreToolUse: [
        {
          matcher: ".*",
          hooks: [
            {
              type: "command",
              command:
                "curl -s --max-time 2 -X POST -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:49251/event >/dev/null 2>&1 || true"
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: ".*",
          hooks: [
            {
              type: "command",
              command:
                "curl -s --max-time 2 -X POST -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:49251/event >/dev/null 2>&1 || true"
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
                "curl -s --max-time 2 -X POST -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:49251/event >/dev/null 2>&1 || true"
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
                "curl -s --max-time 2 -X POST -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:49251/event >/dev/null 2>&1 || true"
            }
          ]
        }
      ]
    }
  },
  null,
  2
);

type HookBanner = { kind: "success" | "error"; message: string } | null;

export function SettingsScreen({ onClose }: { onClose: () => void }): JSX.Element {
  const [ghostMinutes, setGhostMinutes] = useState(3);
  const [copied, setCopied] = useState(false);
  const [ageFilter, setAgeFilter] = useState<SessionAgeFilter>(() => loadFilter());
  const [hookPreview, setHookPreview] = useState<HookReadOk | null>(null);
  const [hookAction, setHookAction] = useState<"install" | "uninstall" | null>(null);
  const [hookBusy, setHookBusy] = useState(false);
  const [hookBanner, setHookBanner] = useState<HookBanner>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

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

  const openHookPreview = async (action: "install" | "uninstall"): Promise<void> => {
    setHookBanner(null);
    try {
      const res = await window.claudeVillage.readHooks();
      if (!res.ok) {
        setHookBanner({ kind: "error", message: res.error });
        return;
      }
      setHookPreview(res);
      setHookAction(action);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHookBanner({ kind: "error", message });
    }
  };

  const closeHookPreview = (): void => {
    setHookPreview(null);
    setHookAction(null);
  };

  const confirmHookAction = async (): Promise<void> => {
    if (!hookAction) return;
    setHookBusy(true);
    try {
      const res =
        hookAction === "install"
          ? await window.claudeVillage.installHooks()
          : await window.claudeVillage.uninstallHooks();
      if (!res.ok) {
        setHookBanner({ kind: "error", message: res.error });
      } else if (!res.changed) {
        setHookBanner({
          kind: "success",
          message:
            hookAction === "install"
              ? "Hook already installed. No changes made."
              : "No claude-village hooks found. Nothing to remove."
        });
      } else {
        setHookBanner({
          kind: "success",
          message:
            hookAction === "install"
              ? "Hook installed. Restart Claude Code for it to take effect."
              : "Hook uninstalled. Restart Claude Code for it to take effect."
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHookBanner({ kind: "error", message });
    } finally {
      setHookBusy(false);
      closeHookPreview();
    }
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
            To also enable low-latency hooks, install them automatically or paste the snippet below
            into <code>~/.claude/settings.json</code>:
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                void openHookPreview("install");
              }}
              disabled={hookBusy}
              style={{
                background: "#2d4a2d",
                color: "#eee",
                border: "1px solid #4a6",
                borderRadius: 4,
                padding: "6px 12px",
                fontSize: 12,
                cursor: hookBusy ? "not-allowed" : "pointer"
              }}
            >
              Install hook
            </button>
            <button
              type="button"
              onClick={() => {
                void openHookPreview("uninstall");
              }}
              disabled={hookBusy}
              style={{
                background: "#3a2a2a",
                color: "#eee",
                border: "1px solid #a66",
                borderRadius: 4,
                padding: "6px 12px",
                fontSize: 12,
                cursor: hookBusy ? "not-allowed" : "pointer"
              }}
            >
              Uninstall hook
            </button>
          </div>
          {hookBanner && (
            <div
              role="status"
              style={{
                fontSize: 12,
                padding: "6px 8px",
                borderRadius: 4,
                marginBottom: 8,
                background: hookBanner.kind === "success" ? "#1e3320" : "#3a2020",
                color: hookBanner.kind === "success" ? "#8dff8d" : "#ff9b9b",
                border: hookBanner.kind === "success" ? "1px solid #3a6" : "1px solid #a44"
              }}
            >
              {hookBanner.message}
            </div>
          )}
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
            Manual install: paste this into <code>~/.claude/settings.json</code>. Automated install
            merges these entries into your existing file without overwriting user hooks.
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
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
      {hookPreview && hookAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="hook-confirm-title"
          onClick={closeHookPreview}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1f2a1f",
              color: "#eee",
              padding: 20,
              borderRadius: 8,
              width: 640,
              maxHeight: "85vh",
              overflowY: "auto"
            }}
          >
            <h3 id="hook-confirm-title" style={{ margin: "0 0 8px" }}>
              {hookAction === "install" ? "Install hook" : "Uninstall hook"}
            </h3>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
              {hookPreview.settingsPath}
            </div>
            {hookPreview.isInstalled && hookAction === "install" ? (
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                Hook is already installed. No changes will be made.
              </div>
            ) : (
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                Review the change. We keep any existing hooks and only add / remove claude-village
                entries (targeting port 49251).
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>Current</div>
                <pre
                  style={{
                    background: "#0e1a0e",
                    color: "#cde",
                    padding: 8,
                    borderRadius: 4,
                    fontSize: 10,
                    lineHeight: 1.4,
                    maxHeight: 280,
                    overflow: "auto",
                    margin: 0,
                    border: "1px solid #2a3"
                  }}
                >
                  {hookPreview.currentText.trim() === ""
                    ? "(file does not exist)"
                    : hookPreview.currentText}
                </pre>
              </div>
              <div>
                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>
                  {hookAction === "install" ? "After install" : "After uninstall"}
                </div>
                <pre
                  style={{
                    background: "#0e1a0e",
                    color: "#cde",
                    padding: 8,
                    borderRadius: 4,
                    fontSize: 10,
                    lineHeight: 1.4,
                    maxHeight: 280,
                    overflow: "auto",
                    margin: 0,
                    border: "1px solid #2a3"
                  }}
                >
                  {hookPreview.mergedText}
                </pre>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 14
              }}
            >
              <button type="button" onClick={closeHookPreview} disabled={hookBusy}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmHookAction();
                }}
                disabled={hookBusy}
                style={{
                  background: hookAction === "install" ? "#2d4a2d" : "#3a2a2a",
                  color: "#eee",
                  border: hookAction === "install" ? "1px solid #4a6" : "1px solid #a66",
                  borderRadius: 4,
                  padding: "6px 12px",
                  fontSize: 12,
                  cursor: hookBusy ? "not-allowed" : "pointer"
                }}
              >
                {hookBusy ? "Working..." : hookAction === "install" ? "Install" : "Uninstall"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
