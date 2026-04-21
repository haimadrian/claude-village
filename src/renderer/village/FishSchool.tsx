/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { FISH_PATHS, FISH_COLORS, fishPositionAt, type FishPath } from "./fish";

/**
 * Renders a school of ~22 fish swimming along slow circular paths under
 * the water surface. The whole group's `visible` property is toggled
 * each frame based on whether the camera is below the water line, so
 * draw calls are skipped when the camera is above water but we avoid
 * React mount/unmount churn at the threshold crossing.
 *
 * Implementation choice: we use `three.Object3D.visible = false` rather
 * than conditional React rendering. Toggling `visible` skips the render
 * subtree at the Three.js level (no draw calls, no frustum traversal
 * for invisible descendants) while keeping state stable - simpler and
 * cheaper than `useState` + re-render on every threshold crossing.
 */

/** Camera y threshold - below this, the camera is "underwater". */
const UNDERWATER_Y = -0.2;

export function FishSchool() {
  const rootRef = useRef<THREE.Group>(null);
  const fishGroupsRef = useRef<Array<THREE.Group | null>>([]);
  const { camera } = useThree();
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const root = rootRef.current;
    if (!root) return;
    // Gate rendering via visibility. Cheap: single float compare per frame.
    const under = camera.position.y < UNDERWATER_Y;
    if (root.visible !== under) root.visible = under;
    if (!under) return;

    const t = state.clock.elapsedTime;
    for (let i = 0; i < FISH_PATHS.length; i++) {
      const path = FISH_PATHS[i]!;
      const g = fishGroupsRef.current[i];
      if (!g) continue;
      const { position, tangent } = fishPositionAt(path, t);
      g.position.set(position[0], position[1], position[2]);
      lookTarget.set(position[0] + tangent[0], position[1], position[2] + tangent[2]);
      g.lookAt(lookTarget);
    }
  });

  return (
    <group ref={rootRef} visible={false}>
      {FISH_PATHS.map((path, i) => (
        <group
          key={i}
          ref={(el) => {
            fishGroupsRef.current[i] = el;
          }}
        >
          <Fish path={path} />
        </group>
      ))}
    </group>
  );
}

function Fish({ path }: { path: FishPath }) {
  const color = FISH_COLORS[path.colorIndex] ?? FISH_COLORS[0]!;
  const s = path.scale;
  // Body length is along +Z (so lookAt aligns the fish with travel).
  const tailGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    // Triangle in the XY plane at the back of the body.
    const positions = new Float32Array([
      0, 0, 0, -0.15, 0.12, 0, -0.15, -0.12, 0,
      // backface
      0, 0, 0, -0.15, -0.12, 0, -0.15, 0.12, 0
    ]);
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <group scale={s}>
      {/* Body - a flattened box. */}
      <mesh castShadow>
        <boxGeometry args={[0.25, 0.12, 0.4]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {/* Tail - triangle at the back (local -z end). */}
      <mesh geometry={tailGeometry} position={[0, 0, -0.2]} rotation={[0, -Math.PI / 2, 0]}>
        <meshStandardMaterial color={color} roughness={0.7} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}
