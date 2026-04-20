export type SessionAgeFilter = "1d" | "1w" | "1m" | "3m" | "6m" | "1y" | "all";

const STORAGE_KEY = "claudeVillage.sessionAgeFilter";
const DEFAULT_FILTER: SessionAgeFilter = "1m";
export const FILTER_CHANGED_EVENT = "cv:filter-changed";

const VALID: ReadonlySet<SessionAgeFilter> = new Set<SessionAgeFilter>([
  "1d",
  "1w",
  "1m",
  "3m",
  "6m",
  "1y",
  "all"
]);

export const SESSION_AGE_FILTER_OPTIONS: ReadonlyArray<{
  value: SessionAgeFilter;
  label: string;
}> = [
  { value: "1d", label: "1 day" },
  { value: "1w", label: "1 week" },
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "1y", label: "1 year" },
  { value: "all", label: "All" }
];

export function loadFilter(): SessionAgeFilter {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw && VALID.has(raw as SessionAgeFilter)) {
      return raw as SessionAgeFilter;
    }
  } catch {
    // localStorage may throw in restricted contexts; fall through to default.
  }
  return DEFAULT_FILTER;
}

export function saveFilter(f: SessionAgeFilter): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, f);
    }
  } catch {
    // ignore persistence failures
  }
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(FILTER_CHANGED_EVENT, { detail: { filter: f } }));
    }
  } catch {
    // ignore dispatch failures
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function filterMs(f: SessionAgeFilter): number | null {
  switch (f) {
    case "1d":
      return DAY_MS;
    case "1w":
      return 7 * DAY_MS;
    case "1m":
      return 30 * DAY_MS;
    case "3m":
      return 90 * DAY_MS;
    case "6m":
      return 180 * DAY_MS;
    case "1y":
      return 365 * DAY_MS;
    case "all":
      return null;
    default:
      return null;
  }
}
