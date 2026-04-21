import { useEffect } from "react";
import { ZONES } from "../../shared/zones";

// Static, content-only dialog. Mirrors the AboutModal chrome (overlay + panel
// + Esc close) so the feel stays consistent across the three sidebar icons.
// Kept intentionally duplicated rather than abstracted to a shared shell so
// each modal can tune its own sizing without a premature shared component.

export function HelpModal({ onClose }: { onClose: () => void }): JSX.Element {
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

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
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
          padding: 24,
          borderRadius: 8,
          width: 560,
          maxHeight: "85vh",
          overflowY: "auto",
          fontSize: 13,
          lineHeight: 1.5
        }}
      >
        <h2 id="help-title" style={{ margin: "0 0 12px" }}>
          claude-village - Help
        </h2>

        <section style={{ marginBottom: 16 }}>
          <p style={{ margin: 0 }}>
            claude-village visualises your running Claude Code sessions as a voxel village. Each
            session is a tab, each agent is a character, and zones represent the tools the agent is
            using right now. Hover, click, and pan to explore.
          </p>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Camera</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Click and drag to orbit the camera around the village.</li>
            <li>Scroll or pinch to zoom, bounded to a safe range.</li>
            <li>Click a zone to glide the camera to it.</li>
            <li>Click a timeline segment to pan to that agent at that moment.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Mouse</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Hover a zone tile to see its name and the tools it represents.</li>
            <li>Hover the signpost for recent WebFetch / MCP destinations.</li>
            <li>Hover a tool icon above a character to see which tool is running.</li>
            <li>Hover a character or its label for the agent ID, display name, and action log.</li>
            <li>Click a speech bubble to open the full-message drawer.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Keyboard shortcuts</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <code>Esc</code> - close the bubble drawer, any open modal, or the settings pane.
            </li>
            <li>
              <code>Cmd+,</code> - open settings.
            </li>
            <li>
              <code>Cmd+W</code> - close the current tab.
            </li>
            <li>
              <code>Cmd+Option+I</code> - toggle DevTools (renderer).
            </li>
            <li>
              <code>Arrow keys</code> - pan the village camera along the ground plane. Hold{" "}
              <code>Shift</code> to pan faster.
            </li>
            <li>
              <code>+</code> / <code>=</code> / <code>PgUp</code> - dolly the camera in.
            </li>
            <li>
              <code>-</code> / <code>_</code> / <code>PgDn</code> - dolly out.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Zones</h3>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.7 }}>
                <th style={{ padding: "4px 6px", width: 32 }}></th>
                <th style={{ padding: "4px 6px", width: 110 }}>Zone</th>
                <th style={{ padding: "4px 6px" }}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {ZONES.map((z) => (
                <tr key={z.id} style={{ borderTop: "1px solid #2a3" }}>
                  <td style={{ padding: "6px", fontSize: 16 }} aria-hidden="true">
                    {z.icon}
                  </td>
                  <td style={{ padding: "6px" }}>{z.name}</td>
                  <td style={{ padding: "6px", opacity: 0.9 }}>{z.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 16px" }} aria-label="Close help dialog">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
