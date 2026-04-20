export type ZoneId =
  | "office"
  | "library"
  | "mine"
  | "forest"
  | "farm"
  | "nether"
  | "signpost"
  | "spawner"
  | "tavern";

export interface ZoneMeta {
  id: ZoneId;
  name: string;
  icon: string; // emoji
  description: string; // shown in tooltip
}

export const ZONES: readonly ZoneMeta[] = [
  {
    id: "office",
    name: "Office",
    icon: "🏢",
    description: "Writing or editing code (Write, Edit, NotebookEdit)"
  },
  { id: "library", name: "Library", icon: "📚", description: "Reading files (Read)" },
  { id: "mine", name: "Mine", icon: "⛏️", description: "Searching the codebase (Glob, Grep)" },
  {
    id: "forest",
    name: "Forest",
    icon: "🌲",
    description: "Running generic shell commands (Bash)"
  },
  { id: "farm", name: "Farm", icon: "🌾", description: "Running tests" },
  { id: "nether", name: "Nether portal", icon: "🔥", description: "Git operations" },
  {
    id: "signpost",
    name: "Signpost",
    icon: "🪧",
    description: "Fetching external resources (WebFetch, WebSearch, MCP)"
  },
  { id: "spawner", name: "Spawner", icon: "✨", description: "Delegating to subagents (Task)" },
  { id: "tavern", name: "Tavern", icon: "🍺", description: "Idle, finished, or retired ghosts" }
] as const;
