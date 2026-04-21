/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { Suspense, useMemo } from "react";
import { Text, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { ZoneMeta } from "../../shared/zones";
import { zoneModel } from "./assetMap";
import { GltfErrorBoundary } from "./GltfErrorBoundary";
import { ZoneIcon3D } from "./ZoneIcon3D";

interface ZoneProps {
  meta: ZoneMeta;
  position: [number, number, number];
}

/**
 * Tier 2 zone: renders a bundled GLB voxel building plus a proper
 * signpost (post + plank with label) and a small 3D zone icon hovering
 * above the roof. The zone group's centre is the old behaviour (used by
 * pathfinding and the camera focus). Characters no longer stand here -
 * see slotPositionFor() in slots.ts.
 *
 * Preserves `userData` for TooltipLayer so hover still resolves to the
 * zone name / description.
 */
export function Zone({ meta, position }: ZoneProps) {
  // The signpost is placed on the island-facing side of the zone so it
  // reads as "welcoming" the central walkway. Direction from zone to
  // island centre is the negated, normalised position vector.
  const inward = useMemo(() => {
    const [x, , z] = position;
    const mag = Math.sqrt(x * x + z * z);
    if (mag === 0) return { x: -1, z: 0 };
    return { x: -x / mag, z: -z / mag };
  }, [position]);

  const signpostOffset = 1.8;
  const signpostPos: [number, number, number] = [
    inward.x * signpostOffset,
    0,
    inward.z * signpostOffset
  ];
  // Plank faces the island centre: rotate so its +Z faces inward.
  const plankYaw = Math.atan2(inward.x, inward.z);

  return (
    <group
      position={position}
      userData={{
        tooltipKind: "zone",
        zoneId: meta.id,
        zoneName: meta.name,
        zoneDescription: meta.description
      }}
    >
      <GltfErrorBoundary label={`zone:${meta.id}`} fallback={<FallbackZone zoneId={meta.id} />}>
        <Suspense fallback={<FallbackZone zoneId={meta.id} />}>
          <ZoneBuilding meta={meta} />
        </Suspense>
      </GltfErrorBoundary>
      <Signpost meta={meta} position={signpostPos} yaw={plankYaw} />
      <ZoneIcon3D zoneId={meta.id} />
    </group>
  );
}

/**
 * Wooden signpost: thin vertical post plus a horizontal plank near the
 * top bearing the zone name. The whole group is rotated by `yaw` so the
 * plank faces the island centre.
 *
 * Preserves the `zone-signpost` tooltipKind so TooltipLayer hit-testing
 * behaves exactly as before. Each sub-mesh also carries its own
 * `zone-signpost` userData so a direct raycast hit on the thin post or
 * plank always resolves, even if the parent chain walk short-circuits.
 * A large invisible hitbox wraps the plank to make the thin label easy
 * to hover.
 */
function Signpost({
  meta,
  position,
  yaw
}: {
  meta: ZoneMeta;
  position: [number, number, number];
  yaw: number;
}) {
  const signpostUserData = { tooltipKind: "zone-signpost", zoneId: meta.id };
  return (
    <group position={position} rotation={[0, yaw, 0]} userData={signpostUserData}>
      {/* Post. */}
      <mesh position={[0, 1, 0]} userData={signpostUserData}>
        <boxGeometry args={[0.15, 2, 0.15]} />
        <meshStandardMaterial color="#6b4423" />
      </mesh>
      {/* Plank: lighter pine so dark text reads clearly. */}
      <mesh position={[0, 1.75, 0.05]} userData={signpostUserData}>
        <boxGeometry args={[1.6, 0.55, 0.08]} />
        <meshStandardMaterial color="#e8cfa0" />
      </mesh>
      {/* Front-facing label. Larger, high-contrast (near-black) with a
          thin light outline so it reads against any lighting. Wrapped in
          a group that carries userData because drei's internal SDFText
          mesh has its own userData. */}
      <group position={[0, 1.75, 0.11]} userData={signpostUserData}>
        <Text
          fontSize={0.28}
          color="#1a0f05"
          anchorX="center"
          anchorY="middle"
          maxWidth={1.5}
          outlineWidth={0.015}
          outlineColor="#ffffff"
          userData={signpostUserData}
        >
          {meta.name}
        </Text>
      </group>
      {/* Back-facing label so the zone name is legible from both sides. */}
      <group position={[0, 1.75, -0.01]} rotation={[0, Math.PI, 0]} userData={signpostUserData}>
        <Text
          fontSize={0.28}
          color="#1a0f05"
          anchorX="center"
          anchorY="middle"
          maxWidth={1.5}
          outlineWidth={0.015}
          outlineColor="#ffffff"
          userData={signpostUserData}
        >
          {meta.name}
        </Text>
      </group>
      {/* Invisible generous hitbox around the plank so thin geometry and
          SDF text never cause the hover raycast to miss. */}
      <mesh position={[0, 1.75, 0.05]} visible={false} userData={signpostUserData}>
        <boxGeometry args={[1.9, 0.8, 0.4]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

/**
 * Loads the zone GLB and clones its scene so every zone is an independent
 * Object3D even when multiple zones share the same source model in the GLTF
 * cache. Stamps `zone-ground` userData on every descendant mesh so any
 * raycast hit (roof, walls, decorations) resolves to the same tooltip.
 */
function ZoneBuilding({ meta }: { meta: ZoneMeta }) {
  const url = zoneModel(meta.id);
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const cloned = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const ud = { tooltipKind: "zone-ground", zoneId: meta.id };
    scene.userData = { ...scene.userData, ...ud };
    scene.traverse((child) => {
      child.userData = { ...child.userData, ...ud };
    });
    return scene;
  }, [gltf, meta.id]);
  return <primitive object={cloned} userData={{ tooltipKind: "zone-ground", zoneId: meta.id }} />;
}

/**
 * Tier 1 cube rendering, preserved verbatim. Used both as Suspense fallback
 * (first paint before the GLB resolves) and as the hard error fallback when
 * the GLB cannot be loaded at all.
 */
function FallbackZone({ zoneId }: { zoneId: string }) {
  return (
    <mesh position={[0, 0.1, 0]} userData={{ tooltipKind: "zone-ground", zoneId }}>
      <boxGeometry args={[4, 0.2, 4]} />
      <meshStandardMaterial color={zoneColor(zoneId)} />
    </mesh>
  );
}

function zoneColor(id: string): string {
  const c: Record<string, string> = {
    office: "#b0c4de",
    library: "#8b6f47",
    mine: "#5a5a5a",
    forest: "#2e7d32",
    farm: "#d4a017",
    nether: "#8b0000",
    signpost: "#c19a6b",
    spawner: "#9370db",
    tavern: "#a0522d"
  };
  return c[id] ?? "#777";
}
