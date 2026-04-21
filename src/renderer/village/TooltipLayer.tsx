import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
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
const EVENT_NAME = "village:tooltip-update";

/**
 * CustomEvent payload the raycaster component dispatches whenever the
 * hovered target changes. The overlay component (rendered OUTSIDE the
 * Canvas) subscribes and paints the tooltip DOM from this state.
 *
 * We cannot render the DOM directly from inside the Canvas subtree: R3F's
 * reconciler owns that tree and does not know how to mount `<div>` hosts,
 * so `createPortal(<div/>, document.body)` from here silently fails to
 * materialise the element. Splitting raycaster-in-Canvas from overlay-
 * outside-Canvas keeps each piece using the reconciler it fits.
 */
interface TooltipUpdate {
  hover: HoverTarget | null;
}

interface TooltipOverlayProps {
  sessionId?: string;
}

/**
 * Raycaster half: lives inside the Canvas, listens to pointer events on
 * the WebGL domElement, and dispatches `village:tooltip-update` events
 * whenever the hovered object changes. Renders nothing visible - the
 * paired `<TooltipOverlay>` below (rendered outside the Canvas) handles
 * the DOM.
 */
export function TooltipLayer() {
  const { scene, camera, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const pointer = useRef(new THREE.Vector2());
  const lastHoverRef = useRef<HoverTarget | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const emit = (hover: HoverTarget | null): void => {
      lastHoverRef.current = hover;
      window.dispatchEvent(new CustomEvent<TooltipUpdate>(EVENT_NAME, { detail: { hover } }));
    };
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
          emit({ kind: ud.tooltipKind, data: ud, screen: { x: screenX, y: screenY } });
          return;
        }
        emit(null);
      }, HOVER_DELAY_MS);
    };
    const onLeave = (): void => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      emit(null);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (timer.current !== null) window.clearTimeout(timer.current);
      // Clear any hover state the outside overlay is holding when we unmount.
      emit(null);
    };
  }, [camera, gl, scene]);

  return null;
}

/**
 * Overlay half: a regular DOM component that subscribes to
 * `village:tooltip-update` events and paints the tooltip panel with plain
 * React. Must be rendered OUTSIDE the `<Canvas>` so the host reconciler
 * is react-dom and `<div>` / `position: fixed` work normally.
 *
 * Accepts the same `sessionId` as the raycaster so the panel can show
 * zone occupancy / agent details for the right session.
 */
export function TooltipOverlay({ sessionId }: TooltipOverlayProps): JSX.Element | null {
  const { sessions } = useSessions();
  const [hover, setHover] = useState<HoverTarget | null>(null);

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<TooltipUpdate>).detail;
      setHover(detail?.hover ?? null);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
    };
  }, []);

  if (!hover) return null;
  const session = sessionId ? sessions.get(sessionId) : undefined;
  const content = renderContent(hover, session);
  if (!content) return null;

  // Position the panel just to the lower-right of the cursor, then clamp
  // so it never runs off-screen near the viewport edges.
  const OFFSET = 14;
  const MARGIN = 8;
  const MAX_W = 320;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const maxLeft = Math.max(MARGIN, vw - MAX_W - MARGIN);
  const left = Math.min(hover.screen.x + OFFSET, maxLeft);
  const maxTop = Math.max(MARGIN, vh - 140 - MARGIN);
  const top = Math.min(hover.screen.y + OFFSET, maxTop);

  return (
    <div
      data-testid="tooltip-panel"
      style={{
        position: "fixed",
        left,
        top,
        background: "rgba(0,0,0,0.88)",
        color: "#fff",
        padding: "8px 10px",
        borderRadius: 4,
        fontSize: 12,
        lineHeight: 1.35,
        width: "max-content",
        maxWidth: MAX_W,
        pointerEvents: "none",
        zIndex: 1000,
        boxShadow: "0 4px 12px rgba(0,0,0,0.35)"
      }}
    >
      {content}
    </div>
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
