import { useMemo, useState } from "react";
import { Row } from "@/components/row";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { isHydratableChannel } from "@/lib/iptv/channel-hydration";
import type { IptvChannel } from "@/lib/iptv/types";
import type { SportsGame } from "@/lib/sports/espn";
import { useView } from "@/lib/view";
import { useWeeklyTop } from "@/lib/weekly-top";
import { useChannelHydration } from "../hooks/use-channel-hydration";
import { useAmbientTarget } from "./ambient";
import { ChannelArt, GameArt } from "./channel-art";
import { hydrationKey, type NowItem } from "./use-live-home";

/**
 * Live TV Home's Top 10 rows: the day's top games, the viewer's most-watched channels, and the
 * week's Top 10 movies and shows. Every card is fan art with its rank in large type.
 */

function RankTile({
  id,
  rank,
  title,
  sub,
  live,
  art,
  onClick,
}: {
  /** Names the tile for the ambient backdrop. */
  id: string;
  rank: number;
  title: string;
  sub?: string | null;
  live?: boolean;
  art: React.ReactNode;
  onClick: () => void;
}) {
  const t = useT();
  const ambient = useAmbientTarget(id, () => art);
  return (
    <button
      type="button"
      onClick={onClick}
      {...ambient}
      aria-label={`${rank}. ${title}`}
      className="group relative flex aspect-[16/9] w-full overflow-hidden rounded-lg border border-edge-soft/55 bg-elevated text-start outline-none transition-all duration-200 hover:border-edge focus-visible:ring-2 focus-visible:ring-white/85"
    >
      {art}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className="absolute inset-y-0 start-0 w-1/2 bg-gradient-to-r from-black/55 to-transparent rtl:bg-gradient-to-l" />
      {live && (
        <span className="absolute end-3 top-3 flex h-[22px] items-center gap-1.5 rounded-full bg-canvas/90 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-danger backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
          {t("Live")}
        </span>
      )}
      <div className="relative z-10 mt-auto flex w-full items-end gap-3 p-3">
        <span
          aria-hidden
          className="font-display text-[72px] font-black leading-[0.8] tracking-tighter text-transparent tabular-nums"
          style={{ WebkitTextStroke: "2px rgba(255,255,255,0.92)" }}
        >
          {rank}
        </span>
        <span className="min-w-0 flex-1 pb-0.5">
          <span dir="auto" className="block truncate text-[14.5px] font-semibold text-white">
            {title}
          </span>
          {sub && <span className="block truncate text-[12px] text-white/65">{sub}</span>}
        </span>
      </div>
    </button>
  );
}

function MetaArt({ meta }: { meta: Meta }) {
  const [err, setErr] = useState(0);
  const pics = [meta.background, meta.poster].filter((x): x is string => !!x);
  const src = pics[err];
  if (!src) return <div className="absolute inset-0 bg-surface" />;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setErr((e) => e + 1)}
      className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04] group-focus-visible:scale-[1.04]"
    />
  );
}

/** The week's Top 10 movies or shows (TMDB trending with a key, else Cinemeta's most popular). */
export function WeeklyTopRow({ kind, tmdbKey }: { kind: "movie" | "series"; tmdbKey: string }) {
  const t = useT();
  const { openMeta } = useView();
  const list = useWeeklyTop(kind, tmdbKey);
  if (!list.length) return null;
  return (
    <Row
      title={kind === "movie" ? t("Top 10 movies this week") : t("Top 10 shows this week")}
      shape="landscape"
      min={320}
      scrollKey={`live-home:top10:${kind}`}
    >
      {list.map((m, i) => (
        <RankTile
          key={m.id}
          id={`meta:${m.id}`}
          rank={i + 1}
          title={m.name}
          sub={[m.releaseInfo, m.imdbRating && `★ ${m.imdbRating}`].filter(Boolean).join(" · ")}
          art={<MetaArt meta={m} />}
          onClick={() => openMeta(m)}
        />
      ))}
    </Row>
  );
}

/** The Top 10 games (the Sports Hub's ranking): OK puts the game's best channel on. */
export function SportsTopRow({
  games,
  onWatch,
  onOpenGame,
}: {
  games: readonly { game: SportsGame; channels: readonly { channel: IptvChannel }[] }[];
  onWatch: (ch: IptvChannel) => void;
  onOpenGame: (game: SportsGame) => void;
}) {
  const t = useT();
  const top = games.slice(0, 10);
  if (!top.length) return null;
  return (
    <Row
      title={t("Top 10 in sports")}
      shape="landscape"
      min={320}
      scrollKey="live-home:top10:sports"
    >
      {top.map(({ game, channels }, i) => (
        <RankTile
          key={game.id}
          id={`game:${game.id}`}
          rank={i + 1}
          title={`${game.away.name} at ${game.home.name}`}
          sub={[game.league, channels[0]?.channel.name ?? game.detail].filter(Boolean).join(" · ")}
          live={game.state === "in"}
          art={<GameArt game={game} />}
          onClick={() => (channels[0] ? onWatch(channels[0].channel) : onOpenGame(game))}
        />
      ))}
    </Row>
  );
}

/** The viewer's ten most-watched channels, with what's on them now. */
export function ChannelsTopRow({
  items,
  onPlay,
}: {
  items: NowItem[];
  onPlay: (ch: IptvChannel) => void;
}) {
  const t = useT();
  const top = items.slice(0, 10);
  const hydrations = useChannelHydration(
    useMemo(
      () => [...new Set(top.filter((it) => isHydratableChannel(it.channel)).map(hydrationKey))],
      [top],
    ),
  );
  if (!top.length) return null;
  return (
    <Row
      title={t("Your Top 10 channels")}
      shape="landscape"
      min={320}
      scrollKey="live-home:top10:channels"
    >
      {top.map((it, i) => (
        <RankTile
          key={it.channel.id}
          id={`ch:${it.channel.id}`}
          rank={i + 1}
          title={it.current?.title ?? it.channel.name}
          sub={it.current ? it.channel.name : it.channel.group}
          live
          art={<ChannelArt item={it} hydrated={hydrations.get(hydrationKey(it)) ?? null} zoom />}
          onClick={() => onPlay(it.channel)}
        />
      ))}
    </Row>
  );
}
