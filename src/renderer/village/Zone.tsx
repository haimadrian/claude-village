/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import { Html } from "@react-three/drei";
import type { ZoneMeta } from "../../shared/zones";

interface ZoneProps {
  meta: ZoneMeta;
  position: [number, number, number];
}

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
      <mesh position={[0, 0.1, 0]} userData={{ tooltipKind: "zone-ground", zoneId: meta.id }}>
        <boxGeometry args={[4, 0.2, 4]} />
        <meshStandardMaterial color={zoneColor(meta.id)} />
      </mesh>
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
        <div style={{ fontSize: 28, pointerEvents: "auto", cursor: "help", userSelect: "none" }}>
          {meta.icon}
        </div>
      </Html>
    </group>
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
