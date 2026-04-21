/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { Suspense, useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { computePath, type GridPoint } from "./pathfinding";
import { computeSeparation } from "./separation";
import { characterModel } from "./assetMap";
import { GltfErrorBoundary } from "./GltfErrorBoundary";
import { hairColor } from "./appearance";
import type { AgentState } from "../../shared/types";

interface CharacterProps {
  agent: AgentState;
  /**
   * World-space position where the character starts (its slot at the
   * current zone). Captured once at mount; subsequent agent-patch
   * re-renders must not snap the character back here.
   */
  slotStart: [number, number, number];
  /** World-space slot the character is walking toward. */
  slotTarget: [number, number, number];
  walkable: boolean[][];
  gridSize: number;
  /**
   * Shared map of current world-space positions keyed by agent id. The
   * parent owns the map; every `Character` writes its own position here on
   * each frame and reads siblings to apply separation steering. Using a ref
   * instead of React state lets us update hot data every frame without
   * triggering re-renders.
   */
  positionsRef: React.MutableRefObject<Map<string, THREE.Vector3>>;
}

const SPEED = 3;
const SEPARATION_RADIUS = 0.8;
const SEPARATION_STRENGTH = 3;
const SEPARATION_MAX_STEP_PER_SECOND = 2;

export function Character({
  agent,
  slotStart,
  slotTarget,
  walkable,
  gridSize,
  positionsRef
}: CharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pathRef = useRef<GridPoint[]>([]);
  const pathIndex = useRef(0);

  // `initialWorld` must be captured exactly once per mounted character. The
  // store emits a patch on every tool event, which gives `agent` a new object
  // identity and caused the previous implementation to re-render the `<group
  // position={...}>` prop back to the current-zone coordinates every time -
  // effectively snapping the character back to the Tavern mid-walk. Storing
  // the mount position in a ref decouples it from re-render cycles; from then
  // on, `useFrame` is the sole owner of the group's transform.
  const initialWorldRef = useRef<[number, number, number]>(slotStart);

  // VillageScene recomputes the slot tuple on every render, so the tuple
  // identity changes even when the target zone hasn't changed. Use a
  // stringified snapshot as the useEffect dependency so path recomputation
  // only fires when the coordinates actually change.
  const targetX = slotTarget[0];
  const targetY = slotTarget[1];
  const targetZ = slotTarget[2];

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const currentGrid = worldToGrid(g.position, gridSize);
    const targetGrid = worldToGrid(new THREE.Vector3(targetX, targetY, targetZ), gridSize);
    pathRef.current = computePath(currentGrid, targetGrid, walkable);
    pathIndex.current = 0;
  }, [agent.targetZone, gridSize, walkable, targetX, targetY, targetZ]);

  // Register/unregister our live position in the shared map so siblings can
  // read it for separation. We reuse a single `Vector3` per agent for the
  // lifetime of the mount and mutate it in place each frame.
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const positions = positionsRef.current;
    positions.set(agent.id, g.position);
    const agentId = agent.id;
    return (): void => {
      positions.delete(agentId);
    };
  }, [agent.id, positionsRef]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;

    // 1. Advance along the A* path toward the next grid cell, if any.
    const path = pathRef.current;
    if (pathIndex.current < path.length) {
      const next = path[pathIndex.current];
      if (next) {
        const nextWorld = gridToWorld(next, gridSize);
        const dir = new THREE.Vector3(nextWorld[0] - g.position.x, 0, nextWorld[2] - g.position.z);
        const dist = dir.length();
        if (dist < 0.05) {
          pathIndex.current++;
        } else {
          dir.normalize().multiplyScalar(SPEED * dt);
          g.position.add(dir);
          g.lookAt(nextWorld[0], g.position.y, nextWorld[2]);
        }
      }
    }

    // 2. Collision avoidance: push away from any neighbour closer than
    //    SEPARATION_RADIUS. Runs every frame regardless of path state so
    //    stationary agents still separate if another walks into them.
    const neighbours: { x: number; z: number }[] = [];
    positionsRef.current.forEach((pos, id) => {
      if (id !== agent.id) neighbours.push({ x: pos.x, z: pos.z });
    });
    if (neighbours.length > 0) {
      const step = computeSeparation({ x: g.position.x, z: g.position.z }, neighbours, {
        radius: SEPARATION_RADIUS,
        strength: SEPARATION_STRENGTH * dt,
        maxStep: SEPARATION_MAX_STEP_PER_SECOND * dt
      });
      g.position.x += step.x;
      g.position.z += step.z;
    }

    // 3. Idle bob. Keep last so separation never fights vertical motion.
    g.position.y = 1 + Math.abs(Math.sin(performance.now() * 0.01)) * 0.1;
  });

  const initialWorld = initialWorldRef.current;
  const translucent = agent.animation === "ghost";
  const opacity = translucent ? 0.4 : 1;
  const labelPrefix = agent.kind === "main" ? "🛡 " : "";
  const lastAction = agent.recentActions[agent.recentActions.length - 1];

  const hair = hairColor(agent.id);
  const fallback = (
    <FallbackCharacter
      skinColor={agent.skinColor}
      hairColor={hair}
      translucent={translucent}
      opacity={opacity}
    />
  );

  return (
    <group
      ref={groupRef}
      position={[initialWorld[0], 1, initialWorld[2]]}
      userData={{ tooltipKind: "character", agentId: agent.id, agentKind: agent.kind }}
    >
      <GltfErrorBoundary label={`character:${agent.kind}`} fallback={fallback}>
        <Suspense fallback={fallback}>
          <CharacterMesh
            kind={agent.kind}
            skinColor={agent.skinColor}
            hairColor={hair}
            translucent={translucent}
            opacity={opacity}
          />
        </Suspense>
      </GltfErrorBoundary>
      <Html position={[0, 2.2, 0]} center zIndexRange={[100, 0]}>
        <div
          title={`${agent.kind === "main" ? "Mayor" : "Villager"} - ${agent.id}`}
          style={{
            fontSize: 16,
            fontWeight: 600,
            background: "rgba(0,0,0,0.75)",
            color: "#fff",
            padding: "3px 8px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            pointerEvents: "auto",
            textShadow: "0 1px 2px rgba(0,0,0,0.5)"
          }}
        >
          {labelPrefix}
          {agent.id.slice(0, 6)}
        </div>
      </Html>
      {lastAction && (
        <Html position={[0, 2.8, 0]} center zIndexRange={[100, 0]}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(
                new CustomEvent("village:open-bubble", { detail: { agentId: agent.id } })
              );
            }}
            title={lastAction.summary}
            style={{
              cursor: "pointer",
              fontSize: 14,
              background: "rgba(255,255,255,0.95)",
              color: "#111",
              padding: "3px 8px",
              borderRadius: 10,
              maxWidth: 260,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              boxShadow: "0 2px 4px rgba(0,0,0,0.25)"
            }}
          >
            {truncate(lastAction.summary, 60)}
          </div>
        </Html>
      )}
    </group>
  );
}

