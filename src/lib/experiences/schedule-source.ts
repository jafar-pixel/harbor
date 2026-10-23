import type { LeagueDef, SportsGame, SportsSide } from "../sports/espn.ts";
import type { EsportsFeed } from "../sports/esports-feeds.ts";

export type ExperienceSchedulePort = {
  hub: (key: string, signal: AbortSignal) => Promise<SportsGame[]>;
  esports: (game: "cs2" | "valorant", options: { signal: AbortSignal }) => Promise<EsportsFeed>;
};
export async function experienceLeagueGames(
  league: LeagueDef,
  day: string,
  signal: AbortSignal,
  port: ExperienceSchedulePort,
): Promise<SportsGame[]> {
  if (league.path !== "esports-feed") return port.hub(`${league.key}@${day}@day`, signal);
  if (league.key !== "CS2" && league.key !== "VALORANT") return [];
  const feed = await port.esports(league.key === "CS2" ? "cs2" : "valorant", { signal });
  if (feed.status === "unavailable") throw new Error("Esports schedule unavailable");
  const side = (team: EsportsFeed["matches"][number]["teams"][number]): SportsSide => ({
    id: team.id,
    name: team.name,
    abbr: team.code ?? team.name,
    logo: team.logo ?? "",
    score: team.score === undefined ? "" : String(team.score),
    winner: team.winner === true,
  });
  return feed.matches.map((match) => ({
    id: match.id,
    league: league.tag,
    state: match.state === "live" ? "in" : match.state === "recent" ? "post" : "pre",
    detail: match.event.stage ?? "",
    home: side(match.teams[1]),
    away: side(match.teams[0]),
    startMs: match.startMs,
    context: {
      id: match.event.id,
      name: match.event.name,
      round: match.event.stage ?? "",
      draw: "",
      venue: "",
      major: false,
    },
  }));
}
