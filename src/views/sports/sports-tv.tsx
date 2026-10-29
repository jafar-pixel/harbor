import { useEffect, useMemo, useState } from "react";
import { Play, Star, Tv } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";
import { isPicked, toggleTodayPick, useTodayPicks } from "@/lib/iptv/today-picks";
import { sourceIdOf, type LiveSportsEntry } from "@/lib/jl/sports/sports-channels";
import {
  TV_LEAGUES,
  TV_LEAGUE_LABELS,
  tvLeagueOf,
  type TvLeague,
} from "@/lib/jl/sports/tv-leagues";
import { useView } from "@/lib/view";
import { usePageVisible } from "@/lib/visibility";
import { MultiPlayer } from "@/views/multiview/multi-player";
import type { LiveSportsChannelsData } from "@/views/live/live-home/jl-sports/live-sports-channels";
import { TvVolumeControls, useTvVolume } from "@/views/live/tv-volume";

type Filter = "today" | "live" | "all" | TvLeague;

const FILTER_KEY = "jl.sports.tv-filter.v1";

function readFilter(): Filter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    if (v === "today" || v === "live" || v === "all" || (TV_LEAGUES as string[]).includes(v ?? ""))
      return v as Filter;
  } catch {
    /* storage unavailable */
  }
  return "live";
}

const SELECT =
  "h-10 min-w-0 flex-1 truncate rounded-full border border-white/15 bg-black/45 px-4 text-[13.5px] font-semibold text-white outline-none backdrop-blur focus:border-white/40";

/**
 * The Sports page's TV, beside the hero: the viewer's own sports channels from every provider,
 * by league as the providers group them (NFL, NBA, College Football...), without the empty event
 * slots, picked from two dropdowns and played
 * live in place with sound controls. Watch or a double click opens the full player.
 */
