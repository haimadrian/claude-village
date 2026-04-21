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
 * behaves exactly as before.
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
  return (
    <group
      position={position}
      rotation={[0, yaw, 0]}
      userData={{ tooltipKind: "zone-signpost", zoneId: meta.id }}
    >
      {/* Post. */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[0.15, 2, 0.15]} />
        <meshStandardMaterial color="#8b5a2b" />
      </mesh>
      {/* Plank. */}
      <mesh position={[0, 1.7, 0.05]}>
        <boxGeometry args={[1.4, 0.45, 0.08]} />
        <meshStandardMaterial color="#c19a6b" />
      </mesh>
      {/* Label on the front of the plank, nudged slightly forward so it
          doesn't z-fight with the plank mesh. */}
      <Text
        position={[0, 1.7, 0.1]}
        fontSize={0.22}
        color="#2a1a0a"
        anchorX="center"
        anchorY="middle"
        maxWidth={1.3}
        outlineWidth={0.01}
        outlineColor="#f3e2c2"
      >
        {meta.name}
      </Text>
    </group>
  );
}

/**
 * Loads the zone GLB and clones its scene so every zone is an independent
 * Object3D even when multiple zones share the same source model in the GLTF
 * cache.
 */
function ZoneBuilding({ meta }: { meta: ZoneMeta }) {
  const url = zoneModel(meta.id);
  const gltf = useGLTF(url) as unknown as { scene: THREE.Group };
  const cloned = useMemo(() => gltf.scene.clone(true), [gltf]);
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
