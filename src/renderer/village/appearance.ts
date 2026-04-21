/**
 * Deterministic per-agent appearance helpers.
 *
 * Kept on the renderer side (not in session-store) so the store stays free of
 * visual concerns. The hash is stable across runs so the same agent id always
 * gets the same hair colour, which matches how `skinColor` is already derived.
 */

const HAIR_PALETTE: readonly string[] = [
  "#2b1a0a", // dark brown
  "#6b3e1e", // brown
  "#c9a227", // blond
  "#1a1a1a", // black
  "#a85f3c" // ginger
];

const TROUSERS_PALETTE: readonly string[] = [
  "#2f3a5b", // dark navy
  "#3a2a1a", // dark brown
  "#1f3a2a", // forest green
  "#2a2a2a", // charcoal
  "#4a2a3a" // deep plum
];

/**
 * Simple 32-bit string hash (djb2-ish). Sufficient for palette bucketing;
 * not intended for anything security-sensitive.
 */
function stringHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    // h * 33 + c, kept inside 32-bit range.
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  // Force unsigned so modulo is always non-negative.
  return h >>> 0;
}

/**
 * Pick a hair colour from a small palette keyed by the agent id. Stable across
 * runs for the same id; distributes reasonably across the palette.
 */
export function hairColor(id: string): string {
  const idx = stringHash(id) % HAIR_PALETTE.length;
  return HAIR_PALETTE[idx] ?? HAIR_PALETTE[0]!;
}

/**
 * Pick a trousers / leg colour from a small palette keyed by the agent id.
 * Stable across runs for the same id. A different palette from hair so that
 * hair and legs read as distinct Minecraft-style voxel layers rather than
 * matching by accident.
 */
export function trousersColor(id: string): string {
  const idx = stringHash(id) % TROUSERS_PALETTE.length;
  return TROUSERS_PALETTE[idx] ?? TROUSERS_PALETTE[0]!;
}

export const __test = { HAIR_PALETTE, TROUSERS_PALETTE, stringHash };
