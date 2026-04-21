/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky, Cloud, Clouds, useGLTF } from "@react-three/drei";
import { logger } from "../logger";
import { allModelUrls } from "./assetMap";

// Preload every bundled GLB exactly once (at module load). useGLTF.preload
// primes the internal GLTFLoader cache so the first scene render doesn't
// stutter while 9 buildings + 2 characters all resolve in parallel.
for (const url of allModelUrls()) {
  try {
    useGLTF.preload(url);
  } catch (err) {
    // A preload failure is never fatal - Zone/Character components each
    // fall back to a Tier 1 cube. Log once so the condition is visible.
    logger.warn("useGLTF.preload failed", {
      url,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
// `three-stdlib` is a transitive dep of @react-three/drei but not a direct
// dependency, so its types are not resolvable from this project. Fall back to
// `any` for the imperative ref - the only methods we touch are `target.set`
// and `update`, both stable on the OrbitControls API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrbitControlsImpl = any;
import { ZONES } from "../../shared/zones";
import { Zone } from "./Zone";
import { Character } from "./Character";
import { TooltipLayer } from "./TooltipLayer";
import { useSessions } from "../context/SessionContext";
import { allSlotPositions, slotPositionFor } from "./slots";

// The ring of zones used to sit at radius 8. With zone buildings that are
// ~4 units wide, adjacent zones almost touched and characters rendered on
// top of zone centres, making them invisible. Radius 13 leaves ~9 units of
// arc between zones at the ring - plenty of room for the signpost,
// character slots, and the outward-facing plank.
const RADIUS = 13;

/** Walkable-grid resolution in cells per side. Bumped to cover RADIUS 13. */
const GRID_SIZE = 48;

/** Island radius in world units. Chosen so characters cannot walk onto water. */
const ISLAND_RADIUS = RADIUS + 5;

interface VillageSceneProps {
  sessionId?: string;
}

export function VillageScene({ sessionId }: VillageSceneProps) {
  const { sessions } = useSessions();
  const session = sessionId ? sessions.get(sessionId) : undefined;

  // Positions and the walkable grid are purely geometric - they depend on
  // nothing that changes at runtime - but we still memoize them so that the
  // `walkable` array, `zonePositions` object, etc. keep stable references
  // across re-renders. Character components use these values in `useMemo` /
  // `useEffect` dependency arrays; without memoization every session patch
  // would invalidate them and cause path recomputation from stale positions.
  const positions = useMemo(() => computeZonePositions(), []);
  const zonePositions = useMemo(
    () =>
      Object.fromEntries(ZONES.map((z, i) => [z.id, positions[i]!])) as Record<
        string,
        [number, number, number]
      >,
    [positions]
  );
  const grid = useMemo(() => buildWalkableGrid(), []);

  // Shared live-position map for character separation. Lives outside React's
  // render cycle because it updates every frame.
  const positionsRef = useRef<Map<string, THREE.Vector3>>(new Map());

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    logger.debug("VillageScene mounted", { sessionId });
    return () => {
      logger.debug("VillageScene unmounted", { sessionId });
    };
  }, [sessionId]);

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
      logger.info("VillageScene focus-agent fired", {
        sessionId,
        agentId,
        zone: agent.currentZone
      });
      controlsRef.current?.target.set(pos[0], 1, pos[2]);
      controlsRef.current?.update();
    };
    window.addEventListener("village:focus-agent", handler);
    return () => {
      window.removeEventListener("village:focus-agent", handler);
    };
  }, [sessionId, session]);

  return (
    <Canvas camera={{ position: [22, 18, 22], fov: 45 }}>
      {/* Sky: clear midday. A high sunPosition gives the default drei shader
          the "high noon" look; default turbidity/rayleigh keep it blue. */}
      <Sky sunPosition={[100, 80, 50]} turbidity={8} rayleigh={2} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[20, 30, 10]} intensity={0.95} castShadow />
      <OrbitControls ref={controlsRef} enablePan enableRotate enableZoom target={[0, 0, 0]} />

      {/* Water: large flat plane just below the island. Semi-transparent
          blue. Horizontally-oriented via rotation so it covers the XZ plane. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial
          color="#3b82c4"
          transparent
          opacity={0.85}
          metalness={0.35}
          roughness={0.45}
        />
      </mesh>

      {/* Island: round grassy disk sized a bit larger than the zone ring.
          Uses a cylinder so the top face is visible but the side has a tiny
          lip that keeps the island readable from low camera angles. */}
      <mesh position={[0, 0, 0]} receiveShadow>
        <cylinderGeometry args={[ISLAND_RADIUS, ISLAND_RADIUS, 0.3, 48]} />
        <meshStandardMaterial color="#6b8e23" />
      </mesh>

      {/* Clouds: a small cluster above the island. Kept low-density so
          scroll/orbit performance stays smooth. */}
      <Clouds material={THREE.MeshBasicMaterial} limit={64}>
        <Cloud
          position={[-18, 18, -10]}
          seed={1}
          segments={20}
          bounds={[6, 2, 2]}
          volume={5}
          color="#ffffff"
        />
        <Cloud
          position={[16, 22, -6]}
          seed={2}
          segments={20}
          bounds={[7, 2, 2]}
          volume={5}
          color="#ffffff"
        />
        <Cloud
          position={[0, 24, 14]}
          seed={3}
          segments={18}
          bounds={[6, 2, 2]}
          volume={4}
          color="#ffffff"
        />
        <Cloud
          position={[-10, 20, 18]}
          seed={4}
          segments={16}
          bounds={[5, 2, 2]}
          volume={4}
          color="#ffffff"
        />
        <Cloud
          position={[22, 19, 8]}
          seed={5}
          segments={18}
          bounds={[6, 2, 2]}
          volume={4}
          color="#ffffff"
        />
      </Clouds>

      {ZONES.map((z, i) => (
        <Zone key={z.id} meta={z} position={positions[i]!} />
      ))}
      {session &&
        Array.from(session.agents.values()).map((agent) => {
          const zoneCenter = zonePositions[agent.currentZone];
          const targetCenter = zonePositions[agent.targetZone];
          if (!zoneCenter || !targetCenter) return null;
          const slotStart = slotPositionFor(agent.currentZone, agent.id, zoneCenter);
          const slotTarget = slotPositionFor(agent.targetZone, agent.id, targetCenter);
          return (
            <Character
              key={agent.id}
              agent={agent}
              slotStart={slotStart}
              slotTarget={slotTarget}
              walkable={grid.walkable}
              gridSize={grid.size}
              positionsRef={positionsRef}
            />
          );
        })}
      <TooltipLayer {...(sessionId !== undefined ? { sessionId } : {})} />
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

