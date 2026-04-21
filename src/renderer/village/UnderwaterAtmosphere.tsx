import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { UNDERWATER_COLOR, UNDERWATER_FOG_DENSITY, isUnderwaterView } from "./sceneConstants";

/**
 * Installs / removes scene-level fog and background colour based on
 * whether the camera is below the water line. Also toggles the
 * visibility of a sibling sky/clouds group via the provided ref so that
 * the drei `<Sky>` dome and `<Clouds>` puffs stop occluding the scene
 * when the player is underwater (scene.background alone cannot hide
 * them - they are real rendered geometry).
 *
 * Matches the same `camera.position.y < UNDERWATER_CAMERA_Y` gate that
 * `FishSchool` uses, so the atmosphere switch, the fish reveal and any
 * other underwater-only content toggle on exactly the same frame and
 * the threshold crossing never flickers.
 *
 * Performance: both the fog and the colour are allocated once in a ref
 * and reused - no per-frame allocations. The `useFrame` body does a
 * single float compare per frame, plus two property writes on the
 * threshold-crossing frame.
 */
export interface UnderwaterAtmosphereProps {
  /**
   * Ref to the `<group>` that wraps the sky dome and clouds. Its
   * `.visible` is flipped to false while underwater and true above.
   */
  skyGroupRef: React.MutableRefObject<THREE.Group | null>;
}

export function UnderwaterAtmosphere({ skyGroupRef }: UnderwaterAtmosphereProps) {
  const { scene, camera } = useThree();
  const fogRef = useRef<THREE.FogExp2 | null>(null);
  const bgColorRef = useRef<THREE.Color | null>(null);
  // Remember the last state we applied so we only write to scene.* on a
  // threshold crossing instead of every frame. Initialised to `null` so
  // the very first frame always applies the correct state.
  const lastStateRef = useRef<boolean | null>(null);

  if (!fogRef.current) {
    fogRef.current = new THREE.FogExp2(UNDERWATER_COLOR, UNDERWATER_FOG_DENSITY);
  }
  if (!bgColorRef.current) {
    bgColorRef.current = new THREE.Color(UNDERWATER_COLOR);
  }

  // On unmount, always clear fog + background so a parent remount does
  // not leak underwater state into a fresh scene.
  useEffect(() => {
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene]);

  useFrame(() => {
    // Underwater state is scoped to "camera below waterline AND over the
    // ocean, not over the main island". A close zoom toward the centre
    // can pull the camera below y = UNDERWATER_CAMERA_Y even though the
    // user is still looking at land - flipping the scene into underwater
    // mode there hides the sky dome while the island fills the view,
    // producing a bright white/green wash (the reported "zoom to white
    // screen" bug).
    const under = isUnderwaterView(camera.position.x, camera.position.y, camera.position.z);
    if (lastStateRef.current === under) return;
    lastStateRef.current = under;

    if (under) {
      scene.fog = fogRef.current;
      scene.background = bgColorRef.current;
    } else {
      scene.fog = null;
      scene.background = null;
    }

    const skyGroup = skyGroupRef.current;
    if (skyGroup && skyGroup.visible === under) {
      skyGroup.visible = !under;
    }
  });

  return null;
}
