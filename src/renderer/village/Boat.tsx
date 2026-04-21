/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { MAIN_ISLAND_RADIUS } from "./sceneConstants";

/**
 * Parameters for a single boat's orbit around the main island. Kept
 * plain data so the fleet configuration (see `BOAT_FLEET_CONFIG`)
 * stays readable and testable.
 */
export interface BoatOrbit {
  /** Orbit radius in world units. */
  radius: number;
  /** Angular speed in radians / second. Positive is counter-clockwise. */
  angularSpeed: number;
  /** Starting phase in radians. */
  phase: number;
  /** Sea-level y (roughly the water surface). Boat bobs around this. */
  baseY: number;
}

export const BOAT_COUNT = 4;

/**
 * Four boats spaced around four different orbit radii. Values chosen to
 * sit outside the main island ring (`MAIN_ISLAND_RADIUS + 6` or more)
 * and inside the scatter radius of the minor archipelago so they never
 * clip into land. Angular speeds are small enough that an on-screen
 * boat takes at least a minute to complete a lap, which reads as a
 * slow cruise rather than a pond-spin.
 */
export const BOAT_FLEET_CONFIG: readonly BoatOrbit[] = Object.freeze([
  { radius: MAIN_ISLAND_RADIUS + 7, angularSpeed: 0.09, phase: 0, baseY: -0.15 },
  {
    radius: MAIN_ISLAND_RADIUS + 12,
    angularSpeed: -0.06,
    phase: Math.PI * 0.5,
    baseY: -0.15
  },
  {
    radius: MAIN_ISLAND_RADIUS + 16,
    angularSpeed: 0.05,
    phase: Math.PI,
    baseY: -0.15
  },
  {
    radius: MAIN_ISLAND_RADIUS + 20,
    angularSpeed: -0.04,
    phase: Math.PI * 1.5,
    baseY: -0.15
  }
]);

/**
 * Pure helper - where does this boat sit at time `t`? Exported so the
 * orbit geometry can be unit tested without spinning up a renderer.
 *
 * Returns `{ position, tangent }` where `tangent` is the unit-length
 * world-space direction the boat is heading. The tangent is the
 * derivative of the orbit parametrisation, so it already includes the
 * sign of the angular speed.
 */
export function boatOrbitAt(
  orbit: BoatOrbit,
  t: number
): { position: [number, number, number]; tangent: [number, number, number] } {
  const angle = orbit.phase + orbit.angularSpeed * t;
  const x = Math.cos(angle) * orbit.radius;
  const z = Math.sin(angle) * orbit.radius;
  // Derivative of (cos,sin) wrt angle is (-sin, cos); multiply by
  // sign(angularSpeed) so the tangent points the direction of travel.
  const sign = Math.sign(orbit.angularSpeed) || 1;
  const tx = -Math.sin(angle) * sign;
  const tz = Math.cos(angle) * sign;
  const y = orbit.baseY + Math.sin(t * 0.9 + orbit.phase) * 0.05;
  return {
    position: [x, y, z],
    tangent: [tx, 0, tz]
  };
}

/**
 * A single boat mesh - hull, mast, triangular sail. Colours chosen to
 * match the existing warm-wood palette (signposts) and cloud-white.
 * Geometry dimensions are intentionally chunky so the silhouette reads
 * clearly from the default camera distance.
 */
function BoatMesh() {
  // Build the sail geometry once. Using BufferGeometry for the tri
  // avoids shipping yet another PlaneGeometry + tweaks and keeps the
  // triangle mathematically exact (no spurious subdivisions).
  const sailGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    // Triangle with base at the bottom (y=0), apex at the top (y=1.6).
    // Extrusion in x is handled by scale on the mesh itself.
    const positions = new Float32Array([
      // front face
      -0.9, 0, 0, 0.9, 0, 0, 0, 1.6, 0,
      // back face (reverse winding so it shows from the other side)
      -0.9, 0, 0, 0, 1.6, 0, 0.9, 0, 0
    ]);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <group>
      {/* Hull - dark stained wood. */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2, 0.4, 1]} />
        <meshStandardMaterial color="#6b4423" roughness={0.7} />
      </mesh>
      {/* Deck plank accent. */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[1.8, 0.05, 0.85]} />
        <meshStandardMaterial color="#8a5a2b" roughness={0.8} />
      </mesh>
      {/* Mast. */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.08, 1.7, 0.08]} />
        <meshStandardMaterial color="#4a2f15" roughness={0.85} />
      </mesh>
      {/* Sail - off-white triangle. The sail sits just in front of the
          mast and is double-sided so it is always visible regardless of
          orbit direction. */}
      <mesh position={[0, 0.2, 0.02]} geometry={sailGeometry}>
        <meshStandardMaterial color="#f4f1e8" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * Fleet container - renders one boat per entry in
 * `BOAT_FLEET_CONFIG` and drives their motion in a single shared
 * `useFrame` so we never force a React re-render just to move a mesh.
 */
export function BoatFleet() {
  const groupsRef = useRef<Array<THREE.Group | null>>([]);
  // Scratch vectors reused every frame so we never allocate in the hot
  // path. `look` stores the computed `lookAt` target - the boat's own
  // position plus its tangent vector.
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (let i = 0; i < BOAT_FLEET_CONFIG.length; i++) {
      const orbit = BOAT_FLEET_CONFIG[i]!;
      const group = groupsRef.current[i];
      if (!group) continue;
      const { position, tangent } = boatOrbitAt(orbit, t);
      group.position.set(position[0], position[1], position[2]);
      lookTarget.set(position[0] + tangent[0], position[1], position[2] + tangent[2]);
      group.lookAt(lookTarget);
      // Gentle pitch/roll - small sinusoidal tilt around the local
      // x-axis (pitch) and z-axis (roll). The existing `lookAt` sets
      // the Y rotation; we layer the extra axes on top.
      group.rotation.x = Math.sin(t * 1.1 + orbit.phase) * 0.05;
      group.rotation.z = Math.cos(t * 0.9 + orbit.phase * 0.5) * 0.04;
    }
  });

  return (
    <group>
      {BOAT_FLEET_CONFIG.map((orbit, i) => (
        <group
          key={i}
          ref={(el) => {
            groupsRef.current[i] = el;
          }}
        >
          <BoatMesh />
        </group>
      ))}
    </group>
  );
}
