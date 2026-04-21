/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import type { MinorIslandLayout } from "./minorIslands";

/**
 * Visual for one secondary island - grass cap sitting on a stone/dirt
 * side wall, with a cluster of pine trees (cone canopy on a cylinder
 * trunk) scattered on top. Purely decorative: no click handlers, no
 * tooltip userData, no pathfinding impact.
 */
export function MinorIsland({ layout }: { layout: MinorIslandLayout }) {
  const [cx, , cz] = layout.center;
  const baseY = -layout.height / 2; // drop the cylinder so its top face sits at y=0
  const grassCapThickness = 0.2;
  const grassTopY = 0; // visual top of the island (grass surface)
  return (
    <group position={[cx, 0, cz]}>
      {/* Stone / dirt side wall - a slightly narrower cylinder under
          the grass so the grass cap overhangs and reads as a separate
          material band. */}
      <mesh position={[0, baseY, 0]} receiveShadow>
        <cylinderGeometry args={[layout.radius * 0.95, layout.radius, layout.height, 24]} />
        <meshStandardMaterial color="#6b553b" roughness={0.95} />
      </mesh>
      {/* Grass cap. */}
      <mesh position={[0, grassTopY - grassCapThickness / 2, 0]} receiveShadow>
        <cylinderGeometry args={[layout.radius, layout.radius, grassCapThickness, 24]} />
        <meshStandardMaterial color="#6b8e23" roughness={0.9} />
      </mesh>
      {layout.trees.map((tree, i) => (
        <Tree key={i} tree={tree} grassTopY={grassTopY} />
      ))}
    </group>
  );
}

function Tree({
  tree,
  grassTopY
}: {
  tree: {
    offset: [number, number];
    trunkHeight: number;
    trunkRadius: number;
    canopyHeight: number;
    canopyRadius: number;
  };
  grassTopY: number;
}) {
  const [ox, oz] = tree.offset;
  const trunkY = grassTopY + tree.trunkHeight / 2;
  const canopyY = grassTopY + tree.trunkHeight + tree.canopyHeight / 2;
  return (
    <group position={[ox, 0, oz]}>
      <mesh position={[0, trunkY, 0]} castShadow>
        <cylinderGeometry args={[tree.trunkRadius, tree.trunkRadius, tree.trunkHeight, 8]} />
        <meshStandardMaterial color="#5a3a1c" roughness={0.9} />
      </mesh>
      <mesh position={[0, canopyY, 0]} castShadow>
        <coneGeometry args={[tree.canopyRadius, tree.canopyHeight, 10]} />
        <meshStandardMaterial color="#2f5d34" roughness={0.85} />
      </mesh>
    </group>
  );
}
