import { championOf, scoreBracket, type EntrantKey, type Tournament, type Winners } from "./engine";

export type LeaderboardEntry = {
  userId: string;
  name: string;
  picks: Winners;
  /** Predicted total points in the final game. */
  tiebreaker: number | null;
};

export type LeaderboardRow = {
  userId: string;
  name: string;
  rank: number;
  points: number;
  correct: number;
  possible: number;
  champion: EntrantKey | null;
};

/**
 * A pool's standings, computed the same way on every member's device from the entries and the
 * real results. Ties: the tiebreaker closest to the final's real total (when it's known), then
 * more correct picks; rows still tied share a rank.
 */
export function leaderboard(
  t: Tournament,
  entries: LeaderboardEntry[],
  results: Winners,
  finalTotal: number | null = null,
): LeaderboardRow[] {
  const scored = entries.map((e) => {
    const s = scoreBracket(t, e.picks, results);
    const miss =
      finalTotal != null && e.tiebreaker != null ? Math.abs(e.tiebreaker - finalTotal) : Infinity;
    return { e, s, miss };
  });
  scored.sort(
    (a, b) =>
      b.s.points - a.s.points ||
      a.miss - b.miss ||
      b.s.correct - a.s.correct ||
      a.e.name.localeCompare(b.e.name),
  );
  const rows: LeaderboardRow[] = [];
  scored.forEach((x, i) => {
    const prev = scored[i - 1];
    const tied =
      prev &&
      prev.s.points === x.s.points &&
      prev.miss === x.miss &&
      prev.s.correct === x.s.correct;
    rows.push({
      userId: x.e.userId,
      name: x.e.name,
      rank: tied ? rows[i - 1].rank : i + 1,
      points: x.s.points,
      correct: x.s.correct,
      possible: x.s.possible,
      champion: championOf(t, x.e.picks),
    });
  });
  return rows;
}
