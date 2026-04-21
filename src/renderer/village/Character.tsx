/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { computePath, type GridPoint } from "./pathfinding";
import { computeSeparation } from "./separation";
import type { AgentState } from "../../shared/types";

interface CharacterProps {
  agent: AgentState;
  zonePositions: Record<string, [number, number, number]>;
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
  zonePositions,
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
  const initialWorldRef = useRef<[number, number, number]>(
    zonePositions[agent.currentZone] ?? [0, 0, 0]
  );

  const targetWorld = useMemo<[number, number, number]>(
    () => zonePositions[agent.targetZone] ?? [0, 0, 0],
    [zonePositions, agent.targetZone]
  );

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const currentGrid = worldToGrid(g.position, gridSize);
    const targetGrid = worldToGrid(new THREE.Vector3(...targetWorld), gridSize);
    pathRef.current = computePath(currentGrid, targetGrid, walkable);
    pathIndex.current = 0;
  }, [agent.targetZone, gridSize, walkable, targetWorld]);

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

  return (
    <group
      ref={groupRef}
      position={[initialWorld[0], 1, initialWorld[2]]}
      userData={{ tooltipKind: "character", agentId: agent.id, agentKind: agent.kind }}
    >
      <mesh>
        <boxGeometry args={[0.6, 1.6, 0.4]} />
        <meshStandardMaterial color={agent.skinColor} transparent={translucent} opacity={opacity} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#f3c89a" transparent={translucent} opacity={opacity} />
      </mesh>
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function worldToGrid(v: { x: number; z: number }, size: number): GridPoint {
  return { x: Math.round(v.x + size / 2), z: Math.round(v.z + size / 2) };
}

function gridToWorld(p: GridPoint, size: number): [number, number, number] {
  return [p.x - size / 2, 0, p.z - size / 2];
}
