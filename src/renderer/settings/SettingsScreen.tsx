import { useEffect, useState } from "react";
import { AboutModal } from "./AboutModal";

export function SettingsScreen({ onClose }: { onClose: () => void }): JSX.Element {
  const [about, setAbout] = useState(false);
  const [tailJsonl, setTailJsonl] = useState(true);
  const [enableHooks, setEnableHooks] = useState(false);
  const [ghostMinutes, setGhostMinutes] = useState(3);

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
          width: 420
        }}
      >
        <h2 id="settings-title" style={{ margin: "0 0 16px" }}>
          Settings
        </h2>
        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Data source</h3>
          <label style={{ display: "block", fontSize: 13, marginBottom: 4 }}>
            <input
              type="checkbox"
              checked={tailJsonl}
              onChange={(e) => setTailJsonl(e.target.checked)}
            />{" "}
            Tail JSONL files (default)
          </label>
          <label style={{ display: "block", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={enableHooks}
              onChange={(e) => setEnableHooks(e.target.checked)}
            />{" "}
            Enable hooks (requires settings.json edit)
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