/**
 * Build the A* walkable grid. Each zone blocks a 5x5 footprint around
 * its centre (same as before) but we now punch out the character slot
 * cells so pathfinding can always route agents to their slot even when
 * the slot falls just inside the 5x5 footprint.
 */
export function buildWalkableGrid(): { size: number; walkable: boolean[][] } {
  const size = GRID_SIZE;
  const walkable = Array.from({ length: size }, () => Array.from({ length: size }, () => true));
  const positions = computeZonePositions();

  for (const center of positions) {
    const [x, , z] = center;
    const gx = Math.round(x + size / 2);
    const gz = Math.round(z + size / 2);
    // Block the zone footprint.
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx >= 0 && nz >= 0 && nx < size && nz < size) walkable[nx]![nz] = false;
      }
    // Re-open the centre so camera focus still resolves, and re-open the
    // slot cells so characters can path to them even if they fall inside
    // the 5x5 block.
    if (gx >= 0 && gz >= 0 && gx < size && gz < size) walkable[gx]![gz] = true;
    for (const slot of allSlotPositions(center)) {
      const sx = Math.round(slot[0] + size / 2);
      const sz = Math.round(slot[2] + size / 2);
      if (sx >= 0 && sz >= 0 && sx < size && sz < size) walkable[sx]![sz] = true;
    }
  }
  return { size, walkable };
}
