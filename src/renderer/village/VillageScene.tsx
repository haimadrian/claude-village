/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
// `three-stdlib` is a transitive dep of @react-three/drei but not a direct
// dependency, so its types are not resolvable from this project. Fall back to
// `any` for the imperative ref - the only methods we touch are `target.set`
// and `update`, both stable on the OrbitControls API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrbitControlsImpl = any;
import { ZONES } from "../../shared/zones";
import { Zone } from "./Zone";
import { Character } from "./Character";
import { useSessions } from "../context/SessionContext";

const RADIUS = 8;

interface VillageSceneProps {
  sessionId?: string;
}

export function VillageScene({ sessionId }: VillageSceneProps) {
  const { sessions } = useSessions();
  const session = sessionId ? sessions.get(sessionId) : undefined;
  const positions = computeZonePositions();
  const zonePositions = Object.fromEntries(ZONES.map((z, i) => [z.id, positions[i]!])) as Record<
    string,
    [number, number, number]
  >;
  const grid = buildWalkableGrid();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Listen for global focus-agent events (dispatched by TimelineStrip clicks).
  // We compute the target zone position fresh each time rather than capturing
  // it; that way the handler stays correct even as the agent moves zones.
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ agentId: string }>).detail;
      const agentId = detail?.agentId;
      if (!agentId) return;
      const agent = session?.agents.get(agentId);
      if (!agent) return;
      const zoneIdx = ZONES.findIndex((z) => z.id === agent.currentZone);
      if (zoneIdx < 0) return;
      const pos = computeZonePositions()[zoneIdx];
      if (!pos) return;
      controlsRef.current?.target.set(pos[0], 1, pos[2]);
      controlsRef.current?.update();
    };
    window.addEventListener("village:focus-agent", handler);
    return () => {
      window.removeEventListener("village:focus-agent", handler);
    };
  }, [sessionId, session]);

  return (
    <Canvas camera={{ position: [15, 12, 15], fov: 45 }} style={{ background: "#87ceeb" }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={0.9} castShadow />
      <OrbitControls ref={controlsRef} enablePan enableRotate enableZoom target={[0, 0, 0]} />
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[32, 0.1, 32]} />
        <meshStandardMaterial color="#6b8e23" />
      </mesh>
      {ZONES.map((z, i) => (
        <Zone key={z.id} meta={z} position={positions[i]!} />
      ))}
      {session &&
        Array.from(session.agents.values()).map((agent) => (
          <Character
            key={agent.id}
            agent={agent}
            zonePositions={zonePositions}
            walkable={grid.walkable}
            gridSize={grid.size}
          />
        ))}
    </Canvas>
  );
}

export function computeZonePositions(): [number, number, number][] {
  const n = ZONES.length;
  return ZONES.map((_, i) => {
    const angle = (i / n) * Math.PI * 2;
    return [Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS];
  });
}

export function buildWalkableGrid(): { size: number; walkable: boolean[][] } {
  const size = 32;
  const walkable = Array.from({ length: size }, () => Array.from({ length: size }, () => true));
  const positions = computeZonePositions();
  for (const [x, , z] of positions) {
    const gx = Math.round(x + size / 2);
    const gz = Math.round(z + size / 2);
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx >= 0 && nz >= 0 && nx < size && nz < size) walkable[nx]![nz] = false;
      }
    if (gx >= 0 && gz >= 0 && gx < size && gz < size) walkable[gx]![gz] = true;
  }
  return { size, walkable };
}
