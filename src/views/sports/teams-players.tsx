import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Search, Users } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  fetchLeagueLeaders,
  fetchLeagueTeams,
  fetchStandings,
  findLeague,
} from "@/lib/jl/sports/espn-pages";
import type { LeaderCategory, LeagueTeam, StandingGroup } from "@/lib/jl/sports/espn-league";
import { fetchLegendStory, hallFor, type LegendStory } from "@/lib/jl/sports/hall-of-fame";
import { searchTeamsAndPlayers } from "@/lib/jl/sports/people";
import type { SportsSearchHit } from "@/lib/jl/sports/search-parse";
import { getLeagueLabel } from "@/lib/sports/espn";
import { useView } from "@/lib/view";
import { openUrl } from "@/lib/window";
import { LeagueLogo } from "./league-logo";
import { VISION_LEAGUES, VisionTeams } from "./vision-teams";

/** Team sports with full team lists, leaders and standings; the first five come from the JL team database. */
const LEAGUE_KEYS = ["NFL", "NCAAF", "NBA", "MLB", "NHL", "NCAAB", "MLS", "EPL", "LALIGA"];
const LEAGUE_KEY = "jl.sports.teams.league.v1";

function storedLeague(): string {
  try {
    const v = localStorage.getItem(LEAGUE_KEY);
    return v && LEAGUE_KEYS.includes(v) ? v : "NFL";
  } catch {
    return "NFL";
  }
}

/**
 * Teams & Players: where fans come to learn about their team. Pick a sport and every team is
 * there, from the JL team database where it covers the league (NFL, College Football, NBA, MLB,
 * NHL), each opening its team page. Then player search, top players, standings and the Hall of
 * Fame with its stories.
 */
