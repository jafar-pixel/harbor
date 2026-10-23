/** Stable shelf IDs keep saved layouts valid as the Sports Hub evolves. */
export const SPORTS_HOME_SHELVES = [
  { id: "hero", label: "Main slider" },
  { id: "top10", label: "Top 10 today" },
  { id: "stories", label: "Game stories" },
  { id: "channel-cards", label: "Live sports channel cards" },
  { id: "scores", label: "Scores" },
  { id: "featured", label: "Featured matches slider" },
  { id: "live", label: "Live games" },
  { id: "your-teams", label: "Your teams" },
  { id: "coming-up", label: "Coming up" },
  { id: "fight-nights", label: "Fight nights" },
  { id: "channels", label: "Sports channel browser" },
  { id: "pitch", label: "Match spotlight" },
  { id: "esports", label: "Esports" },
  { id: "schedule", label: "Daily schedule" },
  { id: "also-today", label: "Also today" },
] as const;
export type SportsShelfId = (typeof SPORTS_HOME_SHELVES)[number]["id"];
export const DEFAULT_SPORTS_HOME_ORDER: SportsShelfId[] = SPORTS_HOME_SHELVES.map((s) => s.id);
export const DEFAULT_SPORTS_HOME_HIDDEN = ["featured"];
const known = new Set<string>(DEFAULT_SPORTS_HOME_ORDER);

export function sportsHomeOrder(value: unknown): SportsShelfId[] {
  const saved = Array.isArray(value)
    ? value.filter((v): v is SportsShelfId => typeof v === "string" && known.has(v))
    : [];
  return [...new Set([...saved, ...DEFAULT_SPORTS_HOME_ORDER])];
}

export function sportsHomeHidden(value: unknown): SportsShelfId[] {
  if (!Array.isArray(value)) return [...DEFAULT_SPORTS_HOME_HIDDEN] as SportsShelfId[];
  return [
    ...new Set(value.filter((v): v is SportsShelfId => typeof v === "string" && known.has(v))),
  ];
}

export function moveSportsShelf(
  order: SportsShelfId[],
  id: SportsShelfId,
  by: -1 | 1,
): SportsShelfId[] {
  const from = order.indexOf(id),
    to = from + by;
  if (from < 0 || to < 0 || to >= order.length) return order;
  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
