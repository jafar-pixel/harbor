import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchSports, type SportsGame } from "@/lib/sports/espn";
import {
  buildTournament,
  DEFAULT_MARCH_MADNESS,
  type TournamentKind,
} from "@/lib/sports/brackets/engine";
import { leaderboard } from "@/lib/sports/brackets/leaderboard";
import {
  getPool,
  listEntries,
  type BracketEntry,
  type BracketPool,
} from "@/lib/sports/brackets/pools";
import { finalTotal, postseasonQuery, resultsFromGames } from "@/lib/sports/brackets/results";

/** The scoreboard key each format is fetched under (March Madness men's is listed as NCAAB). */
export const BRACKET_FETCH_KEY: Record<TournamentKind, string> = {
  cfp: "NCAAF",
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  ncaam: "NCAAB",
  ncaaw: "NCAAW",
};

const RESULTS_POLL_MS = 5 * 60_000;

/** One pool with its entries, the real results so far and the standings they produce. */
export function useBracketPool(poolId: string, active: boolean) {
  const [pool, setPool] = useState<BracketPool | null>(null);
  const [entries, setEntries] = useState<BracketEntry[]>([]);
  const [games, setGames] = useState<SportsGame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([getPool(poolId), listEntries(poolId)]);
      setPool(p);
      setEntries(e);
      setError(p ? null : "This pool no longer exists, or you're not in it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [poolId]);

  useEffect(() => {
    setLoading(true);
    void reload();
  }, [reload]);

  const kind = pool?.kind;
  const season = pool?.season;
  useEffect(() => {
    if (!active || !kind || !season) return;
    let live = true;
    const load = () =>
      void fetchSports([BRACKET_FETCH_KEY[kind]], postseasonQuery(kind, season))
        .then((next) => {
          if (live) setGames(next);
        })
        .catch(() => {});
    load();
    const timer = window.setInterval(load, RESULTS_POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [active, kind, season]);

  const tournament = useMemo(
    () => (pool ? buildTournament(pool.kind, { ...DEFAULT_MARCH_MADNESS, ...pool.options }) : null),
    [pool],
  );
  const results = useMemo(
    () => (tournament && pool ? resultsFromGames(tournament, pool.field, games) : {}),
    [tournament, pool, games],
  );
  const standings = useMemo(() => {
    if (!tournament || !pool) return [];
    const total = finalTotal(tournament, pool.field, games, results);
    return leaderboard(
      tournament,
      entries.map((e) => ({
        userId: e.user_id,
        name: e.display_name,
        picks: e.picks,
        tiebreaker: e.tiebreaker,
      })),
      results,
      total,
    );
  }, [tournament, pool, entries, games, results]);

  return { pool, entries, tournament, results, standings, error, loading, reload, setPool };
}
