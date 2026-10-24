/** The first published note on a competition ("World Series - Game 3"), if any. */
export function noteHeadline(competition: Record<string, unknown>): string | undefined {
  const notes = Array.isArray(competition.notes)
    ? (competition.notes as Record<string, unknown>[])
    : [];
  const headline = notes.map((note) => String(note.headline ?? "").trim()).find(Boolean);
  return headline || undefined;
}
const POSTSEASON_LEAGUES = new Set(["NFL", "NCAAF", "NBA", "NCAA", "WNBA", "MLB", "NHL"]);
export function publishedPostseason(
  event: Record<string, unknown>,
  competition: Record<string, unknown>,
  league: string,
): boolean | undefined {
  if (!POSTSEASON_LEAGUES.has(league)) return undefined;
  const season =
    event.season && typeof event.season === "object"
      ? (event.season as Record<string, unknown>)
      : {};
  if (Number(season.type) === 3) return true;
  const notes = Array.isArray(competition.notes)
    ? (competition.notes as Record<string, unknown>[])
    : [];
  if (
    notes.some((note) =>
      /\b(playoffs?|postseason|bowl|championship|finals|world series)\b/i.test(
        String(note.headline ?? ""),
      ),
    )
  )
    return true;
  return Number(season.type) === 2 || Number(season.type) === 1 ? false : undefined;
}