export function SportsTv({ data, active }: { data: LiveSportsChannelsData; active: boolean }) {
  const t = useT();
  const { player } = useView();
  const pageVisible = usePageVisible();
  const sound = useTvVolume();
  const { entries, nowNext, sourceNames, play } = data;
  const picks = useTodayPicks();
  const pickedEntry = (e: LiveSportsEntry) => e.channels.some((c) => isPicked(picks, c.id));

  const [filter, setFilter] = useState<Filter>(readFilter);
  const chooseFilter = (f: Filter) => {
    setFilter(f);
    setKey(null);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* storage unavailable */
    }
  };

  const leagueOf = useMemo(() => {
    const m = new Map<string, TvLeague>();
    for (const e of entries) {
      const ch = e.channels[0];
      m.set(e.key, tvLeagueOf({ group: ch.group ?? null, name: ch.name, title: e.title }, e.sport));
    }
    return m;
  }, [entries]);
  const counts = useMemo(() => {
    const m = new Map<Filter, number>();
    for (const e of entries) {
      const league = leagueOf.get(e.key) ?? "More sports";
      m.set(league, (m.get(league) ?? 0) + 1);
      if (e.liveNow) m.set("live", (m.get("live") ?? 0) + 1);
      if (e.channels.some((c) => isPicked(picks, c.id))) m.set("today", (m.get("today") ?? 0) + 1);
    }
    return m;
  }, [entries, leagueOf, picks]);
  const shown = useMemo(
    () =>
      entries.filter((e) =>
        filter === "all"
          ? true
          : filter === "today"
            ? e.channels.some((c) => isPicked(picks, c.id))
            : filter === "live"
              ? e.liveNow
              : leagueOf.get(e.key) === filter,
      ),
    [entries, filter, leagueOf, picks],
  );
  // "Live now" or "Today" with nothing in it falls back to everything rather than an empty screen.
  const list = (filter === "live" || filter === "today") && shown.length === 0 ? entries : shown;

  const [key, setKey] = useState<string | null>(null);
  const entry = list.find((e) => e.key === key) ?? list[0] ?? null;
  const [sourceIdx, setSourceIdx] = useState(0);
  useEffect(() => setSourceIdx(0), [entry?.key]);
  const channel: IptvChannel | null = entry?.channels[sourceIdx] ?? entry?.channels[0] ?? null;

  const [playing, setPlaying] = useState(false);
  useEffect(() => setPlaying(false), [channel?.id]);
  // Many IPTV accounts allow one stream at a time: the TV stops while the full player is open,
  // the page is hidden or Sports isn't on screen.
  const showVideo = !!channel?.url && active && pageVisible && !player;
  const program = channel ? nowNext(channel).current : null;

  const label = (e: LiveSportsEntry) => {
    const now = e.event ? null : nowNext(e.channels[0]).current?.title;
    return `${e.liveNow ? "● " : ""}${e.title}${now && now !== e.title ? ` · ${now}` : ""}`;
  };

  return (
    <section
      aria-label={t("Sports TV")}
      className="flex h-full min-w-0 flex-col gap-3 px-6 pb-8 pt-28"
    >
      <div className="flex items-center gap-2">
        <select
          value={filter}
          onChange={(e) => chooseFilter(e.target.value as Filter)}
          aria-label={t("Show")}
          className={`${SELECT} max-w-[46%] flex-none`}
        >
          <option value="today">
            {t("Today's games")} ({counts.get("today") ?? 0})
          </option>
          <option value="live">
            {t("Live now")} ({counts.get("live") ?? 0})
          </option>
          {TV_LEAGUES.filter((l) => counts.has(l)).map((l) => (
            <option key={l} value={l}>
              {t(TV_LEAGUE_LABELS[l])} ({counts.get(l)})
            </option>
          ))}
          <option value="all">
            {t("All sports channels")} ({entries.length})
          </option>
        </select>
        <select
          value={entry?.key ?? ""}
          onChange={(e) => setKey(e.target.value)}
          aria-label={t("Channel")}
          disabled={list.length === 0}
          className={SELECT}
        >
          {list.map((e) => (
            <option key={e.key} value={e.key}>
              {label(e)}
            </option>
          ))}
        </select>
      </div>

      <div
        onDoubleClick={() => channel && play(channel)}
        className="relative min-h-0 flex-1 cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]"
      >
        {channel?.logo ? (
          <img
            src={channel.logo}
            alt=""
            draggable={false}
            className="absolute left-1/2 top-[42%] max-h-[34%] max-w-[46%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-80"
          />
        ) : (
          <Tv
            size={64}
            strokeWidth={1.2}
            className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 text-white/30"
          />
        )}
        {showVideo && channel && (
          <div
            className="absolute inset-0 transition-opacity duration-500"
            style={{ opacity: playing ? 1 : 0 }}
          >
            <MultiPlayer
              key={channel.id}
              url={channel.url}
              muted={sound.muted}
              volume={sound.volume}
              exclusive
              cover
              onPlaying={() => setPlaying(true)}
              onError={() => setPlaying(false)}
            />
          </div>
        )}
        {!entry && (
          <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-[14px] text-white/75">
            {t("Add an IPTV provider in Live TV to watch your sports channels here.")}
          </p>
        )}
        {entry && channel && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-14">
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium text-white/75">
                {entry.liveNow && (
                  <span className="me-2 rounded bg-danger px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                    {t("Live")}
                  </span>
                )}
                {channel.name}
              </p>
              <h3 dir="auto" className="truncate text-[18px] font-semibold text-white">
                {entry.event ? entry.title : (program?.title ?? entry.title)}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {entry.channels.length > 1 && (
                <select
                  value={sourceIdx}
                  onChange={(e) => setSourceIdx(Number(e.target.value))}
                  onDoubleClick={(e) => e.stopPropagation()}
                  aria-label={t("Provider")}
                  className="h-10 max-w-[40%] truncate rounded-full border border-white/15 bg-black/45 px-3 text-[12.5px] font-semibold text-white outline-none backdrop-blur"
                >
                  {entry.channels.map((c, i) => (
                    <option key={c.id} value={i}>
                      {sourceNames.get(sourceIdOf(c.id)) ?? t("Provider {n}", { n: i + 1 })}
                    </option>
                  ))}
                </select>
              )}
              <div className="ms-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTodayPick(channel, entry.title);
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  aria-pressed={pickedEntry(entry)}
                  aria-label={
                    pickedEntry(entry) ? t("Remove from today's games") : t("Add to today's games")
                  }
                  title={t("Today's games stay until midnight")}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65"
                >
                  <Star size={17} fill={pickedEntry(entry) ? "currentColor" : "none"} />
                </button>
                <TvVolumeControls />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    play(channel);
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="jl-cta flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13.5px] font-semibold text-black"
                >
                  <Play size={15} fill="currentColor" /> {t("Watch")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
