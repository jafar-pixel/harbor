import { useEffect, useMemo, useRef, useState } from "react";
import { Heart, Play, Tv } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { useFavorites } from "@/lib/iptv/favorites";
import type { EpgIndex, EpgProgram, IptvChannel } from "@/lib/iptv/types";
import { findCurrent } from "@/lib/iptv/xmltv";
import { useView } from "@/lib/view";
import { usePageVisible } from "@/lib/visibility";
import { MultiPlayer } from "@/views/multiview/multi-player";
import { channelNumber, fmtClock, fmtLeft } from "./live-home/now-format";

/** Wait this long on a channel before its preview starts, so scrolling past doesn't open streams. */
const PREVIEW_DWELL_MS = 1200;
const PAGE = 200;
/** Channels whose stream refused the preview this visit; they show their artwork instead. */
const FAILED = new Set<string>();

/**
 * Live TV's Channels view: the channel list on one side (logo, number, what's on and when) and a
 * big live preview of the selected channel on the other, muted, with what's on now and next.
 * Watch opens the full player. Favorites uses the same view over your favourite channels.
 */
export function ChannelsView({
  channels,
  epg,
  nowMs,
  active,
  favorites,
  onPlay,
  resetKey,
}: {
  channels: IptvChannel[];
  epg: EpgIndex | null;
  nowMs: number;
  active: boolean;
  favorites: ReturnType<typeof useFavorites>;
  onPlay: (ch: IptvChannel) => void;
  resetKey: string;
}) {
  const t = useT();
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

  return (
    <div className="grid min-h-0 flex-1 gap-5 pb-6 lg:grid-cols-[minmax(320px,0.9fr)_1.4fr]">
      <div
        ref={listRef}
        role="listbox"
        aria-label={t("Channels")}
        className="flex max-h-[calc(100dvh-220px)] min-h-0 flex-col gap-1.5 overflow-y-auto pe-1 lg:order-none order-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 400 && limit < channels.length)
            setLimit((n) => n + PAGE);
        }}
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
              onClick={() => setSelectedId(ch.id)}
              onDoubleClick={() => onPlay(ch)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && on) {
                  e.preventDefault();
                  onPlay(ch);
                }
              }}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors ${
                on
                  ? "border-edge bg-raised"
                  : "border-transparent hover:border-edge-soft hover:bg-elevated"
              }`}
            >
              <ChannelLogo channel={ch} />
              <span className="w-9 shrink-0 text-center text-[12px] tabular-nums text-ink-subtle">
                {channelNumber(ch.attrs) ?? ""}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span dir="auto" className="truncate text-[14px] font-semibold text-ink">
                  {ch.name}
                </span>
                <span dir="auto" className="truncate text-[12.5px] text-ink-muted">
                  {current ? current.title : (ch.group ?? t("Live channel"))}
                </span>
                {progress != null && (
                  <span className="mt-1 h-[3px] overflow-hidden rounded-full bg-ink/15">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </span>
                )}
              </span>
              {current && (
                <span className="shrink-0 text-end text-[11.5px] tabular-nums text-ink-subtle">
                  {fmtClock(current.startMs)}
                  <br />
                  {fmtClock(current.endMs)}
                </span>
              )}
            </button>
          );
        })}
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
              muted
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
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-5 pt-16">
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white/80">{channel.name}</p>
              <h2
                dir="auto"
                className="truncate text-[22px] font-semibold leading-tight text-white"
              >
                {current?.title ?? channel.group ?? t("Live channel")}
              </h2>
              {current && (
                <p className="mt-1 text-[12.5px] tabular-nums text-white/75">
                  {fmtClock(current.startMs)} – {fmtClock(current.endMs)}
                  {left ? ` · ${left}` : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onFavorite}
              aria-pressed={favorite}
              aria-label={favorite ? t("Remove from favorites") : t("Add to favorites")}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              <Heart size={18} fill={favorite ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              onClick={onPlay}
              className="jl-cta flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-black"
            >
              <Play size={16} fill="currentColor" /> {t("Watch")}
            </button>
          </div>
        </div>
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
