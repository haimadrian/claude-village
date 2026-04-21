import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { ZONES } from "../../shared/zones";
import { useSessions, type TabSession } from "../context/SessionContext";
import { buildAgentLabels, labelFor } from "./agentLabels";

type TooltipKind = "zone" | "zone-ground" | "zone-signpost" | "zone-icon" | "character";

interface TooltipUserData {
  tooltipKind: TooltipKind;
  zoneId?: string;
  zoneName?: string;
  zoneDescription?: string;
  agentId?: string;
  agentKind?: string;
}

interface HoverTarget {
  kind: TooltipKind;
  data: TooltipUserData;
  screen: { x: number; y: number };
}

const HOVER_DELAY_MS = 200;

interface TooltipLayerProps {
  sessionId?: string;
}

export function TooltipLayer({ sessionId }: TooltipLayerProps) {
  const { sessions } = useSessions();
  const { scene, camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e: PointerEvent): void => {
      const rect = el.getBoundingClientRect();
      pointer.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const screenX = e.clientX;
      const screenY = e.clientY;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        raycaster.current.setFromCamera(pointer.current, camera);
        const hits = raycaster.current.intersectObjects(scene.children, true);
        for (const hit of hits) {
          const ud = findUserData(hit.object);
          if (!ud) continue;
          setHover({ kind: ud.tooltipKind, data: ud, screen: { x: screenX, y: screenY } });
          return;
        }
        setHover(null);
      }, HOVER_DELAY_MS);
    };
    const onLeave = (): void => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      setHover(null);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [camera, gl, scene]);

  if (!hover) return null;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  const content = renderContent(hover, session);
  if (!content) return null;
  return (
    // Wrapper set to `pointer-events: none` so the tooltip panel itself
    // never intercepts pointer events on the canvas (which would cause the
    // raycast to stop firing while the tooltip is visible).
    <Html style={{ pointerEvents: "none" }}>
      <div
        data-testid="tooltip-panel"
        style={{
          position: "fixed",
          left: hover.screen.x + 12,
          top: hover.screen.y + 12,
          background: "rgba(0,0,0,0.85)",
          color: "#fff",
          padding: "8px 10px",
          borderRadius: 4,
          fontSize: 12,
          maxWidth: 300,
          pointerEvents: "none",
          zIndex: 1000
        }}
      >
        {content}
      </div>
    </Html>
  );
}

function findUserData(obj: THREE.Object3D): TooltipUserData | null {
  let o: THREE.Object3D | null = obj;
  while (o) {
    const ud = o.userData as Partial<TooltipUserData> | undefined;
    if (ud && typeof ud.tooltipKind === "string") return ud as TooltipUserData;
    o = o.parent;
  }
  return null;
}

function renderContent(hover: HoverTarget, session: TabSession | undefined): JSX.Element | null {
  if (hover.kind.startsWith("zone")) {
    const zoneId = hover.data.zoneId;
    if (!zoneId) return null;
    const meta = ZONES.find((z) => z.id === zoneId);
    if (!meta) return null;
    const occupants = session
      ? Array.from(session.agents.values()).filter((a) => a.currentZone === meta.id)
      : [];
    return (
      <div>
        <div style={{ fontWeight: 600 }}>
          {meta.icon} {meta.name}
        </div>
        <div style={{ opacity: 0.85 }}>{meta.description}</div>
        {occupants.length > 0 && (
          <div style={{ marginTop: 6 }}>
            Here now: {occupants.map((o) => o.id.slice(0, 6)).join(", ")}
          </div>
        )}
      </div>
    );
  }
  if (hover.kind === "character") {
    const agentId = hover.data.agentId;
    if (!agentId) return null;
    const agent = session?.agents.get(agentId);
    if (!agent) return null;
    // Mayor keeps the shield emoji on the tooltip so it reads as the main
    // agent at a glance; subagents show just their computed label. The raw
    // agent id is rendered below as a faint subtitle for debugging copy /
    // paste, never as the primary identifier.
    const labels = session ? buildAgentLabels(session.agents.values()) : new Map();
    const name = labelFor(labels, agent);
    const title = agent.kind === "main" ? `🛡 ${name}` : name;
    return (
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{agent.id}</div>
        <div style={{ marginTop: 4 }}>
          Zone: {agent.currentZone} -&gt; {agent.targetZone}
        </div>
        <div style={{ marginTop: 4, opacity: 0.8 }}>
          {agent.recentActions
            .slice(-5)
            .reverse()
            .map((a, i) => (
              <div key={i}>- {a.summary}</div>
            ))}
        </div>
      </div>
    );
  }
  return null;
}
