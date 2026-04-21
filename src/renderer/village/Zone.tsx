/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { Suspense, useMemo } from "react";
import { Html, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { ZoneMeta } from "../../shared/zones";
import { zoneModel } from "./assetMap";
import { GltfErrorBoundary } from "./GltfErrorBoundary";

interface ZoneProps {
  meta: ZoneMeta;
  position: [number, number, number];
}

/**
 * Tier 2 zone: renders a bundled GLB voxel building in place of the Tier 1
 * box platform. Preserves the signpost, floating emoji icon, and tooltip
 * userData exactly as before so TooltipLayer / pathfinding / label tests
 * continue to pass. If the GLB fails to load, <GltfErrorBoundary> swaps in
 * the Tier 1 cube so the scene never goes blank.
 */
export function Zone({ meta, position }: ZoneProps) {
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
      <mesh position={[1.5, 1.5, 1.5]} userData={{ tooltipKind: "zone-signpost", zoneId: meta.id }}>
        <boxGeometry args={[0.2, 2, 0.2]} />
        <meshStandardMaterial color="#8b5a2b" />
      </mesh>
      <Html
        position={[0, 3, 0]}
        center
        zIndexRange={[100, 0]}
        userData={{ tooltipKind: "zone-icon", zoneId: meta.id }}
      >
        <div
          title={`${meta.icon} ${meta.name} - ${meta.description}`}
          style={{ fontSize: 28, pointerEvents: "auto", cursor: "default", userSelect: "none" }}
        >
          {meta.icon}
        </div>
      </Html>
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
