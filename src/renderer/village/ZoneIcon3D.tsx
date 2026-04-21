/* eslint-disable react/no-unknown-property -- react-three-fiber extends JSX with three.js props */
import type { ZoneId } from "../../shared/zones";

/**
 * Small 3D icon floated on top of each zone building. Replaces the old
 * HTML-based floating emoji, which rendered on top of the canvas and
 * occluded characters / the zone label.
 *
 * Everything below is primitive geometry (no new GLBs). Each icon is
 * roughly 1 unit tall so it reads from a normal orbit-camera distance.
 *
 * The containing <group> carries `userData` for TooltipLayer so hovering
 * the icon still shows the zone name + description.
 */
interface ZoneIcon3DProps {
  zoneId: ZoneId;
  /** Y offset above the zone origin at which the icon sits. */
  altitude?: number;
}

export function ZoneIcon3D({ zoneId, altitude = 3.2 }: ZoneIcon3DProps) {
  return (
    <group position={[0, altitude, 0]} userData={{ tooltipKind: "zone-icon", zoneId }}>
      <IconFor zoneId={zoneId} />
    </group>
  );
}

function IconFor({ zoneId }: { zoneId: ZoneId }) {
  switch (zoneId) {
    case "office":
      return <OfficeIcon />;
    case "library":
      return <LibraryIcon />;
    case "mine":
      return <MineIcon />;
    case "forest":
      return <ForestIcon />;
    case "farm":
      return <FarmIcon />;
    case "nether":
      return <NetherIcon />;
    case "signpost":
      return <SignpostIcon />;
    case "spawner":
      return <SpawnerIcon />;
    case "tavern":
      return <TavernIcon />;
    default: {
      const _exhaustive: never = zoneId;
      throw new Error(`no icon for zone: ${String(_exhaustive)}`);
    }
  }
}

// office - a small cube with window-coloured face.
function OfficeIcon() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshStandardMaterial color="#b0c4de" />
      </mesh>
      {/* Window on each face. */}
      <mesh position={[0, 0, 0.46]}>
        <boxGeometry args={[0.45, 0.45, 0.02]} />
        <meshStandardMaterial color="#ffd97a" emissive="#ffd97a" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0, 0, -0.46]}>
        <boxGeometry args={[0.45, 0.45, 0.02]} />
        <meshStandardMaterial color="#ffd97a" emissive="#ffd97a" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

// library - a stack of 3 coloured book-sized boxes.
function LibraryIcon() {
  return (
    <group>
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[0.9, 0.22, 0.6]} />
        <meshStandardMaterial color="#8b3a3a" />
      </mesh>
      <mesh position={[0.05, -0.05, 0]}>
        <boxGeometry args={[0.85, 0.22, 0.6]} />
        <meshStandardMaterial color="#2c5f8d" />
      </mesh>
      <mesh position={[-0.04, 0.2, 0]}>
        <boxGeometry args={[0.88, 0.22, 0.6]} />
        <meshStandardMaterial color="#2f7d4f" />
      </mesh>
    </group>
  );
}

// mine - a pickaxe-ish cross of two cylinders.
function MineIcon() {
  return (
    <group rotation={[0, 0, Math.PI / 6]}>
      {/* Handle. */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 1.1, 8]} />
        <meshStandardMaterial color="#8b5a2b" />
      </mesh>
      {/* Head. */}
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.08, 0.08, 0.8, 8]} />
        <meshStandardMaterial color="#5a5a5a" metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

// forest - a pine tree: cone over a cylinder trunk.
function ForestIcon() {
  return (
    <group>
      <mesh position={[0, -0.35, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.4, 8]} />
        <meshStandardMaterial color="#6b4423" />
      </mesh>
      <mesh position={[0, 0.15, 0]}>
        <coneGeometry args={[0.45, 0.9, 8]} />
        <meshStandardMaterial color="#2e7d32" />
      </mesh>
    </group>
  );
}

// farm - a small bundle of wheat (three yellow cylinders).
function FarmIcon() {
  return (
    <group>
      <mesh position={[-0.18, 0, 0]} rotation={[0, 0, 0.15]}>
        <cylinderGeometry args={[0.06, 0.06, 0.9, 6]} />
        <meshStandardMaterial color="#d4a017" />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.95, 6]} />
        <meshStandardMaterial color="#e0b020" />
      </mesh>
      <mesh position={[0.18, 0, 0]} rotation={[0, 0, -0.15]}>
        <cylinderGeometry args={[0.06, 0.06, 0.9, 6]} />
        <meshStandardMaterial color="#d4a017" />
      </mesh>
    </group>
  );
}

// nether - a tilted red cone flame with a smaller orange cone.
function NetherIcon() {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <coneGeometry args={[0.35, 0.9, 8]} />
        <meshStandardMaterial color="#c62828" emissive="#ff5722" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, -0.15, 0]}>
        <coneGeometry args={[0.2, 0.5, 8]} />
        <meshStandardMaterial color="#ffab40" emissive="#ffab40" emissiveIntensity={0.7} />
      </mesh>
    </group>
  );
}

// signpost icon - a miniature signpost: post + plank.
function SignpostIcon() {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.1, 0.9, 0.1]} />
        <meshStandardMaterial color="#8b5a2b" />
      </mesh>
      <mesh position={[0.25, 0.2, 0]}>
        <boxGeometry args={[0.55, 0.3, 0.08]} />
        <meshStandardMaterial color="#c19a6b" />
      </mesh>
    </group>
  );
}

// spawner - four small glowing spheres in a tetrahedral arrangement.
function SpawnerIcon() {
  const r = 0.14;
  const d = 0.35;
  return (
    <group>
      {[
        [0, d, 0],
        [d, -d / 2, d],
        [-d, -d / 2, d],
        [0, -d / 2, -d]
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x!, y!, z!]}>
          <icosahedronGeometry args={[r, 0]} />
          <meshStandardMaterial color="#d6b3ff" emissive="#9370db" emissiveIntensity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

// tavern - a mug: cylinder + torus handle.
function TavernIcon() {
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[0.35, 0.3, 0.7, 12]} />
        <meshStandardMaterial color="#a0522d" />
      </mesh>
      {/* Foam top. */}
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.1, 12]} />
        <meshStandardMaterial color="#f8f4e3" />
      </mesh>
      {/* Handle. */}
      <mesh position={[0.38, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.15, 0.05, 8, 12]} />
        <meshStandardMaterial color="#a0522d" />
      </mesh>
    </group>
  );
}
