/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { ZONES } from "../../shared/zones";
import { Zone } from "./Zone";

const RADIUS = 8;

export function VillageScene() {
  const positions = computeZonePositions();
  return (
    <Canvas camera={{ position: [15, 12, 15], fov: 45 }} style={{ background: "#87ceeb" }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={0.9} castShadow />
      <OrbitControls enablePan enableRotate enableZoom target={[0, 0, 0]} />
      <mesh position={[0, 0, 0]} receiveShadow>
        <boxGeometry args={[32, 0.1, 32]} />
        <meshStandardMaterial color="#6b8e23" />
      </mesh>
      {ZONES.map((z, i) => (
        <Zone key={z.id} meta={z} position={positions[i]!} />
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
