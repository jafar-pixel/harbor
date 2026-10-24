import type { SportsGame, SportsSide } from "../sports/espn-types.ts";
import type { PlayInvite } from "./protocol.ts";

/**
 * A Watch Party is a Watch Together room for a live game. A channel can't be shared (it is the
 * host's own provider), so the invite carries the game itself and each guest opens it in their
 * own app: their own channel for it, or its live match centre. The relay forwards invites as-is.
 */

/** The game as an invite carries it: enough to open its match centre, which loads the rest. */
export type WatchPartyGame = Pick<
  SportsGame,
  "id" | "league" | "state" | "detail" | "startMs" | "source" | "headline" | "network"
> & {
  home: Pick<SportsSide, "id" | "name" | "abbr" | "logo" | "score" | "winner">;
  away: Pick<SportsSide, "id" | "name" | "abbr" | "logo" | "score" | "winner">;
};

const GAME_PREFIX = "game:";

const sideOf = (s: SportsSide) => ({
  id: s.id,
  name: s.name.slice(0, 120),
  abbr: s.abbr.slice(0, 12),
  logo: s.logo.startsWith("https://") && s.logo.length <= 500 ? s.logo : "",
  score: s.score,
  winner: s.winner,
});

export function watchPartyTitle(game: Pick<SportsGame, "home" | "away">): string {
  return `${game.away.name} at ${game.home.name}`;
}

export function buildWatchPartyInvite(game: SportsGame): PlayInvite {
  const snapshot: WatchPartyGame = {
    id: game.id,
    league: game.league,
    state: game.state,
    detail: game.detail,
    startMs: game.startMs,
    source: game.source,
    headline: game.headline,
    network: game.network,
    home: sideOf(game.home),
    away: sideOf(game.away),
  };
  return {
    // Unique per game, so a guest's "already invited" check and media key stay per game.
    mediaId: `${GAME_PREFIX}${game.league}:${game.id}`,
    mediaType: "movie",
    mediaTitle: watchPartyTitle(game).slice(0, 300),
    posterUrl: snapshot.home.logo || snapshot.away.logo || undefined,
    game: snapshot,
  };
}

/** The game a Watch Party invite is for, or null for a movie or show invite. */
export function watchPartyGame(invite: PlayInvite): SportsGame | null {
  const g = invite.game;
  if (!g || !invite.mediaId.startsWith(GAME_PREFIX)) return null;
  if (typeof g.id !== "string" || typeof g.league !== "string" || !g.home || !g.away) return null;
  return {
    ...g,
    home: { ...g.home },
    away: { ...g.away },
  };
}
