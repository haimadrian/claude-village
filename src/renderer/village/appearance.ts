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

export const __test = { HAIR_PALETTE, stringHash };
