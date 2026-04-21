/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import {
  ISLAND_GREENERY,
  GRASS_COLORS,
  FLOWER_COLORS,
  type GrassTuftPlacement,
  type FlowerPlacement
} from "./greeneryLayout";

/**
 * Renders grass tufts and small flowers across the main island's grass
 * cap. Each tuft is a cluster of 4 thin vertical blades; each flower is
 * a cylinder stem with a small sphere head. Counts are low enough
 * (~90 tufts, ~32 flowers) that per-instance meshes are fine.
 */
export function IslandGreenery() {
  return (
    <group>
      {ISLAND_GREENERY.tufts.map((t, i) => (
        <GrassTuft key={`t-${i}`} tuft={t} />
      ))}
      {ISLAND_GREENERY.flowers.map((f, i) => (
        <Flower key={`f-${i}`} flower={f} />
      ))}
    </group>
  );
}

function GrassTuft({ tuft }: { tuft: GrassTuftPlacement }) {
  const [x, z] = tuft.position;
  const color = GRASS_COLORS[tuft.colorIndex] ?? GRASS_COLORS[0]!;
  const h = 0.3 * tuft.heightScale;
  // 4 thin blades arranged in an X pattern around the tuft centre.
  const bladeOffsets: Array<[number, number]> = [
    [0, 0],
    [0.06, 0.04],
    [-0.05, 0.05],
    [0.02, -0.07]
  ];
  return (
    <group position={[x, 0.15, z]} rotation={[0, tuft.rotationY, 0]}>
      {bladeOffsets.map(([dx, dz], i) => (
        <mesh key={i} position={[dx, h / 2, dz]} rotation={[0, (i * Math.PI) / 4, 0]} castShadow>
          <boxGeometry args={[0.04, h, 0.02]} />
          <meshStandardMaterial color={color} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function Flower({ flower }: { flower: FlowerPlacement }) {
  const [x, z] = flower.position;
  const petalColor = FLOWER_COLORS[flower.colorIndex] ?? FLOWER_COLORS[0]!;
  const stemH = flower.stemHeight;
  return (
    <group position={[x, 0.15, z]}>
      {/* Stem */}
      <mesh position={[0, stemH / 2, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, stemH, 5]} />
        <meshStandardMaterial color="#4a7a1a" roughness={0.9} />
      </mesh>
      {/* Head - a small sphere of petals. */}
      <mesh position={[0, stemH + 0.05, 0]} castShadow>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshStandardMaterial color={petalColor} roughness={0.7} />
      </mesh>
      {/* Yellow centre dot on the flower. */}
      <mesh position={[0, stemH + 0.05, 0]}>
        <sphereGeometry args={[0.03, 6, 5]} />
        <meshStandardMaterial color="#ffd84a" roughness={0.6} />
      </mesh>
    </group>
  );
}