export function TeamsAndPlayers({ active }: { active: boolean }) {
  const t = useT();
  const { openSportsPage } = useView();
  const [league, setLeague] = useState(storedLeague);
  const def = findLeague(league);
  const pick = (key: string) => {
    setLeague(key);
    try {
      localStorage.setItem(LEAGUE_KEY, key);
    } catch {
      /* storage unavailable */
    }
  };

  const [teams, setTeams] = useState<LeagueTeam[] | null>(null);
  const [leaders, setLeaders] = useState<LeaderCategory[]>([]);
  const [standings, setStandings] = useState<StandingGroup[]>([]);
  useEffect(() => {
    if (!active) return;
    let off = false;
    setTeams(null);
    setLeaders([]);
    setStandings([]);
    void fetchLeagueTeams(league).then((v) => !off && setTeams(v));
    void fetchLeagueLeaders(league).then((v) => !off && setLeaders(v));
    void fetchStandings(league).then((v) => !off && setStandings(v));
    return () => {
      off = true;
    };
  }, [league, active]);

  const [teamFilter, setTeamFilter] = useState("");
  const shownTeams = useMemo(() => {
    const q = teamFilter.trim().toLowerCase();
    return (teams ?? []).filter(
      (x) => !q || x.name.toLowerCase().includes(q) || x.abbr.toLowerCase() === q,
    );
  }, [teams, teamFilter]);

  return (
    <section className="flex flex-col gap-8" aria-label={t("Teams & Players")}>
      <div className="hot-filters">
        <div
          role="group"
          aria-label={t("Sport")}
          className="harbor-scroll flex min-w-0 !flex-nowrap flex-1 gap-2 overflow-x-auto pb-1"
        >
          {LEAGUE_KEYS.map((key) => {
            const l = findLeague(key);
            if (!l) return null;
            return (
              <button
                key={key}
                className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap"
                aria-pressed={league === key}
                onClick={() => pick(key)}
              >
                <LeagueLogo league={l} size={20} /> {getLeagueLabel(l)}
              </button>
            );
          })}
        </div>
      </div>

      {VISION_LEAGUES[league] ? (
        <VisionTeams leagueKey={league} label={def ? getLeagueLabel(def) : league} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-[22px] font-semibold text-ink">
              {def ? t("{league} teams", { league: getLeagueLabel(def) }) : t("Teams")}
            </h2>
            {(teams?.length ?? 0) > 24 && (
              <input
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                placeholder={t("Filter teams")}
                aria-label={t("Filter teams")}
                className="h-10 w-full max-w-[280px] rounded-full border border-edge-soft bg-elevated/40 px-4 text-[14px] text-ink outline-none placeholder:text-ink-subtle focus:border-edge"
              />
            )}
          </div>
          {teams === null ? (
            <p className="text-[14px] text-ink-muted">{t("Loading teams…")}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {shownTeams.slice(0, 200).map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() =>
                    openSportsPage({ kind: "team", league, teamId: team.id, name: team.name })
                  }
                  className="flex aspect-[3/4] flex-col items-center justify-between gap-2 rounded-2xl border border-edge-soft bg-elevated/70 p-4 text-center transition-colors hover:border-edge hover:bg-elevated"
                >
                  <span className="flex flex-1 items-center justify-center">
                    {team.logo ? (
                      <img
                        src={team.logo}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="max-h-[90px] max-w-[90px] object-contain"
                      />
                    ) : (
                      <Users size={40} className="text-ink-subtle" />
                    )}
                  </span>
                  <span className="line-clamp-2 text-[13.5px] font-semibold text-ink">
                    {team.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <PlayerSearch
        onOpen={(hit) =>
          openSportsPage(
            hit.kind === "team"
              ? { kind: "team", league: hit.league, teamId: hit.id, name: hit.name }
              : { kind: "athlete", league: hit.league, athleteId: hit.id, name: hit.name },
          )
        }
      />

      <TopPlayers
        leaders={leaders}
        onOpen={(athleteId, name) => openSportsPage({ kind: "athlete", league, athleteId, name })}
      />

      {standings.length > 0 && <Standings groups={standings} />}

      {def && <HallOfFame leagueKey={def.key} group={def.group} />}
    </section>
  );
}

function PlayerSearch({ onOpen }: { onOpen: (hit: SportsSearchHit) => void }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SportsSearchHit[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    const id = window.setTimeout(() => {
      void searchTeamsAndPlayers(q, ac.signal)
        .then(setHits)
        .catch(() => {});
    }, 300);
    return () => {
      window.clearTimeout(id);
      ac.abort();
    };
  }, [q]);
  return (
    <div className="relative max-w-[640px]">
      <Search size={17} className="absolute start-4 top-[22px] -translate-y-1/2 text-ink-subtle" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("Search any team or player")}
        aria-label={t("Search any team or player")}
        className="h-11 w-full rounded-full border border-edge-soft bg-elevated/40 ps-11 pe-4 text-[14.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-edge"
      />
      {hits.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 rounded-2xl border border-edge-soft bg-elevated p-2">
          {hits.slice(0, 10).map((h) => (
            <li key={`${h.kind}:${h.league}:${h.id}`}>
              <button
                type="button"
                onClick={() => onOpen(h)}
                className="flex w-full items-center gap-3 rounded-xl p-2 text-start transition-colors hover:bg-raised"
              >
                {h.image ? (
                  <img
                    src={h.image}
                    alt=""
                    className="h-10 w-10 rounded-full bg-canvas object-cover"
                  />
                ) : (
                  <span className="h-10 w-10 rounded-full bg-canvas" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-ink">
                    {h.name}
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-muted">
                    {h.kind === "team" ? t("Team") : t("Player")} · {h.subtitle}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The top player in each stat category, as a hero slider. */
function TopPlayers({
  leaders,
  onOpen,
}: {
  leaders: LeaderCategory[];
  onOpen: (athleteId: string, name: string) => void;
}) {
  const t = useT();
  const slides = leaders
    .map((c) => ({ category: c.label, leader: c.leaders[0] }))
    .filter((s) => s.leader?.name);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => setI(0), [leaders]);
  useEffect(() => {
    if (paused || slides.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % slides.length), 7000);
    return () => window.clearInterval(id);
  }, [paused, slides.length]);
  if (!slides.length) return null;
  const s = slides[Math.min(i, slides.length - 1)];
  const go = (d: number) => setI((n) => (n + d + slides.length) % slides.length);
  return (
    <div
      className="relative flex min-h-[300px] items-end overflow-hidden rounded-3xl border border-edge-soft bg-gradient-to-br from-elevated via-canvas to-elevated p-8"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {s.leader.headshot && (
        <img
          key={s.leader.headshot}
          src={s.leader.headshot}
          alt=""
          className="animate-fade-in absolute bottom-0 end-8 h-[105%] max-w-[50%] object-contain object-bottom drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
        />
      )}
      <div className="relative z-10 flex max-w-[55%] flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          {t("Top players")} · {s.category}
        </span>
        <h2 className="font-display text-[44px] font-semibold leading-[1.05] text-ink">
          {s.leader.name}
        </h2>
        <p className="text-[16px] text-ink-muted">
          {[s.leader.team, s.leader.value].filter(Boolean).join(" · ")}
        </p>
        {s.leader.athleteId && (
          <button
            type="button"
            onClick={() => onOpen(s.leader.athleteId!, s.leader.name ?? "")}
            className="jl-cta mt-2 w-fit rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-black"
          >
            {t("View player")}
          </button>
        )}
      </div>
      {slides.length > 1 && (
        <div className="absolute bottom-5 end-6 z-10 flex items-center gap-2">
          <button
            type="button"
            aria-label={t("Previous")}
            onClick={() => go(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[12.5px] tabular-nums text-ink-muted">
            {i + 1} / {slides.length}
          </span>
          <button
            type="button"
            aria-label={t("Next")}
            onClick={() => go(1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function Standings({ groups }: { groups: StandingGroup[] }) {
  const t = useT();
  const cols = ["wins", "losses", "ties", "winPercent", "pointDifferential", "streak"];
  const labels: Record<string, string> = {
    wins: "W",
    losses: "L",
    ties: "T",
    winPercent: "PCT",
    pointDifferential: "DIFF",
    streak: "STRK",
  };
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[22px] font-semibold text-ink">{t("Standings")}</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.slice(0, 8).map((g) => {
          const shown = cols.filter((c) => g.rows.some((r) => r.values[c] != null));
          return (
            <div
              key={g.name}
              className="overflow-x-auto rounded-2xl border border-edge-soft bg-elevated/70 p-4"
            >
              <h3 className="mb-2 text-[14px] font-semibold text-ink">{g.name}</h3>
              <table className="w-full text-[13px] tabular-nums">
                <thead>
                  <tr className="text-ink-subtle">
                    <th className="py-1 text-start font-medium">{t("Team")}</th>
                    {shown.map((c) => (
                      <th key={c} className="px-2 py-1 text-end font-medium">
                        {labels[c]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={`${r.id}:${r.name}`} className="border-t border-edge-soft/60 text-ink">
                      <td className="flex items-center gap-2 py-1.5">
                        {r.logo && <img src={r.logo} alt="" className="h-5 w-5 object-contain" />}
                        <span className="truncate">{r.name}</span>
                      </td>
                      {shown.map((c) => (
                        <td key={c} className="px-2 py-1.5 text-end">
                          {r.values[c] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HallOfFame({ leagueKey, group }: { leagueKey: string; group: string }) {
  const t = useT();
  const hall = hallFor(leagueKey, group);
  const [stories, setStories] = useState<LegendStory[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!hall) return;
    let off = false;
    setStories([]);
    void Promise.all(hall.legends.map(fetchLegendStory)).then((list) => {
      if (!off) setStories(list.filter((s): s is LegendStory => !!s));
    });
    return () => {
      off = true;
    };
  }, [hall]);
  if (!hall || !stories.length) return null;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-[22px] font-semibold text-ink">{t("Hall of Fame & stories")}</h2>
        <p className="text-[13.5px] text-ink-muted">
          {hall.hall} · {t("Stories from Wikipedia")}
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {stories.map((s) => {
          const expanded = open === s.title;
          return (
            <article
              key={s.title}
              className="flex flex-col overflow-hidden rounded-2xl border border-edge-soft bg-elevated"
            >
              {s.image && (
                <img
                  src={s.image}
                  alt=""
                  loading="lazy"
                  className="h-[220px] w-full object-cover object-top"
                />
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-[17px] font-semibold text-ink">{s.name}</h3>
                {s.description && <p className="text-[12.5px] text-ink-subtle">{s.description}</p>}
                <p
                  className={`text-[14px] leading-relaxed text-ink ${expanded ? "" : "line-clamp-4"}`}
                >
                  {s.extract}
                </p>
                <div className="mt-auto flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : s.title)}
                    className="text-[13px] font-semibold text-accent"
                  >
                    {expanded ? t("Show less") : t("Read story")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openUrl(s.url)}
                    className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
                  >
                    {t("Wikipedia")} <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
