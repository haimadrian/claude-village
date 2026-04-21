/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { SEABED_Y, SEABED_RADIUS } from "./sceneConstants";
import {
  SEABED_LAYOUT,
  seabedHeightAt,
  ROCK_SHADES,
  SEAGRASS_COLORS,
  CORAL_COLORS,
  type RockPlacement,
  type SeagrassCluster,
  type CoralPlacement
} from "./seabedLayout";

/**
 * Renders the ocean floor: a gently-displaced sandy plane, scattered
 * rocks, swaying seagrass tufts, and coral/sea flowers. Stays entirely
 * below the water column (no interaction with the island or pathfinding).
 */
export function Seabed() {
  return (
    <group position={[0, SEABED_Y, 0]}>
      <SandFloor />
      {SEABED_LAYOUT.rocks.map((rock, i) => (
        <Rock key={`r-${i}`} rock={rock} />
      ))}
      <SeagrassField clusters={SEABED_LAYOUT.seagrass} />
      {SEABED_LAYOUT.corals.map((coral, i) => (
        <Coral key={`c-${i}`} coral={coral} />
      ))}
    </group>
  );
}

/**
 * The sandy floor itself. A PlaneGeometry subdivided 64x64 with per-
 * vertex displacement driven by `seabedHeightAt`. Static geometry; no
 * per-frame updates.
 */
function SandFloor() {
  const geomRef = useRef<THREE.PlaneGeometry>(null);

  useEffect(() => {
    const geom = geomRef.current;
    if (!geom) return;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    // The plane lives in the XY plane before its -PI/2 x-rotation, so
    // local x is world x and local y is world z. We displace local z
    // (which becomes world y after rotation).
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, seabedHeightAt(x, y));
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry ref={geomRef} args={[SEABED_RADIUS * 2, SEABED_RADIUS * 2, 64, 64]} />
      <meshStandardMaterial color="#c8b07a" roughness={0.95} />
    </mesh>
  );
}

function Rock({ rock }: { rock: RockPlacement }) {
  const [x, z] = rock.position;
  const y = seabedHeightAt(x, z) + rock.scale[1] * 0.25;
  const color = ROCK_SHADES[rock.shadeIndex] ?? ROCK_SHADES[0]!;
  return (
    <mesh
      position={[x, y, z]}
      rotation={[0, rock.rotationY, 0]}
      scale={rock.scale}
      castShadow
      receiveShadow
    >
      <dodecahedronGeometry args={[0.6, 0]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

/**
 * All seagrass blades share one `useFrame` that adjusts their y-rotation
 * with a per-blade phase to produce a cheap sway. We apply the sway to
 * the group wrapping each blade, not to the geometry itself.
 */
function SeagrassField({ clusters }: { clusters: readonly SeagrassCluster[] }) {
  const groupsRef = useRef<Array<THREE.Group | null>>([]);
  // Flattened phase list matching traversal order below.
  const phases = useMemo(() => {
    const out: number[] = [];
    for (const c of clusters) for (const b of c.blades) out.push(b.phase);
    return out;
  }, [clusters]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const groups = groupsRef.current;
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (!g) continue;
      const phase = phases[i] ?? 0;
      // A small rocking motion around the base.
      g.rotation.z = Math.sin(t * 1.6 + phase) * 0.25;
    }
  });

  // Build a flat render list so refs line up with phases.
  const elements: JSX.Element[] = [];
  let bladeIdx = 0;
  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci]!;
    const color = SEAGRASS_COLORS[cluster.colorIndex] ?? SEAGRASS_COLORS[0]!;
    const [cx, cz] = cluster.position;
    const baseY = seabedHeightAt(cx, cz);
    for (let bi = 0; bi < cluster.blades.length; bi++) {
      const blade = cluster.blades[bi]!;
      const [dx, dz] = blade.offset;
      const refIdx = bladeIdx++;
      elements.push(
        <group
          key={`g-${ci}-${bi}`}
          position={[cx + dx, baseY, cz + dz]}
          ref={(el) => {
            groupsRef.current[refIdx] = el;
          }}
        >
          <mesh position={[0, blade.height / 2, 0]} castShadow>
            <boxGeometry args={[0.05, blade.height, 0.02]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        </group>
      );
    }
  }
  return <group>{elements}</group>;
}

function Coral({ coral }: { coral: CoralPlacement }) {
  const [x, z] = coral.position;
  const baseY = seabedHeightAt(x, z);
  const color = CORAL_COLORS[coral.colorIndex] ?? CORAL_COLORS[0]!;
  const s = coral.scale;
  if (coral.shape === 0) {
    // Cone tuft.
    return (
      <mesh position={[x, baseY + s * 0.5, z]} scale={s} castShadow>
        <coneGeometry args={[0.35, 1.1, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    );
  }
  if (coral.shape === 1) {
    // Icosahedron cluster.
    return (
      <mesh position={[x, baseY + s * 0.45, z]} scale={s} castShadow>
        <icosahedronGeometry args={[0.45, 0]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
    );
  }
  // Sphere cluster (a small double sphere to read as a flower head).
  return (
    <group position={[x, baseY, z]} scale={s}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <sphereGeometry args={[0.35, 10, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0.25, 0.2, 0.1]} castShadow>
        <sphereGeometry args={[0.22, 10, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  );
}
