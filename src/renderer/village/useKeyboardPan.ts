/**
 * Keyboard camera-pan helper for VillageScene.
 *
 * Arrow keys pan the OrbitControls target in the xz ground plane, relative
 * to the camera's current facing direction. `+` / `=` / PgUp dolly the
 * camera in; `-` / `_` / PgDn dolly out. Holding a key repeats smoothly
 * (we drive motion from a `useFrame` tick, not from the OS key-repeat).
 *
 * The keydown/keyup listeners live on `window` but become a no-op as soon
 * as the active element is editable (input / textarea / contenteditable)
 * so typing in Settings does not jitter the camera. Any arrow keypress
 * also fires a user-override callback so an in-flight focus-agent /
 * focus-zone lerp is cancelled and the user gets immediate control.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/** Pan speed in world units per second. Sized so a full island (~26u) takes ~2s. */
export const PAN_SPEED = 14;
/** Dolly speed in world units per second. */
export const DOLLY_SPEED = 4;
/** Multiplier applied while Shift is held. */
export const FAST_MULTIPLIER = 2.5;

/** Keys that trigger panning. Matches `KeyboardEvent.key`. */
const PAN_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/** Keys that trigger dollying. */
const DOLLY_IN_KEYS: ReadonlySet<string> = new Set(["+", "=", "PageUp"]);
const DOLLY_OUT_KEYS: ReadonlySet<string> = new Set(["-", "_", "PageDown"]);

/**
 * Pure math: given the set of currently-pressed keys, a camera forward
 * vector projected onto the ground plane (xz), a pan speed and a delta
 * time, compute the `{dx, dz}` offset to add to the orbit target.
 *
 * Exported so unit tests can verify it without instantiating three.js.
 *
 * The forward vector is normalised internally - callers may pass a
 * raw projected camera direction.
 */
export function panDeltaForKeys(
  keys: ReadonlySet<string>,
  forwardXZ: { x: number; z: number },
  speed: number,
  dt: number
): { dx: number; dz: number } {
  if (keys.size === 0) return { dx: 0, dz: 0 };
  // Normalise forward. If the camera looks straight down (rare - the scene
  // clamps polarAngle), fall back to +z forward so the controls stay usable.
  const fLen = Math.hypot(forwardXZ.x, forwardXZ.z);
  const fx = fLen > 1e-6 ? forwardXZ.x / fLen : 0;
  const fz = fLen > 1e-6 ? forwardXZ.z / fLen : 1;
  // Right = forward rotated -90 deg around +y (standard right-hand rule).
  // Rotating (fx, fz) by -90 gives (fz, -fx).
  const rx = fz;
  const rz = -fx;

  let ax = 0;
  let az = 0;
  if (keys.has("ArrowUp")) {
    ax += fx;
    az += fz;
  }
  if (keys.has("ArrowDown")) {
    ax -= fx;
    az -= fz;
  }
  if (keys.has("ArrowRight")) {
    ax += rx;
    az += rz;
  }
  if (keys.has("ArrowLeft")) {
    ax -= rx;
    az -= rz;
  }
  // Normalise diagonal motion so pressing two keys is not sqrt(2)x faster.
  const len = Math.hypot(ax, az);
  if (len < 1e-6) return { dx: 0, dz: 0 };
  const step = speed * dt;
  return { dx: (ax / len) * step, dz: (az / len) * step };
}

/** Sum of dolly deltas requested by the pressed keys, in world units per frame. */
export function dollyDeltaForKeys(keys: ReadonlySet<string>, speed: number, dt: number): number {
  let d = 0;
  for (const k of keys) {
    if (DOLLY_IN_KEYS.has(k)) d -= speed * dt;
    else if (DOLLY_OUT_KEYS.has(k)) d += speed * dt;
  }
  return d;
}

/** True when the active element would be hijacked by our arrow handling. */
function isEditableActive(): boolean {
  const el = typeof document !== "undefined" ? document.activeElement : null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Hook: attach global keydown/keyup listeners while mounted and mutate the
 * OrbitControls target each frame based on which keys are down. Must be
 * rendered inside a `<Canvas>` so `useFrame` / `useThree` work.
 *
 * `onUserOverride` is invoked once per keydown for any pan/dolly key so
 * the caller can cancel an in-flight lerp.
 */
export function useKeyboardPan(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.MutableRefObject<any>,
  onUserOverride: () => void
): void {
  const keysRef = useRef<Set<string>>(new Set());
  const { camera } = useThree();

  useEffect(() => {
    const handleDown = (e: KeyboardEvent): void => {
      if (isEditableActive()) return;
      const key = e.key;
      const isPan = PAN_KEYS.has(key);
      const isDolly = DOLLY_IN_KEYS.has(key) || DOLLY_OUT_KEYS.has(key);
      if (!isPan && !isDolly) return;
      // Prevent page scroll etc. from arrow keys inside the app window.
      e.preventDefault();
      if (!keysRef.current.has(key)) {
        keysRef.current.add(key);
        onUserOverride();
      }
    };
    const handleUp = (e: KeyboardEvent): void => {
      keysRef.current.delete(e.key);
    };
    const handleBlur = (): void => {
      // Window lost focus - drop all pressed keys so we do not keep panning
      // when the user alt-tabs away mid-press.
      keysRef.current.clear();
    };
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [onUserOverride]);

  // Reusable scratch vector so we do not allocate every frame.
  const forwardRef = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const controls = controlsRef.current;
    if (!controls) return;
    const keys = keysRef.current;
    if (keys.size === 0) return;

    // Camera forward, projected onto the xz plane.
    const fwd = forwardRef.current;
    camera.getWorldDirection(fwd);
    const shift = keys.has("Shift") ? FAST_MULTIPLIER : 1;
    const { dx, dz } = panDeltaForKeys(keys, { x: fwd.x, z: fwd.z }, PAN_SPEED * shift, dt);
    if (dx !== 0 || dz !== 0) {
      const t = controls.target as THREE.Vector3;
      t.x += dx;
      t.z += dz;
    }

    const dollyDelta = dollyDeltaForKeys(keys, DOLLY_SPEED * shift, dt);
    if (dollyDelta !== 0) {
      // OrbitControls stores distance implicitly via camera.position vs target.
      // Scale the offset by `1 + dollyDelta / distance` to move along that ray.
      const t = controls.target as THREE.Vector3;
      const offset = camera.position.clone().sub(t);
      const distance = offset.length();
      if (distance > 1e-6) {
        const minD = typeof controls.minDistance === "number" ? controls.minDistance : 0;
        const maxD = typeof controls.maxDistance === "number" ? controls.maxDistance : Infinity;
        const newDistance = Math.max(minD, Math.min(maxD, distance + dollyDelta));
        offset.multiplyScalar(newDistance / distance);
        camera.position.copy(t).add(offset);
      }
    }

    if (typeof controls.update === "function") controls.update();
  });
}
