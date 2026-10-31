import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Maximize, Tv } from "lucide-react";
import { useT } from "@/lib/i18n";
import { recentChannels, useChannelStatsVersion } from "@/lib/iptv/channel-stats";
import type { useFavorites } from "@/lib/iptv/favorites";
import type { EpgIndex, EpgProgram, IptvChannel } from "@/lib/iptv/types";
import { findCurrent } from "@/lib/iptv/xmltv";
import { useView } from "@/lib/view";
import { usePageVisible } from "@/lib/visibility";
import { MultiPlayer } from "@/views/multiview/multi-player";
import { channelNumber, fmtClock, fmtLeft } from "./live-home/now-format";
import { TvVolumeControls, useTvVolume } from "./tv-volume";

/** Wait this long on a channel before its preview starts, so scrolling past doesn't open streams. */
const PREVIEW_DWELL_MS = 1200;
const PAGE = 200;
/** Channels whose stream refused the preview this visit; they show their artwork instead. */
const FAILED = new Set<string>();

/**
 * Live TV's Channels view, beside the group list: the channels you watched last on top, the
 * group's channels as tiles under them, and the selected channel playing on the right with what's
 * on and a Full Screen button. A click selects; a double click or Full Screen opens the player.
 * Favorites uses the same view over your favourite channels.
 */
