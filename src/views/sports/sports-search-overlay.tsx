import { useEffect, useMemo, useRef, useState } from "react";
import { Radio, Search, Trophy, Tv, Users, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { readActiveId } from "@/lib/iptv/active-source";
import { getCachedPlaylist } from "@/lib/iptv/store";
import type { IptvChannel } from "@/lib/iptv/types";
import { searchTeamsAndPlayers } from "@/lib/jl/sports/people";
import type { SportsSearchHit } from "@/lib/jl/sports/search-parse";
import { isSportsChannel } from "@/lib/jl/sports/sports-channels";
import { agentEdit } from "@/lib/sports/agent/store";
import { getLeagueLabel } from "@/lib/sports/espn";
import { hubLeague } from "@/lib/sports/hub-data";
import type { SportsGame } from "@/lib/sports/espn-types";
import { searchChannels, searchGames } from "@/lib/sports/sports-search";
import {
  hubGames,
  setSportsSearchOpen,
  useSportsSearchOpen,
} from "@/lib/sports/sports-search-store";
import { useView } from "@/lib/view";
import { tuneSportsTv } from "./sports-tv-tuner";

const ROW =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start outline-none hover:bg-white/10 focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent";

/**
 * The Sports Hub's own search (the top bar's search while in Sports): games, sports channels,
 * teams and players, never movies or shows. Games and channels answer as you type from what is
 * loaded; teams and players come from ESPN a moment later.
 */
export function SportsSearchOverlay() {
  const open = useSportsSearchOpen();
  if (!open) return null;
  return <Panel />;
}

function Panel() {
  const t = useT();
  const { openMatchDetail, openSportsPage } = useView();
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<SportsSearchHit[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const close = () => setSportsSearchOpen(false);

  useEffect(() => {
    input.current?.focus();
    const onBack = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("harbor:local-back", onBack, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("harbor:local-back", onBack, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const q = query.trim();
  const channels = useMemo(() => {
    if (q.length < 2) return [];
    const id = readActiveId();
    const list = id ? (getCachedPlaylist(id)?.channels ?? []) : [];
    return searchChannels(list, q, isSportsChannel, (name) => agentEdit(name) === "hide", 12);
  }, [q]);
  const games = useMemo(() => (q.length < 2 ? [] : searchGames(hubGames(), q, 10)), [q]);

  useEffect(() => {
    if (q.length < 2) {
      setPeople([]);
      setPeopleLoading(false);
      return;
    }
    const ac = new AbortController();
    setPeopleLoading(true);
    const timer = window.setTimeout(() => {
      searchTeamsAndPlayers(q, ac.signal)
        .then((hits) => !ac.signal.aborted && setPeople(hits))
        .catch(() => !ac.signal.aborted && setPeople([]))
        .finally(() => !ac.signal.aborted && setPeopleLoading(false));
    }, 220);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [q]);

  const openGame = (g: SportsGame) => {
    close();
    openMatchDetail(g);
  };
  const watchChannel = (c: IptvChannel) => {
    close();
    tuneSportsTv({ key: `search:${c.id}`, title: c.name, live: true, channels: [c] });
  };
  const openHit = (h: SportsSearchHit) => {
    close();
    openSportsPage(
      h.kind === "team"
        ? { kind: "team", league: h.league, teamId: h.id, name: h.name }
        : { kind: "athlete", league: h.league, athleteId: h.id, name: h.name },
    );
  };
  const nothing =
    q.length >= 2 && !peopleLoading && !games.length && !channels.length && !people.length;

  return (
    <div
      className="fixed inset-0 z-[400] flex justify-center bg-black/60 px-4 pt-[8vh] backdrop-blur-md"
      data-search-overlay
      data-tv-focus-scope="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-label={t("Search sports")}
        className="flex max-h-[84vh] w-full max-w-[820px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-canvas/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5">
          <Search size={20} className="shrink-0 text-ink-subtle" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search games, teams, players and sports channels")}
            aria-label={t("Search sports")}
            data-tv-text-auto="true"
            spellCheck={false}
            autoComplete="off"
            className="h-16 w-full bg-transparent text-[20px] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            aria-label={t("Close")}
            data-tv-modal-close
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-subtle outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-5 overflow-y-auto p-4">
          {q.length < 2 && (
            <p className="px-2 py-6 text-center text-[14px] text-ink-muted">
              {t("Type a team, player, league or channel. Sports only, no movies or shows.")}
            </p>
          )}
          {games.length > 0 && (
            <Group icon={<Trophy size={15} />} title={t("Games")}>
              {games.map((g) => (
                <button
                  key={`${g.league}:${g.id}`}
                  type="button"
                  className={ROW}
                  onClick={() => openGame(g)}
                >
                  <Logos game={g} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink">
                      {g.away.name} {t("at")} {g.home.name}
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-muted">
                      {leagueName(g.league)} · {gameWhen(g, t)}
                    </span>
                  </span>
                  {g.state === "in" && (
                    <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-bold text-white">
                      {t("LIVE")}
                    </span>
                  )}
                </button>
              ))}
            </Group>
          )}
          {channels.length > 0 && (
            <Group icon={<Tv size={15} />} title={t("Sports channels")}>
              {channels.map((c) => (
                <button key={c.id} type="button" className={ROW} onClick={() => watchChannel(c)}>
                  <span className="grid h-9 w-14 shrink-0 place-items-center rounded-lg bg-white/10">
                    {c.logo ? (
                      <img
                        src={c.logo}
                        alt=""
                        loading="lazy"
                        className="max-h-7 max-w-12 object-contain"
                      />
                    ) : (
                      <Radio size={16} className="text-ink-subtle" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink">
                      {c.name}
                    </span>
                    {c.group && (
                      <span className="block truncate text-[12.5px] text-ink-muted">{c.group}</span>
                    )}
                  </span>
                </button>
              ))}
            </Group>
          )}
          {(people.length > 0 || peopleLoading) && q.length >= 2 && (
            <Group icon={<Users size={15} />} title={t("Teams and players")}>
              {peopleLoading && !people.length && (
                <p className="px-3 py-2 text-[13px] text-ink-muted">{t("Searching…")}</p>
              )}
              {people.map((h) => (
                <button
                  key={`${h.kind}:${h.league}:${h.id}`}
                  type="button"
                  className={ROW}
                  onClick={() => openHit(h)}
                >
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-white/10">
                    {h.image ? (
                      <img src={h.image} alt="" loading="lazy" className="size-9 object-cover" />
                    ) : (
                      <Users size={15} className="text-ink-subtle" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink">
                      {h.name}
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-muted">
                      {h.kind === "team" ? t("Team") : t("Player")} · {h.subtitle}
                    </span>
                  </span>
                </button>
              ))}
            </Group>
          )}
          {nothing && (
            <p className="px-2 py-6 text-center text-[14px] text-ink-muted">
              {t("No games, teams, players or sports channels match.")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="flex items-center gap-2 px-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Logos({ game }: { game: SportsGame }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {[game.away, game.home].map((s, i) =>
        s.logo ? (
          <img key={i} src={s.logo} alt="" loading="lazy" className="size-8 object-contain" />
        ) : (
          <span
            key={i}
            className="grid size-8 place-items-center rounded-full bg-white/10 text-[10px] font-bold text-ink"
          >
            {s.abbr}
          </span>
        ),
      )}
    </span>
  );
}

function gameWhen(g: SportsGame, t: (s: string) => string): string {
  if (g.state === "in") return g.detail || t("Live now");
  if (g.state === "post") return g.detail || t("Final");
  return new Date(g.startMs).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function leagueName(key: string): string {
  const league = hubLeague(key);
  return league ? getLeagueLabel(league) : key;
}
