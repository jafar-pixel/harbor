import { useMemo, useState, type ReactNode } from "react";
import { Clapperboard, Music2, Trophy, Tv, X } from "lucide-react";
import { Play } from "@/components/icons/play-filled";
import { Row } from "@/components/row";
import { useContinueWatching } from "@/lib/continue-watching";
import { removeRecentGame, useRecentGames } from "@/lib/continue/recent-games";
import { useT } from "@/lib/i18n";
import {
  channelFromStat,
  recentChannels,
  recordChannelPlay,
  useChannelStatsVersion,
} from "@/lib/iptv/channel-stats";
import { liveChannelSource } from "@/lib/iptv/playback-source";
import { playNow } from "@/lib/music/player/store";
import { useRecentSongs } from "@/lib/music/player/recent";
import { isWeb } from "@/lib/platform";
import { useView } from "@/lib/view";
import { useStreamPlayer } from "@/views/sports/add-stream-dialog";
import { useChannelPlayer } from "@/views/sports/watch-flow";

/**
 * Continue, everywhere: what you were in the middle of across the app (movies, shows, Live TV
 * channels, games from the Sports Hub, music) in one row, newest first. Home merges these with
 * its own Continue Watching; Live TV and the Sports Hub show the whole row.
 */

export type AnywhereKind = "movie" | "series" | "live" | "sports" | "music";

export type AnywhereItem = {
  key: string;
  kind: AnywhereKind;
  title: string;
  subtitle: string;
  art: string | null;
  /** Small marks over the art: a channel logo, or the teams' logos. */
  logos: string[];
  progress?: number;
  at: number;
  open: () => void;
  dismiss?: () => void;
};

const LIVE_KEEP_MS = 3 * 24 * 60 * 60 * 1000;

/** Live TV channels, games and songs you were watching or listening to. */
export function useAnywhereItems(): AnywhereItem[] {
  const t = useT();
  const { openPlayer } = useView();
  const statsVersion = useChannelStatsVersion();
  const games = useRecentGames();
  const songs = useRecentSongs();
  const playChannel = useChannelPlayer();
  const playStream = useStreamPlayer();

  return useMemo(() => {
    void statsVersion;
    const now = Date.now();
    const gameChannelIds = new Set(games.map((g) => g.channel?.id).filter(Boolean));
    const live: AnywhereItem[] = recentChannels(8)
      .filter((s) => now - s.lastAt < LIVE_KEEP_MS && !gameChannelIds.has(s.id))
      .map((s) => ({
        key: `live:${s.id}`,
        kind: "live",
        title: s.name,
        subtitle: s.group ?? t("Live TV"),
        art: null,
        logos: s.logo ? [s.logo] : [],
        at: s.lastAt,
        open: () => {
          const ch = channelFromStat(s);
          recordChannelPlay(ch);
          openPlayer(liveChannelSource(ch));
        },
      }));
    const sports: AnywhereItem[] = games
      .filter((g) => g.channel || g.stream)
      .map((g) => ({
        key: `sports:${g.gameId}`,
        kind: "sports",
        title: g.label,
        subtitle: g.channel?.name ?? g.league.toUpperCase(),
        art: g.art,
        logos: g.logos,
        at: g.at,
        open: () => {
          if (g.stream) playStream(g.stream, g.label);
          else if (g.channel) playChannel(g.channel, g.label);
        },
        dismiss: () => removeRecentGame(g.gameId),
      }));
    // The shared music player lives in the browser and TV app.
    const music: AnywhereItem[] = isWeb()
      ? songs.slice(0, 6).map((s) => ({
          key: `music:${s.artist}:${s.title}`,
          kind: "music",
          title: s.title,
          subtitle: s.artist,
          art: s.art,
          logos: [],
          at: s.at,
          open: () => {
            const { at: _at, ...track } = s;
            playNow(track);
          },
        }))
      : [];
    return [...live, ...sports, ...music].sort((a, b) => b.at - a.at);
  }, [statsVersion, games, songs, t, openPlayer, playChannel, playStream]);
}

const KIND_ICON = {
  movie: Clapperboard,
  series: Clapperboard,
  live: Tv,
  sports: Trophy,
  music: Music2,
};

