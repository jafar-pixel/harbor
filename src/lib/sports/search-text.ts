/** Fold accents and Arabic vowel marks without changing the displayed name. */
export function normalizeSportsSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\u0640/g, "")
    .replace(/\u0649/g, "\u064a")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Words that describe a team's sport or level rather than its name ("Gallaudet Football"). */
function contextWords(team: { leagueKey?: string; group?: string }): Set<string> {
  const words = new Set(["team", "the", "of"]);
  if (team.group) words.add(normalizeSportsSearch(team.group));
  if (team.leagueKey) {
    const key = normalizeSportsSearch(team.leagueKey);
    words.add(key);
    if (key.startsWith("ncaa")) for (const w of ["ncaa", "college", "university"]) words.add(w);
  }
  return words;
}

/**
 * Every word of the query must appear in the team's name, short name, abbreviation or an alias,
 * except words naming its sport or level, so "gallaudet football" finds "Gallaudet Bison".
 */
export function matchesTeamSearch(
  team: {
    name: string;
    shortName?: string;
    abbr: string;
    aliases?: string[];
    leagueKey?: string;
    group?: string;
  },
  query: string,
): boolean {
  const needle = normalizeSportsSearch(query);
  const values = [team.name, team.shortName, team.abbr, ...(team.aliases ?? [])].map((value) =>
    normalizeSportsSearch(value ?? ""),
  );
  if (values.some((value) => value.includes(needle))) return true;
  const context = contextWords(team);
  const named = needle.split(" ").filter((word) => !context.has(word));
  return named.length > 0 && named.every((word) => values.some((value) => value.includes(word)));
}