/**
 * Loads the per-kind GLB character model and applies the agent's hashed skin
 * colour + ghost transparency to every mesh in the cloned subtree. Only
 * the mesh named "body" receives the per-agent colour; head / hat retain
 * their authored material so skin tone stays consistent across agents.
 */
function CharacterMesh({
  kind,
  skinColor,
  hairColor,
  translucent,
  opacity
}: {
  kind: "main" | "subagent";
  skinColor: string;
  hairColor: string;
  translucent: boolean;
  opacity: number;
}) {
  const url = characterModel(kind === "main" ? "mayor" : "villager");
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const cloned = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.traverse((node: THREE.Object3D) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.Material | THREE.Material[];
      const cloneOne = (m: THREE.Material): THREE.Material => {
        const std = (m as THREE.MeshStandardMaterial).clone();
        std.transparent = translucent;
        std.opacity = opacity;
        if (mesh.name === "body" && "color" in std) {
          (std as THREE.MeshStandardMaterial).color = new THREE.Color(skinColor);
        }
        return std;
      };
      mesh.material = Array.isArray(src) ? src.map(cloneOne) : cloneOne(src);
    });
    return root;
  }, [gltf, skinColor, translucent, opacity]);
  // The placeholder GLB models the character as body + head (head at y=1.25,
  // size 0.5, body centred at y=0.5, size 0.6 x 1.0 x 0.4). Layer the face,
  // hair, and arms as separate meshes on top of the loaded scene so the GLB
  // generator can stay minimal and a future Kenney GLB swap (which already
  // carries its own face/hair/arms) needs no code change here.
  return (
    <>
      <primitive object={cloned} />
      <CharacterDecorations
        headY={1.25}
        headSize={0.5}
        bodyY={0.5}
        bodyHeight={1.0}
        bodyWidth={0.6}
        skinColor={skinColor}
        hairColor={hairColor}
        translucent={translucent}
        opacity={opacity}
      />
    </>
  );
}

/**
 * Tier 1 two-box character plus Minecraft-style face, hair, and arms. Used as
 * Suspense fallback and as the hard error fallback when a GLB cannot be
 * loaded.
 *
 * Geometry summary (all local to the parent group):
 *   body:  0.6 x 1.6 x 0.4   centred at y=0, so top = 0.8, front = z+0.2
 *   head:  0.5 x 0.5 x 0.5   centred at y=1.2, so top = 1.45, front = z+0.25
 *   arms:  0.18 x 1.0 x 0.18 hanging from the shoulders
 */
function FallbackCharacter({
  skinColor,
  hairColor,
  translucent,
  opacity
}: {
  skinColor: string;
  hairColor: string;
  translucent: boolean;
  opacity: number;
}) {
  return (
    <>
      <mesh>
        <boxGeometry args={[0.6, 1.6, 0.4]} />
        <meshStandardMaterial color={skinColor} transparent={translucent} opacity={opacity} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#f3c89a" transparent={translucent} opacity={opacity} />
      </mesh>
      <CharacterDecorations
        headY={1.2}
        headSize={0.5}
        bodyY={0}
        bodyHeight={1.6}
        bodyWidth={0.6}
        skinColor={skinColor}
        hairColor={hairColor}
        translucent={translucent}
        opacity={opacity}
      />
    </>
  );
}