export function ChannelsView({
  channels,
  epg,
  nowMs,
  active,
  favorites,
  onPlay,
  resetKey,
  sourceId,
}: {
  channels: IptvChannel[];
  epg: EpgIndex | null;
  nowMs: number;
  active: boolean;
  favorites: ReturnType<typeof useFavorites>;
  onPlay: (ch: IptvChannel) => void;
  resetKey: string;
  sourceId: string;
}) {
  const t = useT();
  const statsVersion = useChannelStatsVersion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLimit(PAGE);
    setSelectedId(null);
    listRef.current?.scrollTo({ top: 0 });
  }, [resetKey]);

  const selected = channels.find((c) => c.id === selectedId) ?? channels[0] ?? null;
  const shown = channels.slice(0, limit);
  const programsOf = (ch: IptvChannel) => (ch.tvgId ? epg?.byChannel.get(ch.tvgId) : undefined);
  const recent = useMemo(() => {
    void statsVersion;
    const byId = new Map(channels.map((c) => [c.id, c]));
    return recentChannels(12, sourceId)
      .map((s) => byId.get(s.id))
      .filter((c): c is IptvChannel => !!c);
  }, [channels, sourceId, statsVersion]);
  const select = (ch: IptvChannel) => setSelectedId(ch.id);

  return (
    <div className="grid min-h-0 flex-1 gap-5 pb-6 lg:grid-cols-[minmax(320px,1fr)_minmax(420px,1.15fr)]">
      <div
        ref={listRef}
        aria-label={t("Channels")}
        className="order-2 flex max-h-[calc(100dvh-220px)] min-h-0 flex-col gap-5 overflow-y-auto pe-1 lg:order-none"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 400 && limit < channels.length)
            setLimit((n) => n + PAGE);
        }}
      >
        {recent.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[15px] font-semibold text-accent">{t("Continue watching")}</h2>
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recent.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => select(ch)}
                  onDoubleClick={() => onPlay(ch)}
                  title={ch.name}
                  aria-current={selected?.id === ch.id || undefined}
                  className={`flex w-[104px] shrink-0 flex-col items-center gap-1.5 rounded-xl border p-2 transition-colors ${
                    selected?.id === ch.id
                      ? "border-accent bg-raised"
                      : "border-edge-soft/50 bg-elevated hover:border-edge"
                  }`}
                >
                  <ChannelLogo channel={ch} />
                  <span
                    dir="auto"
                    className="w-full truncate text-center text-[11.5px] text-ink-muted"
                  >
                    {ch.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        <div
          role="listbox"
          aria-label={t("Channels")}
          className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5"
        >
          {shown.map((ch) => {
            const { current } = findCurrent(programsOf(ch), nowMs);
            const on = selected?.id === ch.id;
            const progress = current
              ? Math.min(
                  1,
                  Math.max(0, (nowMs - current.startMs) / (current.endMs - current.startMs)),
                )
              : null;
            return (
              <button
                key={ch.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => select(ch)}
                onDoubleClick={() => onPlay(ch)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && on) {
                    e.preventDefault();
                    onPlay(ch);
                  }
                }}
                className={`flex flex-col overflow-hidden rounded-xl border text-start transition-colors ${
                  on
                    ? "border-accent bg-raised"
                    : "border-edge-soft/50 bg-elevated hover:border-edge"
                }`}
              >
                <span className="relative flex aspect-video items-center justify-center bg-white/[0.05] p-4">
                  <TileLogo channel={ch} />
                  <span className="absolute start-2 top-2 rounded bg-danger px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.14em] text-white">
                    {t("Live")}
                  </span>
                  {channelNumber(ch.attrs) && (
                    <span className="absolute end-2 top-2 text-[11px] tabular-nums text-ink-subtle">
                      {channelNumber(ch.attrs)}
                    </span>
                  )}
                  {progress != null && (
                    <span className="absolute inset-x-0 bottom-0 h-[3px] bg-ink/15">
                      <span
                        className="block h-full bg-accent"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                      />
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
                  <span dir="auto" className="truncate text-[13px] font-semibold text-ink">
                    {ch.name}
                  </span>
                  <span dir="auto" className="truncate text-[11.5px] text-ink-muted">
                    {current ? current.title : (ch.group ?? t("Live channel"))}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <Preview
          channel={selected}
          programs={programsOf(selected)}
          nowMs={nowMs}
          active={active}
          favorite={favorites.has(selected.id)}
          onFavorite={() => favorites.toggle(selected)}
          onPlay={() => onPlay(selected)}
        />
      )}
    </div>
  );
}

function TileLogo({ channel }: { channel: IptvChannel }) {
  const [err, setErr] = useState(false);
  return channel.logo && !err ? (
    <img
      src={channel.logo}
      alt=""
      draggable={false}
      loading="lazy"
      onError={() => setErr(true)}
      className="max-h-full max-w-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
    />
  ) : (
    <Tv size={26} className="text-ink-subtle" />
  );
}

function ChannelLogo({ channel, large = false }: { channel: IptvChannel; large?: boolean }) {
  const [err, setErr] = useState(false);
  const size = large ? "h-14 w-20" : "h-10 w-14";
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center rounded-lg bg-white/[0.06] p-1.5`}
    >
      {channel.logo && !err ? (
        <img
          src={channel.logo}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setErr(true)}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <Tv size={large ? 26 : 18} className="text-ink-subtle" />
      )}
    </span>
  );
}

function Preview({
  channel,
  programs,
  nowMs,
  active,
  favorite,
  onFavorite,
  onPlay,
}: {
  channel: IptvChannel;
  programs: EpgProgram[] | undefined;
  nowMs: number;
  active: boolean;
  favorite: boolean;
  onFavorite: () => void;
  onPlay: () => void;
}) {
  const t = useT();
  const { player } = useView();
  const pageVisible = usePageVisible();
  const sound = useTvVolume();
  const [armed, setArmed] = useState("");
  const [playing, setPlaying] = useState(false);
  const [, setFailures] = useState(0);
  const { current, next } = useMemo(() => findCurrent(programs, nowMs), [programs, nowMs]);

  useEffect(() => {
    setPlaying(false);
    setArmed("");
    const id = window.setTimeout(() => setArmed(channel.id), PREVIEW_DWELL_MS);
    return () => window.clearTimeout(id);
  }, [channel.id]);

  // Many IPTV accounts allow one stream at a time: the preview stops whenever the real player is
  // open, the page is hidden or Live TV isn't on screen.
  const showVideo =
    armed === channel.id && active && pageVisible && !player && !FAILED.has(channel.id);
  const art = current?.iconUrl ?? null;
  const left = current ? fmtLeft(current.endMs, nowMs, t) : null;

  return (
    <section
      aria-label={t("Preview of {name}", { name: channel.name })}
      className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0 lg:self-start"
    >
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-edge-soft bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
        {art ? (
          <img
            src={art}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-80"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ChannelLogo channel={channel} large />
          </div>
        )}
        {showVideo && (
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
              onError={() => {
                FAILED.add(channel.id);
                setPlaying(false);
                setFailures((n) => n + 1);
              }}
            />
          </div>
        )}
        <span className="absolute start-4 top-4 flex h-6 items-center gap-1.5 rounded-full bg-black/60 px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
          {t("Live")}
        </span>
        <div className="absolute end-3 bottom-3">
          <TvVolumeControls />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <p dir="auto" className="truncate text-[13px] font-medium text-ink-muted">
          {channel.name}
        </p>
        <h2 dir="auto" className="truncate text-[24px] font-bold uppercase leading-tight text-ink">
          {current?.title ?? channel.name}
        </h2>
        <p
          dir="auto"
          className="truncate text-[14px] font-semibold uppercase tracking-wide text-accent"
        >
          {channel.group ?? t("Live channel")}
          {current && (
            <span className="ms-2 font-medium normal-case tracking-normal tabular-nums text-ink-subtle">
              {fmtClock(current.startMs)} – {fmtClock(current.endMs)}
              {left ? ` · ${left}` : ""}
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onPlay}
          className="flex h-14 flex-1 items-center justify-center gap-3 rounded-2xl bg-[#f5c518] text-[17px] font-bold uppercase tracking-wide text-black shadow-[0_10px_30px_-12px_rgba(245,197,24,0.7)] transition-[filter] hover:brightness-105"
        >
          <Maximize size={20} strokeWidth={2.4} /> {t("Full screen")}
        </button>
        <button
          type="button"
          onClick={onFavorite}
          aria-pressed={favorite}
          aria-label={favorite ? t("Remove from favorites") : t("Add to favorites")}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-elevated text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised"
        >
          <Heart size={20} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
      {(current?.description || next) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-elevated p-4">
          {current?.description && (
            <p dir="auto" className="line-clamp-3 text-[13.5px] leading-relaxed text-ink-muted">
              {current.description}
            </p>
          )}
          {next && (
            <p className="text-[13px] text-ink-subtle">
              <span className="font-semibold text-ink">{t("Up next")}</span> ·{" "}
              <span className="tabular-nums">{fmtClock(next.startMs)}</span> · {next.title}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
