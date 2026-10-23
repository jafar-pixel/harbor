import type { SportsGame } from "./espn-types";
import { gameKey } from "./hub-cache";

/** Keep discovery varied: a daily baseball schedule must not bury a race or fight night. */
export function diverseEvents(games: SportsGame[], limit = 18): SportsGame[] {
  const first = new Map<string, SportsGame>();
  for (const game of games) if (!first.has(game.league)) first.set(game.league, game);
  const seen = new Set<string>();
  return [...first.values(), ...games]
    .filter((game) => {
      const key = gameKey(game);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/** College football slides appear on the fixture's local game day, including bowls and CFP. */
export function isCollegeGameDay(game: SportsGame, now = new Date()): boolean {
  return (
    game.league !== "NCAAF" ||
    game.state === "in" ||
    new Date(game.startMs).toDateString() === now.toDateString()
  );
}

/** Favorites lead; discovery follows the viewer's sports order, without a forced fight slide. */
export function featuredEvents(
  live: SportsGame[],
  upcoming: SportsGame[],
  follows: (game: SportsGame) => boolean = () => false,
  priority: readonly string[] = ["NCAAF", "NFL", "NBA", "NCAAB", "MLB", "NHL"],
  now = new Date(),
): SportsGame[] {
  const order = (game: SportsGame) => {
    const at = priority.indexOf(game.league === "NCAA" ? "NCAAB" : game.league);
    return at < 0 ? priority.length : at;
  };
  const seen = new Set<string>();
  const ranked = [...live, ...upcoming]
    .filter((game) => game.state !== "post")
    .filter((game) => isCollegeGameDay(game, now))
    .sort(
      (a, b) =>
        Number(follows(b)) - Number(follows(a)) ||
        order(a) - order(b) ||
        Number(b.state === "in") - Number(a.state === "in") ||
        a.startMs - b.startMs,
    )
    .filter((game) => {
      const key = game.context?.id ? `${game.league}:${game.context.id}` : gameKey(game);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return [
    ...ranked.filter(follows),
    ...diverseEvents(
      ranked.filter((game) => !follows(game)),
      8,
    ),
  ].slice(0, 8);
}
