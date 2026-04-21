/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";

/**
 * Animated water surface. We keep a single `PlaneGeometry` with a
 * moderate subdivision count (64 x 64 for a 200-unit plane keeps the
 * vertex budget around 4k - cheap even on integrated GPUs) and mutate
 * the per-vertex y on every frame via two summed sinusoids. Normals are
 * recomputed so lighting stays correct.
 *
 * A separate, deeper opaque plane ("seabed") is rendered below the
 * wavy surface so when the camera tilts under the horizon the player
 * sees dark-blue water depth instead of the sky bleeding through.
 */

export interface WavyWaterProps {
  size?: number;
  segments?: number;
  amplitude?: number;
  wavelength?: number;
  speed?: number;
  surfaceY?: number;
  seabedY?: number;
}

export function WavyWater({
  size = 200,
  segments = 64,
  amplitude = 0.12,
  wavelength = 8,
  speed = 0.9,
  surfaceY = -0.2,
  seabedY = -1.6
}: WavyWaterProps) {
  const geomRef = useRef<THREE.PlaneGeometry>(null);
  // Cache the flat (pre-animation) y of every vertex so each frame
  // computes `base + displacement` rather than accumulating drift.
  const baseYRef = useRef<Float32Array | null>(null);

  // Wave number (angular spatial frequency).
  const k = useMemo(() => (2 * Math.PI) / wavelength, [wavelength]);

  useFrame((state) => {
    const geom = geomRef.current;
    if (!geom) return;
    const pos = geom.attributes.position as THREE.BufferAttribute;
    if (!baseYRef.current || baseYRef.current.length !== pos.count) {
      // Capture the base positions exactly once. For a flat
      // PlaneGeometry (before the -PI/2 x rotation), the local y of
      // every vertex starts at 0; we keep the buffer anyway so the
      // logic stays correct if the geometry is ever swapped for a
      // non-flat source.
      baseYRef.current = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) baseYRef.current[i] = pos.getZ(i);
    }
    const base = baseYRef.current;
    const t = state.clock.elapsedTime * speed;
    // PlaneGeometry sits in the XY plane before the mesh rotation, so
    // the "up" axis in local space is +Z. We displace the z-component
    // and let the parent mesh's -PI/2 x rotation fold it into world
    // space where it reads as vertical wave height.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const disp = amplitude * Math.sin(k * x + t) + amplitude * Math.cos(k * y + t * 0.7);
      pos.setZ(i, (base[i] ?? 0) + disp);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  });

  return (
    <group>
      {/* Wavy translucent surface. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, surfaceY, 0]} receiveShadow>
        <planeGeometry ref={geomRef} args={[size, size, segments, segments]} />
        <meshStandardMaterial
          color="#3b82c4"
          transparent
          opacity={0.82}
          metalness={0.35}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Opaque deep layer - hides the sky when the camera pitches
          below the horizon so the ocean has visual depth. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, seabedY, 0]}>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#0b2540" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