export function AnywhereCard({ item }: { item: AnywhereItem }) {
  const t = useT();
  const [artErr, setArtErr] = useState(false);
  const Icon = KIND_ICON[item.kind];
  const label =
    item.kind === "movie"
      ? t("Movie")
      : item.kind === "series"
        ? t("Show")
        : item.kind === "live"
          ? t("Live TV")
          : item.kind === "sports"
            ? t("Sports")
            : t("Music");
  const art = item.art && !artErr ? item.art : null;
  return (
    <div className="group/any relative" data-continue-kind={item.kind}>
      <button
        type="button"
        onClick={item.open}
        aria-label={`${label}: ${item.title}`}
        className="relative flex aspect-[16/9] w-full flex-col justify-end overflow-hidden rounded-xl border border-edge-soft/55 bg-elevated text-start transition-all duration-200 hover:border-edge hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]"
      >
        {art ? (
          <img
            src={art}
            alt=""
            draggable={false}
            loading="lazy"
            onError={() => setArtErr(true)}
            className={`absolute inset-0 h-full w-full transition-transform duration-300 group-hover/any:scale-[1.04] ${
              item.kind === "music" ? "object-cover blur-[1px]" : "object-cover"
            }`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center gap-5 bg-surface/70 p-7 text-ink-subtle">
            {item.logos.length ? (
              item.logos
                .slice(0, 2)
                .map((src) => (
                  <img
                    key={src}
                    src={src}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    className="max-h-[56%] max-w-[38%] object-contain"
                  />
                ))
            ) : (
              <Icon size={34} strokeWidth={1.5} />
            )}
          </div>
        )}
        {item.kind === "music" && art && (
          <img
            src={art}
            alt=""
            draggable={false}
            className="absolute start-1/2 top-[38%] aspect-square h-[46%] -translate-x-1/2 -translate-y-1/2 rounded-md object-cover shadow-[0_8px_24px_rgba(0,0,0,0.45)] rtl:translate-x-1/2"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <span className="absolute start-3 top-3 flex h-[22px] items-center gap-1.5 rounded-full bg-black/55 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur">
          {item.kind === "live" || item.kind === "sports" ? (
            <span className="h-1.5 w-1.5 rounded-full bg-danger" />
          ) : (
            <Icon size={11} />
          )}
          {label}
        </span>
        <span className="absolute end-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black opacity-0 shadow-[0_4px_14px_rgba(0,0,0,0.4)] transition-all duration-200 group-hover/any:opacity-100 group-focus-within/any:opacity-100">
          <Play size={15} fill="currentColor" />
        </span>
        <div className="relative z-10 flex flex-col gap-0.5 p-3.5">
          <span
            dir="auto"
            className="truncate text-[14.5px] font-semibold leading-tight text-white"
          >
            {item.title}
          </span>
          <span dir="auto" className="truncate text-[12px] text-white/75">
            {item.subtitle}
          </span>
          {item.progress != null && item.progress > 0 && (
            <span className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/25">
              <span
                className="block h-full rounded-full bg-white"
                style={{ width: `${Math.round(item.progress * 100)}%` }}
              />
            </span>
          )}
        </div>
      </button>
      {item.dismiss && (
        <button
          type="button"
          onClick={item.dismiss}
          aria-label={t("Remove {name} from Continue", { name: item.title })}
          className="absolute -end-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover/any:opacity-100 focus-visible:opacity-100"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

/**
 * Merge Home's own Continue Watching cards with the rest, newest first. Each card brings the time
 * it was last watched.
 */
export function mergeByTime(
  media: { at: number; node: ReactNode }[],
  others: AnywhereItem[],
): ReactNode[] {
  return [
    ...media,
    ...others.map((item) => ({ at: item.at, node: <AnywhereCard key={item.key} item={item} /> })),
  ]
    .sort((a, b) => b.at - a.at)
    .map((e) => e.node);
}

/** The whole row, for Live TV and the Sports Hub. */
export function ContinueAnywhereRow({ scrollKey }: { scrollKey: string }) {
  const t = useT();
  const { openMeta } = useView();
  const cw = useContinueWatching(undefined, 10);
  const others = useAnywhereItems();
  const items = useMemo(() => {
    const media: AnywhereItem[] = cw.map((c) => ({
      key: `${c.type}:${c.id}`,
      kind: c.type,
      title: c.name,
      subtitle:
        c.type === "series" && c.season && c.episode
          ? t("S{season} · E{episode}", { season: c.season, episode: c.episode })
          : t("Movie"),
      art: c.background ?? c.poster ?? null,
      logos: [],
      progress: c.progress,
      at: c.at,
      open: () =>
        openMeta(
          { id: c.id, type: c.type, name: c.name, poster: c.poster, background: c.background },
          c.season && c.episode ? { episodeHint: { season: c.season, episode: c.episode } } : {},
        ),
    }));
    return [...media, ...others].sort((a, b) => b.at - a.at).slice(0, 20);
  }, [cw, others, openMeta, t]);
  if (!items.length) return null;
  return (
    <Row title={t("Continue")} min={260} shape="landscape" scrollKey={scrollKey}>
      {items.map((item) => (
        <AnywhereCard key={item.key} item={item} />
      ))}
    </Row>
  );
}
