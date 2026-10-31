import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Copy, Lock, Trash2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  cleanPicks,
  participants,
  regionOf,
  roundOf,
  type EntrantKey,
  type Tournament,
  type Winners,
} from "@/lib/sports/brackets/engine";
import {
  isPoolOpen,
  leaveOrDeletePool,
  savePicks,
  updatePool,
  type BracketPool,
  type FieldTeam,
} from "@/lib/sports/brackets/pools";
import { BRACKET_LEAGUE, fieldFromStandings } from "@/lib/sports/brackets/results";
import { fetchStandings } from "@/lib/sports/standings";
import { fetchLeagueTeams } from "@/lib/jl/sports/espn-pages";
import type { LeagueTeam } from "@/lib/jl/sports/espn-league";
import { BRACKET_TITLES } from "./bracket-meta";
import { autoFill, pickShares, type AutoFillStrategy } from "@/lib/sports/brackets/simulate";
import { findStandingsRow } from "@/lib/sports/standings";
import { BRACKET_FETCH_KEY, useBracketPool } from "./use-bracket-pool";

type Tab = "picks" | "leaderboard" | "insights" | "rules" | "setup";

export function BracketPoolView({
  poolId,
  userId,
  active,
  onBack,
}: {
  poolId: string;
  userId: string;
  active: boolean;
  onBack: () => void;
}) {
  const t = useT();
  const { pool, entries, tournament, results, standings, error, loading, reload, setPool } =
    useBracketPool(poolId, active);
  const [tab, setTab] = useState<Tab>("picks");
  const [viewing, setViewing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (loading) return <p className="br-muted br-pad">{t("Loading bracket…")}</p>;
  if (!pool || !tournament) {
    return (
      <section className="br-home">
        <button className="br-btn" onClick={onBack}>
          <ArrowLeft size={16} /> {t("Brackets")}
        </button>
        <p className="br-error">{error ?? t("This pool couldn't be loaded.")}</p>
      </section>
    );
  }

  const owner = pool.owner === userId;
  const open = isPoolOpen(pool);
  const mine = entries.find((e) => e.user_id === userId);
  const other = viewing ? entries.find((e) => e.user_id === viewing) : undefined;

  const copyCode = () => {
    void navigator.clipboard
      ?.writeText(pool.join_code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  const remove = async () => {
    const question = owner
      ? t("Delete this pool for everyone in it?")
      : t("Leave this pool? Your picks will be removed.");
    if (!window.confirm(question)) return;
    try {
      await leaveOrDeletePool(pool);
      onBack();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="br-home">
      <header className="br-head">
        <div>
          <button className="br-link" onClick={onBack}>
            <ArrowLeft size={14} /> {t("Brackets")}
          </button>
          <h2>{pool.name}</h2>
          <p>
            {t(BRACKET_TITLES[pool.kind])} · {pool.season} · {entries.length}{" "}
            {entries.length === 1 ? t("player") : t("players")}
            {pool.locks_at && (
              <>
                {" · "}
                {open ? t("Picks lock") : t("Picks locked")}{" "}
                {new Date(pool.locks_at).toLocaleString()}
              </>
            )}
          </p>
        </div>
        <div className="br-actions">
          <button className="br-btn br-code" onClick={copyCode} title={t("Copy pool code")}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {pool.join_code}
          </button>
          <button
            className="br-btn br-btn-danger"
            onClick={() => void remove()}
            title={owner ? t("Delete pool") : t("Leave pool")}
          >
            <Trash2 size={16} /> {owner ? t("Delete") : t("Leave")}
          </button>
        </div>
      </header>

      <nav className="br-tabs">
        {(
          [
            ["picks", "My picks"],
            ["leaderboard", "Leaderboard"],
            // How the pool picked stays hidden until picks lock, so nobody copies.
            ...(open ? [] : [["insights", "Insights"]]),
            ["rules", "Rules"],
            ...(owner ? [["setup", "Teams & lock"]] : []),
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setViewing(null);
            }}
          >
            {t(label)}
          </button>
        ))}
      </nav>

      {tab === "picks" && mine && (
        <MyPicks
          key={mine.updated_at}
          pool={pool}
          tournament={tournament}
          results={results}
          initial={mine.picks}
          initialTiebreaker={mine.tiebreaker}
          open={open}
          onSaved={() => void reload()}
        />
      )}
      {tab === "picks" && !mine && <p className="br-muted">{t("You're not in this pool.")}</p>}

      {tab === "leaderboard" && !other && (
        <table className="br-board">
          <thead>
            <tr>
              <th>#</th>
              <th>{t("Player")}</th>
              <th>{t("Points")}</th>
              <th>{t("Correct")}</th>
              <th>{t("Max possible")}</th>
              <th>{t("Champion")}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr key={row.userId} className={row.userId === userId ? "br-me" : undefined}>
                <td>{row.rank}</td>
                <td>
                  <button className="br-link" onClick={() => setViewing(row.userId)}>
                    {row.name}
                  </button>
                </td>
                <td>{row.points}</td>
                <td>{row.correct}</td>
                <td>{row.possible}</td>
                <td>
                  {row.champion ? (
                    <TeamChip team={pool.field[row.champion]} entrant={row.champion} />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === "leaderboard" && other && (
        <>
          <button className="br-link" onClick={() => setViewing(null)}>
            <ArrowLeft size={14} /> {t("Leaderboard")}
          </button>
          <h3 className="br-sub">{other.display_name}</h3>
          <BracketGrid
            tournament={tournament}
            field={pool.field}
            picks={other.picks}
            results={results}
          />
        </>
      )}

      {tab === "insights" && !open && (
        <PoolInsights
          tournament={tournament}
          field={pool.field}
          entries={entries.map((e) => e.picks)}
        />
      )}
      {tab === "rules" && <PoolRules pool={pool} tournament={tournament} />}

      {tab === "setup" && owner && (
        <PoolSetup
          pool={pool}
          tournament={tournament}
          onSaved={(patch) => setPool({ ...pool, ...patch })}
        />
      )}
    </section>
  );
}

function MyPicks({
  pool,
  tournament,
  results,
  initial,
  initialTiebreaker,
  open,
  onSaved,
}: {
  pool: BracketPool;
  tournament: Tournament;
  results: Winners;
  initial: Winners;
  initialTiebreaker: number | null;
  open: boolean;
  onSaved: () => void;
}) {
  const t = useT();
  const [picks, setPicks] = useState<Winners>(() => cleanPicks(tournament, initial));
  const [tiebreaker, setTiebreaker] = useState(initialTiebreaker?.toString() ?? "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const total = tournament.matchups.length;
  const made = Object.keys(picks).length;

  const pick = (matchupId: string, entrant: EntrantKey) => {
    setPicks((prev) => cleanPicks(tournament, { ...prev, [matchupId]: entrant }));
    setDirty(true);
    setMessage(null);
  };

  // Fills the games still open: by seed, by season record, or with a few upsets.
  const fill = async (strategy: AutoFillStrategy) => {
    setMessage(null);
    let ratings: Record<EntrantKey, number> | undefined;
    if (strategy === "stats") {
      const league = BRACKET_LEAGUE[pool.kind];
      const season = pool.kind === "nfl" ? pool.season - 1 : pool.season;
      const table = await fetchStandings(league, season).catch(() => null);
      ratings = {};
      for (const [entrant, team] of Object.entries(pool.field)) {
        const row = findStandingsRow(table, team.teamId)?.row;
        const games = (row?.wins ?? 0) + (row?.losses ?? 0) + (row?.draws ?? 0);
        if (row && games > 0) ratings[entrant] = (row.wins ?? 0) / games;
      }
      if (!Object.keys(ratings).length)
        setMessage(t("Season records aren't available; seeds decided instead."));
    }
    setPicks((prev) => autoFill(tournament, prev, strategy, { ratings }));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const n = Number.parseInt(tiebreaker, 10);
      await savePicks(pool.id, picks, Number.isFinite(n) ? Math.min(500, Math.max(0, n)) : null);
      setDirty(false);
      setMessage(t("Saved to your account."));
      onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <p className="br-muted">
          <Lock size={14} /> {t("Picks are locked. Results fill in as games finish.")}
        </p>
      )}
      <BracketGrid
        tournament={tournament}
        field={pool.field}
        picks={picks}
        results={results}
        onPick={open ? pick : undefined}
      />
      {open && made < total && (
        <div className="br-save">
          <span className="br-muted">{t("Auto-fill the rest")}</span>
          <button className="br-btn" onClick={() => void fill("favorites")}>
            {t("Favorites")}
          </button>
          <button className="br-btn" onClick={() => void fill("stats")}>
            {t("By season record")}
          </button>
          <button className="br-btn" onClick={() => void fill("upsets")}>
            {t("With upsets")}
          </button>
        </div>
      )}
      {open && (
        <div className="br-save">
          <span className="br-muted">
            {made}/{total} {t("picks")}
          </span>
          <label>
            <span>{t("Tiebreaker: total points in the final")}</span>
            <input
              type="number"
              min={0}
              max={500}
              value={tiebreaker}
              onChange={(e) => {
                setTiebreaker(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <button
            className="br-btn br-btn-primary"
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            {busy ? t("Saving…") : t("Save picks")}
          </button>
          {message && <span className="br-muted">{message}</span>}
        </div>
      )}
    </>
  );
}

function entrantLabel(key: EntrantKey): string {
  return key.replace(":", " #");
}

function TeamChip({ team, entrant }: { team?: FieldTeam; entrant: EntrantKey }) {
  return (
    <span className="br-team">
      {team?.logo ? (
        <img src={team.logo} alt="" loading="lazy" />
      ) : (
        <span className="br-team-dot" />
      )}
      <span>{team ? team.abbr || team.name : entrantLabel(entrant)}</span>
    </span>
  );
}

/** Every round as a column of matchups; picks resolve who plays in the later rounds. */
function BracketGrid({
  tournament,
  field,
  picks,
  results,
  onPick,
}: {
  tournament: Tournament;
  field: Record<EntrantKey, FieldTeam>;
  picks: Winners;
  results: Winners;
  onPick?: (matchupId: string, entrant: EntrantKey) => void;
}) {
  const t = useT();
  const rounds = useMemo(() => {
    const byRound = new Map<number, typeof tournament.matchups>();
    for (const m of tournament.matchups) {
      const list = byRound.get(m.round) ?? [];
      list.push(m);
      byRound.set(m.round, list);
    }
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  }, [tournament]);

  return (
    <div className="br-grid">
      {rounds.map(([round, matchups]) => {
        const info = roundOf(tournament, matchups[0]);
        return (
          <div key={round} className="br-round">
            <h4>
              {t(info.name)}
              {info.points > 0 && <small> · {info.points} pts</small>}
            </h4>
            {matchups.map((m, i) => {
              const [a, b] = participants(tournament, m.id, picks);
              const actual = results[m.id];
              const showRegion = m.region && matchups[i - 1]?.region !== m.region;
              return (
                <div key={m.id} className="br-matchup-wrap">
                  {showRegion && <span className="br-region">{m.region}</span>}
                  <div className="br-matchup">
                    {[a, b].map((entrant, slot) => {
                      if (!entrant) {
                        return (
                          <span key={slot} className="br-slot br-slot-empty">
                            {t("TBD")}
                          </span>
                        );
                      }
                      const picked = picks[m.id] === entrant;
                      const state = actual ? (actual === entrant ? "won" : "lost") : undefined;
                      return (
                        <button
                          key={slot}
                          className="br-slot"
                          aria-pressed={picked}
                          data-result={
                            picked && actual ? (actual === entrant ? "hit" : "miss") : state
                          }
                          disabled={!onPick}
                          onClick={() => onPick?.(m.id, entrant)}
                        >
                          <TeamChip team={field[entrant]} entrant={entrant} />
                          <span className="br-seed">{entrant.split(":")[1]}</span>
                          {picked &&
                            actual &&
                            (actual === entrant ? <Check size={14} /> : <X size={14} />)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/** Owner only: which team holds each seed, and when picks lock. */
function PoolSetup({
  pool,
  tournament,
  onSaved,
}: {
  pool: BracketPool;
  tournament: Tournament;
  onSaved: (patch: Partial<BracketPool>) => void;
}) {
  const t = useT();
  const [field, setField] = useState(pool.field);
  const [locksAt, setLocksAt] = useState(() => toLocalInput(pool.locks_at));
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const league = BRACKET_LEAGUE[pool.kind];
  const fromStandings = ["nfl", "nba", "mlb"].includes(pool.kind);

  useEffect(() => {
    let live = true;
    void fetchLeagueTeams(BRACKET_FETCH_KEY[pool.kind])
      .then((list) => {
        if (live) setTeams([...list].sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pool.kind]);

  const assign = (entrant: EntrantKey, teamId: string) => {
    setField((prev) => {
      const next = { ...prev };
      if (teamId && teamId === prev[entrant]?.teamId) return prev;
      const team = teams.find((x) => x.id === teamId);
      if (!team) delete next[entrant];
      else
        next[entrant] = {
          teamId: team.id,
          league,
          name: team.name,
          abbr: team.abbr,
          logo: team.logo ?? "",
        };
      return next;
    });
  };

  const fill = async () => {
    setMessage(null);
    // ESPN names an NFL season by the year it starts; a pool's season is the Super Bowl's year.
    const season = pool.kind === "nfl" ? pool.season - 1 : pool.season;
    const table = await fetchStandings(league, season).catch(() => null);
    if (!table) {
      setMessage(t("Standings aren't available yet."));
      return;
    }
    const seeded = fieldFromStandings(tournament, table, league);
    setField((prev) => ({ ...prev, ...seeded }));
    setMessage(
      `${Object.keys(seeded).length} ${t("seeds filled from standings. Check them, then save.")}`,
    );
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const locks = locksAt ? new Date(locksAt).toISOString() : null;
    try {
      await updatePool(pool.id, { field, locks_at: locks });
      onSaved({ field, locks_at: locks });
      setMessage(t("Saved."));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="br-setup">
      <div className="br-setup-bar">
        <label>
          <span>{t("Picks lock at")}</span>
          <input
            type="datetime-local"
            value={locksAt}
            onChange={(e) => setLocksAt(e.target.value)}
          />
        </label>
        {fromStandings && (
          <button className="br-btn" onClick={() => void fill()}>
            {t("Fill from standings")}
          </button>
        )}
        <button className="br-btn br-btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? t("Saving…") : t("Save")}
        </button>
        {message && <span className="br-muted">{message}</span>}
      </div>
      {tournament.regions.map((region) => (
        <fieldset key={region} className="br-field">
          <legend>{region}</legend>
          {tournament.entrants
            .filter((k) => regionOf(k) === region)
            .map((entrant) => (
              <label key={entrant}>
                <span>{entrantLabel(entrant)}</span>
                <select
                  value={field[entrant]?.teamId ?? ""}
                  onChange={(e) => assign(entrant, e.target.value)}
                >
                  <option value="">{t("Not set")}</option>
                  {field[entrant] && !teams.some((x) => x.id === field[entrant].teamId) && (
                    <option value={field[entrant].teamId}>{field[entrant].name}</option>
                  )}
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
        </fieldset>
      ))}
    </div>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** How the pool picked each game, once picks are locked. */
function PoolInsights({
  tournament,
  field,
  entries,
}: {
  tournament: Tournament;
  field: Record<EntrantKey, FieldTeam>;
  entries: Winners[];
}) {
  const t = useT();
  const shares = useMemo(() => pickShares(tournament, entries), [tournament, entries]);
  const rounds = [...new Set(tournament.matchups.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <div className="flex flex-col gap-6">
      <p className="br-muted">
        {t("How everyone in the pool picked each game. Upset picks stand out in the bars.")}
      </p>
      {rounds.map((round) => {
        const games = tournament.matchups.filter((m) => m.round === round && shares[m.id]);
        if (!games.length) return null;
        return (
          <div key={round} className="flex flex-col gap-2">
            <h3 className="br-sub">{roundOf(tournament, games[0])?.name ?? ""}</h3>
            {games.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-1 rounded-xl border border-edge-soft p-3"
              >
                {Object.entries(shares[m.id])
                  .sort((a, b) => b[1] - a[1])
                  .map(([entrant, share]) => (
                    <div key={entrant} className="flex items-center gap-3">
                      <span className="w-[140px] shrink-0">
                        <TeamChip team={field[entrant]} entrant={entrant} />
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${Math.round(share * 100)}%` }}
                        />
                      </span>
                      <span className="w-10 text-end text-[12.5px] tabular-nums">
                        {Math.round(share * 100)}%
                      </span>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Scoring, tiebreaker and lock for this pool. */
function PoolRules({ pool, tournament }: { pool: BracketPool; tournament: Tournament }) {
  const t = useT();
  return (
    <div className="flex max-w-[640px] flex-col gap-4">
      <h3 className="br-sub">{t("Scoring")}</h3>
      <table className="br-board">
        <thead>
          <tr>
            <th>{t("Round")}</th>
            <th>{t("Points per correct pick")}</th>
          </tr>
        </thead>
        <tbody>
          {tournament.rounds.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex list-disc flex-col gap-2 ps-5 text-[14px] text-ink-muted">
        <li>
          {t(
            "Pick a winner for every game. Changing an early pick clears the picks that depended on it.",
          )}
        </li>
        <li>
          {t("Ties on points are broken by the closest guess at the total points in the final.")}
        </li>
        <li>
          {pool.locks_at
            ? t("Picks lock at {time}. After that nobody can change them.", {
                time: new Date(pool.locks_at).toLocaleString(),
              })
            : t("Picks lock when the pool owner sets a lock time.")}
        </li>
        <li>
          {t("Results fill in from real games as they finish, and the leaderboard updates itself.")}
        </li>
        <li>{t("Insights show how the pool picked each game once picks are locked.")}</li>
      </ul>
    </div>
  );
}
