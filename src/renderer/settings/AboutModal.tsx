import { useEffect } from "react";

export function AboutModal({ onClose }: { onClose: () => void }): JSX.Element {
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
      aria-labelledby="about-title"
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
          width: 360,
          textAlign: "center"
        }}
      >
        <div style={{ fontSize: 48 }} aria-hidden="true">
          {"\u{1F9F1}"}
        </div>
        <h2 id="about-title" style={{ margin: "8px 0 4px" }}>
          claude-village
        </h2>
        <div style={{ opacity: 0.7, fontSize: 12 }}>v0.1.0</div>
        <p style={{ marginTop: 16, fontSize: 13 }}>Created by Haim Adrian for Claude Code users.</p>
        <button
          onClick={onClose}
          style={{ marginTop: 16, padding: "6px 16px" }}
          aria-label="Close about dialog"
        >
          Close
        </button>
      </div>
    </div>
  );
}
