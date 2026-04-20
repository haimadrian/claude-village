/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { computePath, type GridPoint } from "./pathfinding";
import type { AgentState } from "../../shared/types";

interface CharacterProps {
  agent: AgentState;
  zonePositions: Record<string, [number, number, number]>;
  walkable: boolean[][];
  gridSize: number;
}

const SPEED = 3;

export function Character({ agent, zonePositions, walkable, gridSize }: CharacterProps) {
  const groupRef = useRef<THREE.Group>(null);
  const pathRef = useRef<GridPoint[]>([]);
  const pathIndex = useRef(0);

  const targetWorld = useMemo<[number, number, number]>(
    () => zonePositions[agent.targetZone] ?? [0, 0, 0],
    [zonePositions, agent.targetZone]
  );
  const currentWorld = useMemo<[number, number, number]>(
    () => zonePositions[agent.currentZone] ?? [0, 0, 0],
    [zonePositions, agent.currentZone]
  );

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    const currentGrid = worldToGrid(g.position, gridSize);
    const targetGrid = worldToGrid(new THREE.Vector3(...targetWorld), gridSize);
    pathRef.current = computePath(currentGrid, targetGrid, walkable);
    pathIndex.current = 0;
  }, [agent.targetZone, gridSize, walkable, targetWorld]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const path = pathRef.current;
    if (pathIndex.current >= path.length) return;
    const next = path[pathIndex.current];
    if (!next) return;
    const nextWorld = gridToWorld(next, gridSize);
    const dir = new THREE.Vector3(nextWorld[0] - g.position.x, 0, nextWorld[2] - g.position.z);
    const dist = dir.length();
    if (dist < 0.05) {
      pathIndex.current++;
      return;
    }
    dir.normalize().multiplyScalar(SPEED * dt);
    g.position.add(dir);
    g.lookAt(nextWorld[0], g.position.y, nextWorld[2]);
    g.position.y = 1 + Math.abs(Math.sin(performance.now() * 0.01)) * 0.1;
  });

  // Use currentWorld for the initial mount position; subsequent moves are driven by useFrame.
  const initialWorld = currentWorld;
  const translucent = agent.animation === "ghost";
  const opacity = translucent ? 0.4 : 1;
  const labelPrefix = agent.kind === "main" ? "🛡 " : "";

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
      <Html position={[0, 2.2, 0]} center distanceFactor={10}>
        <div
          style={{
            fontSize: 10,
            background: "rgba(0,0,0,0.6)",
            color: "#fff",
            padding: "2px 6px",
            borderRadius: 4,
            whiteSpace: "nowrap"
          }}
        >
          {labelPrefix}
          {agent.id.slice(0, 6)}
        </div>
      </Html>
    </group>
  );
}

function worldToGrid(v: { x: number; z: number }, size: number): GridPoint {
  return { x: Math.round(v.x + size / 2), z: Math.round(v.z + size / 2) };
}

function gridToWorld(p: GridPoint, size: number): [number, number, number] {
  return [p.x - size / 2, 0, p.z - size / 2];
}
