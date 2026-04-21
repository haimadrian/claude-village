/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Sky, Cloud, Clouds, useGLTF } from "@react-three/drei";
import { logger } from "../logger";
import { allModelUrls } from "./assetMap";
import { useKeyboardPan } from "./useKeyboardPan";

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
import { WavyWater } from "./WavyWater";
import { MinorIsland } from "./MinorIsland";
import { MINOR_ISLANDS } from "./minorIslands";
import { BoatFleet } from "./Boat";
import { GRID_SIZE, MAIN_ISLAND_RADIUS, ZONE_RING_RADIUS } from "./sceneConstants";

// Re-exported to keep the pre-refactor API surface of this module. Older
// call sites may import `RADIUS`, `GRID_SIZE`, `ISLAND_RADIUS` from here.
const RADIUS = ZONE_RING_RADIUS;
const ISLAND_RADIUS = MAIN_ISLAND_RADIUS;

/** Height of the main island cylinder. Raised so the sides are visible. */
const MAIN_ISLAND_HEIGHT = 3;

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
  /**
   * Desired camera target - what `controls.target` is lerp-ing toward.
   * We do not snap straight to it; instead the `CameraTargetLerper`
   * nudged the actual target each frame for a smooth glide.
   */
  const desiredTargetRef = useRef<THREE.Vector3 | null>(null);

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
      desiredTargetRef.current = new THREE.Vector3(pos[0], 1, pos[2]);
    };
    window.addEventListener("village:focus-agent", handler);
    return () => {
      window.removeEventListener("village:focus-agent", handler);
    };
  }, [sessionId, session]);

  // Listen for zone-focus events dispatched by our invisible click pads.
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ zoneId: string }>).detail;
      if (!detail?.zoneId) return;
      const idx = ZONES.findIndex((z) => z.id === detail.zoneId);
      if (idx < 0) return;
      const pos = computeZonePositions()[idx];
      if (!pos) return;
      logger.info("VillageScene focus-zone fired", { sessionId, zoneId: detail.zoneId });
      desiredTargetRef.current = new THREE.Vector3(pos[0], 1, pos[2]);
    };
    window.addEventListener("village:focus-zone", handler);
    return () => {
      window.removeEventListener("village:focus-zone", handler);
    };
  }, [sessionId]);

  return (
    <Canvas camera={{ position: [22, 18, 22], fov: 45 }}>
      {/* Sky: clear midday. A high sunPosition gives the default drei shader
          the "high noon" look; default turbidity/rayleigh keep it blue. */}
      <Sky sunPosition={[100, 80, 50]} turbidity={8} rayleigh={2} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[20, 30, 10]} intensity={0.95} castShadow />
      <OrbitControls
        ref={controlsRef}
        enablePan
        enableRotate
        enableZoom
        screenSpacePanning
        target={[0, 0, 0]}
        minDistance={4}
        maxDistance={80}
        maxPolarAngle={Math.PI * 0.55}
      />

      <CameraTargetLerper controlsRef={controlsRef} desiredTargetRef={desiredTargetRef} />
      <KeyboardCameraController controlsRef={controlsRef} desiredTargetRef={desiredTargetRef} />

      {/* Animated water surface + opaque seabed. Replaces the old flat
          plane and gives the camera something to look at when it
          tilts under the horizon. */}
      <WavyWater />

      {/* Main island: a tall cylinder with earthy sides so looking from
          below shows brown cliff rather than a wafer-thin disc. A thin
          grass cap cylinder on top keeps the green surface visually
          distinct from the dirt walls. */}
      <group position={[0, 0, 0]}>
        {/* Side wall - dirt / warm earth. Pushed down so the top face
            of the cylinder sits at y=0. */}
        <mesh position={[0, -MAIN_ISLAND_HEIGHT / 2, 0]} receiveShadow>
          <cylinderGeometry args={[ISLAND_RADIUS, ISLAND_RADIUS * 0.95, MAIN_ISLAND_HEIGHT, 48]} />
          <meshStandardMaterial color="#8b6a3b" roughness={0.95} />
        </mesh>
        {/* Grass cap. A thin cylinder on the very top. */}
        <mesh position={[0, 0.05, 0]} receiveShadow>
          <cylinderGeometry args={[ISLAND_RADIUS, ISLAND_RADIUS, 0.2, 48]} />
          <meshStandardMaterial color="#6b8e23" roughness={0.9} />
        </mesh>
      </group>

      {/* Minor islands scattered around the main island. Purely decorative. */}
      {MINOR_ISLANDS.map((layout) => (
        <MinorIsland key={layout.id} layout={layout} />
      ))}

      {/* Boats cruising the sea. */}
      <BoatFleet />

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
      {/* Invisible click pads - one per zone. They sit above each zone
          centre and dispatch `village:focus-zone` on click so the
          camera can re-target. They stop propagation so the click
          does not also register on the underlying ground / water. */}
      {ZONES.map((z, i) => {
        const pos = positions[i]!;
        return (
          <mesh
            key={`click-${z.id}`}
            position={[pos[0], 2, pos[2]]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent("village:focus-zone", { detail: { zoneId: z.id } })
              );
            }}
          >
            <boxGeometry args={[4, 4, 4]} />
            {/* transparent + opacity 0 keeps the raycaster happy while
                leaving nothing visible on screen. `depthWrite: false`
                stops it from punching a hole in the depth buffer. */}
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
      })}
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

/**
 * Smoothly lerps `controlsRef.current.target` toward `desiredTargetRef`.
 * Lives inside the Canvas so it can use `useFrame`. Clears the desired
 * target once it gets close enough to avoid infinite tiny updates.
 */
function CameraTargetLerper({
  controlsRef,
  desiredTargetRef
}: {
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  desiredTargetRef: React.MutableRefObject<THREE.Vector3 | null>;
}) {
  useFrame((_, dt) => {
    const controls = controlsRef.current;
    const desired = desiredTargetRef.current;
    if (!controls || !desired) return;
    const t = controls.target as THREE.Vector3;
    // Exponential-decay lerp: independent of frame rate, reaches 63%
    // of the remaining distance every `1 / rate` seconds.
    const rate = 4;
    const alpha = 1 - Math.exp(-rate * dt);
    t.lerp(desired, alpha);
    controls.update();
    if (t.distanceTo(desired) < 0.02) {
      t.copy(desired);
      controls.update();
      desiredTargetRef.current = null;
    }
  });
  return null;
}

/**
 * Thin wrapper that installs the keyboard-pan hook. Keyboard input is
 * treated as a hard override: pressing any pan/dolly key clears the
 * pending lerp target so the glide does not fight the user.
 */
function KeyboardCameraController({
  controlsRef,
  desiredTargetRef
}: {
  controlsRef: React.MutableRefObject<OrbitControlsImpl | null>;
  desiredTargetRef: React.MutableRefObject<THREE.Vector3 | null>;
}) {
  const onUserOverride = useCallback((): void => {
    desiredTargetRef.current = null;
  }, [desiredTargetRef]);
  useKeyboardPan(controlsRef, onUserOverride);
  return null;
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
