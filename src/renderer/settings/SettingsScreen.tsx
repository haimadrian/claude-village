import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadFilter,
  saveFilter,
  SESSION_AGE_FILTER_OPTIONS,
  type SessionAgeFilter
} from "./sessionFilter";
import type { HookReadOk } from "../types/ipc-client";

const GHOST_MINUTES_MIN = 1;
const GHOST_MINUTES_MAX = 60;
const GHOST_MINUTES_DEFAULT = 3;
// Debounce window for persisting the ghost-retirement timer: long enough that
// holding a key or clicking the spinner a few times collapses to one IPC
// call, short enough that the user perceives the save as "immediate".
const GHOST_WRITE_DEBOUNCE_MS = 400;
// How long the "Saved" confirmation stays on screen after a successful write.
const GHOST_SAVED_BANNER_MS = 2000;

type GhostSaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

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
  const [ghostMinutes, setGhostMinutes] = useState<number>(GHOST_MINUTES_DEFAULT);
  const [ghostSaveStatus, setGhostSaveStatus] = useState<GhostSaveStatus>({ kind: "idle" });
  const ghostWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ghostSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Value currently queued for persistence by the debounced timer. We keep
  // it in a ref so the timer callback always sees the latest input without
  // needing to re-register on every keystroke.
  const pendingGhostMinutesRef = useRef<number>(GHOST_MINUTES_DEFAULT);
  const [copied, setCopied] = useState(false);
  const [ageFilter, setAgeFilter] = useState<SessionAgeFilter>(() => loadFilter());
  const [hookPreview, setHookPreview] = useState<HookReadOk | null>(null);
  const [hookAction, setHookAction] = useState<"install" | "uninstall" | null>(null);
  const [hookBusy, setHookBusy] = useState(false);
  const [hookBanner, setHookBanner] = useState<HookBanner>(null);

  // Seed the input from the main-process persisted value on mount. Any
  // failure (IPC not wired up, file unreadable, etc.) silently falls back
  // to the default: a broken read must not strand the user with a frozen
  // input.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await window.claudeVillage.readUserSettings();
        if (cancelled) return;
        if (res.ok) {
          const clamped = Math.max(
            GHOST_MINUTES_MIN,
            Math.min(GHOST_MINUTES_MAX, res.idleBeforeGhostMinutes)
          );
          setGhostMinutes(clamped);
          pendingGhostMinutesRef.current = clamped;
        }
      } catch {
        // Ignore; default already rendered.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cancel any pending debounce / saved-banner timer on unmount so we don't
  // call setState on an unmounted dialog.
  useEffect(() => {
    return () => {
      if (ghostWriteTimerRef.current !== null) clearTimeout(ghostWriteTimerRef.current);
      if (ghostSavedTimerRef.current !== null) clearTimeout(ghostSavedTimerRef.current);
    };
  }, []);

  const scheduleGhostWrite = (value: number): void => {
    pendingGhostMinutesRef.current = value;
    if (ghostWriteTimerRef.current !== null) {
      clearTimeout(ghostWriteTimerRef.current);
    }
    ghostWriteTimerRef.current = setTimeout(() => {
      ghostWriteTimerRef.current = null;
      const next = pendingGhostMinutesRef.current;
      setGhostSaveStatus({ kind: "saving" });
      void (async () => {
        try {
          const res = await window.claudeVillage.writeUserSettings({
            idleBeforeGhostMinutes: next
          });
          if (res.ok) {
            setGhostSaveStatus({ kind: "saved" });
            if (ghostSavedTimerRef.current !== null) clearTimeout(ghostSavedTimerRef.current);
            ghostSavedTimerRef.current = setTimeout(() => {
              setGhostSaveStatus({ kind: "idle" });
              ghostSavedTimerRef.current = null;
            }, GHOST_SAVED_BANNER_MS);
          } else {
            setGhostSaveStatus({ kind: "error", message: res.error });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setGhostSaveStatus({ kind: "error", message });
        }
      })();
    }, GHOST_WRITE_DEBOUNCE_MS);
  };

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
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            Timer (minutes):{" "}
            <input
              type="number"
              value={ghostMinutes}
              min={GHOST_MINUTES_MIN}
              max={GHOST_MINUTES_MAX}
              step={1}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (!Number.isFinite(raw)) return;
                // Update the input immediately so typing feels responsive,
                // but clamp what we persist to the valid range. Non-integer
                // typed values (from keystrokes mid-edit) get rounded at
                // write time so the main process never stores fractions.
                const rounded = Math.round(raw);
                const clamped = Math.max(GHOST_MINUTES_MIN, Math.min(GHOST_MINUTES_MAX, rounded));
                setGhostMinutes(clamped);
                scheduleGhostWrite(clamped);
              }}
              style={{ width: 60 }}
              aria-label="Ghost retirement timer minutes"
            />
            {ghostSaveStatus.kind === "saved" && (
              <span style={{ fontSize: 12, color: "#8dff8d" }} role="status">
                Saved
              </span>
            )}
          </label>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.75 }}>
            How long a villager can stay idle before becoming a ghost. Ghosts then hang around for
            one hour before despawning.
          </div>
          {ghostSaveStatus.kind === "error" && (
            <div
              role="alert"
              style={{
                fontSize: 12,
                marginTop: 6,
                color: "#ff9b9b"
              }}
            >
              Failed to save: {ghostSaveStatus.message}
            </div>
          )}
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