/**
 * Minecraft-style face (two eyes + mouth), hair slab with fringe, and two
 * rigid arms. Shared between `FallbackCharacter` (Tier 1 boxes) and
 * `CharacterMesh` (Tier 2 placeholder GLB) because the two models use the
 * same proportions. Measurements are passed in so each caller can anchor
 * the decorations to its own head / body geometry.
 *
 * The parent `<group>` handles `lookAt` so +Z is always "forward" relative
 * to the character's walk direction; placing eyes / mouth / fringe on the
 * +Z side of the head keeps them pointing where the character is looking.
 */
function CharacterDecorations({
  headY,
  headSize,
  bodyY,
  bodyHeight,
  bodyWidth,
  skinColor,
  hairColor,
  translucent,
  opacity
}: {
  headY: number;
  headSize: number;
  bodyY: number;
  bodyHeight: number;
  bodyWidth: number;
  skinColor: string;
  hairColor: string;
  translucent: boolean;
  opacity: number;
}) {
  const headHalf = headSize / 2;
  // Nudge face elements slightly off the head's front face so the z-buffer
  // never ties. 0.002 is invisible at any realistic camera distance but big
  // enough to beat floating-point rounding during projection.
  const faceZ = headHalf + 0.002;
  const eyeY = headY + 0.05; // just above the vertical centre of the head
  const eyeDx = 0.11; // horizontal half-separation
  const mouthY = headY - 0.12;
  // Hair slab sits on top of the head, slightly wider + deeper so it reads
  // as a hat of hair from every angle.
  const hairSlabY = headY + headHalf + 0.04;
  // Fringe is a thin strip on the upper front of the head, giving the
  // character a visible Minecraft-style bang line from the front.
  const fringeY = headY + headHalf - 0.12;
  const fringeZ = headHalf + 0.01;
  // Arms hang from the shoulders. Body top = bodyY + bodyHeight/2; the arm
  // is 1.0 tall so its centre sits halfway down from the shoulder.
  const shoulderY = bodyY + bodyHeight / 2;
  const armHeight = 1.0;
  const armCentreY = shoulderY - armHeight / 2 + 0.05; // small overlap with torso
  const armWidth = 0.18;
  const armDepth = 0.18;
  const armDx = bodyWidth / 2 + armWidth / 2 - 0.02; // hug the torso sides
  return (
    <>
      {/* Left eye */}
      <mesh position={[-eyeDx, eyeY, faceZ]}>
        <boxGeometry args={[0.08, 0.08, 0.01]} />
        <meshStandardMaterial color="#1c1c1c" transparent={translucent} opacity={opacity} />
      </mesh>
      {/* Right eye */}
      <mesh position={[eyeDx, eyeY, faceZ]}>
        <boxGeometry args={[0.08, 0.08, 0.01]} />
        <meshStandardMaterial color="#1c1c1c" transparent={translucent} opacity={opacity} />
      </mesh>
      {/* Mouth */}
      <mesh position={[0, mouthY, faceZ]}>
        <boxGeometry args={[0.18, 0.04, 0.01]} />
        <meshStandardMaterial color="#1c1c1c" transparent={translucent} opacity={opacity} />
      </mesh>
      {/* Hair slab */}
      <mesh position={[0, hairSlabY, 0]}>
        <boxGeometry args={[headSize + 0.02, 0.08, headSize + 0.02]} />
        <meshStandardMaterial color={hairColor} transparent={translucent} opacity={opacity} />
      </mesh>
      {/* Fringe (bangs) */}
      <mesh position={[0, fringeY, fringeZ]}>
        <boxGeometry args={[headSize + 0.02, 0.18, 0.04]} />
        <meshStandardMaterial color={hairColor} transparent={translucent} opacity={opacity} />
      </mesh>
      {/* Left arm */}
      <mesh position={[-armDx, armCentreY, 0]}>
        <boxGeometry args={[armWidth, armHeight, armDepth]} />
        <meshStandardMaterial color={skinColor} transparent={translucent} opacity={opacity} />
      </mesh>
      {/* Right arm */}
      <mesh position={[armDx, armCentreY, 0]}>
        <boxGeometry args={[armWidth, armHeight, armDepth]} />
        <meshStandardMaterial color={skinColor} transparent={translucent} opacity={opacity} />
      </mesh>
    </>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function worldToGrid(v: { x: number; z: number }, size: number): GridPoint {
  return { x: Math.round(v.x + size / 2), z: Math.round(v.z + size / 2) };
}

function gridToWorld(p: GridPoint, size: number): [number, number, number] {
  return [p.x - size / 2, 0, p.z - size / 2];
}
