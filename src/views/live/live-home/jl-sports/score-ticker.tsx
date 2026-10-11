import { ChevronLeft, ChevronRight, Play, Star, Trophy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { qualityLabel } from "@/lib/jl/sports/channels";
import { tickerExtras, tickerStatus, tickerTeamName } from "@/lib/jl/sports/ticker";
import { visibleScore } from "@/lib/jl/sports/presentation";
import { fmtClock } from "../now-format";
import {
  setTickerDismissed,
  useScoreTicker,
  useTickerDismissed,
  type ScoreTickerItem,
} from "./score-ticker-store";
import { useTickerScroll } from "./use-ticker-scroll";

type Translate = ReturnType<typeof useT>;

/**
 * Tickarr: the live-score crawl pinned to the very top of the window on the hubs, up whenever
 * there are games until ✕ turns it off. Picking a game plays its best channel straight away.
 * Space for it is reserved through `--harbor-top-inset`, which the shell and the fixed top
 * chrome follow, so it never covers the header.
 */
export function ScoreTickerBar() {
  const t = useT();
  const ticker = useScoreTicker();
  const dismissed = useTickerDismissed();
  const items = ticker?.items ?? [];
  const up = !!ticker?.bar && !dismissed && items.length > 0;
  const mode = up ? "bar" : ticker?.bar && dismissed ? "tab" : null;

  useEffect(() => {
    const root = document.documentElement;
    if (mode) root.dataset.scoreTicker = mode;
    else delete root.dataset.scoreTicker;
  }, [mode]);
  useEffect(() => () => void delete document.documentElement.dataset.scoreTicker, []);

  if (!ticker || !mode) return null;
  return (
    <div
      data-score-ticker
      className="fixed inset-x-0 top-0 z-[110] h-(--harbor-top-inset) overflow-hidden"
    >
      {mode === "tab" ? (
        <div
          data-tauri-drag-region
          className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-center"
        >
          <button
            type="button"
            onClick={() => setTickerDismissed(false)}
            aria-label={t("Show the score ticker")}
            className="flex h-4 items-center gap-1 rounded-full border border-edge-soft bg-canvas/80 px-2 text-[10px] font-semibold text-ink-muted backdrop-blur-md transition-colors hover:border-edge hover:text-ink"
          >
            <Trophy size={10} className="text-accent" />
            {t("Scores")}
          </button>
        </div>
      ) : (
        <div
          data-tauri-drag-region
          role="region"
          aria-label={t("Scores")}
          className="absolute inset-x-0 bottom-0 flex h-14 items-center gap-2 border-b border-edge-soft bg-canvas/85 ps-3 pe-1.5 backdrop-blur-md"
        >
          <span
            data-tauri-drag-region
            className="hidden shrink-0 items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-accent sm:flex"
          >
            <Trophy size={13} />
            {t("Scores")}
          </span>
          <TickerTrack items={items} running interactive />
          <button
            type="button"
            onClick={() => setTickerDismissed(true)}
            aria-label={t("Turn off the score ticker")}
            title={t("Turn off the score ticker")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-ink/10 hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The same crawl along the top edge of a live channel playing full screen. Player shells lay out
 * their own top bar, so the crawl steps aside whenever the player's controls are showing; it is
 * display-only (selecting a game belongs to the bar on the hubs).
 */
export function ScoreTickerOverlay({ chromeVisible }: { chromeVisible: boolean }) {
  const ticker = useScoreTicker();
  const dismissed = useTickerDismissed();
  const items = ticker?.items ?? [];
  if (!ticker?.overlay || dismissed || items.length === 0) return null;
  const up = !chromeVisible;
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center bg-black/55 px-2 text-white backdrop-blur-md transition-[transform,opacity] duration-500 motion-reduce:transition-none ${
        up ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0"
      }`}
    >
      <TickerTrack items={items} running={up} interactive={false} />
    </div>
  );
}

function TickerTrack({
  items,
  running,
  interactive,
}: {
  items: ScoreTickerItem[];
  running: boolean;
  interactive: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const firstSet = useRef<HTMLDivElement>(null);
  const nudge = useRef<((dx: number) => void) | null>(null);
  const [loop, setLoop] = useState(false);
  const t = useT();

  // Only a list wider than the window loops; a short one just sits still.
  useEffect(() => {
    const view = viewport.current;
    const set = firstSet.current;
    if (!view || !set) return;
    const measure = () => setLoop(set.offsetWidth > view.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(view);
    ro.observe(set);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!loop && track.current) track.current.style.transform = "";
  }, [loop]);
  useTickerScroll(viewport, track, running && loop, nudge);
  const step = (dir: 1 | -1) => nudge.current?.(dir * (viewport.current?.clientWidth ?? 600) * 0.7);

  const set = (copy: boolean) =>
    items.map((item) => (
      <TickerCell
        key={`${item.game.league}:${item.game.id}`}
        item={item}
        copy={copy}
        interactive={interactive}
      />
    ));
  const arrows = interactive && loop;
  const arrow = (dir: 1 | -1) => (
    <button
      type="button"
      onClick={() => step(dir)}
      aria-label={dir < 0 ? t("Earlier games") : t("More games")}
      title={dir < 0 ? t("Earlier games") : t("More games")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-edge-soft bg-canvas/60 text-ink-muted transition-colors hover:border-edge hover:bg-ink/10 hover:text-ink"
    >
      {dir < 0 ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
    </button>
  );
  return (
    <>
      {arrows && arrow(-1)}
      {/* Laid out left to right in every language so the crawl's maths stays simple; names keep dir="auto". */}
      <div
        ref={viewport}
        dir="ltr"
        className={`relative min-w-0 flex-1 overflow-clip [touch-action:pan-y] ${interactive ? "cursor-grab" : ""}`}
      >
        <div ref={track} className="flex w-max will-change-transform">
          <div ref={firstSet} className="flex gap-2 pe-2">
            {set(false)}
          </div>
          {loop && <div className="flex gap-2 pe-2">{set(true)}</div>}
        </div>
        {loop && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-canvas/90 to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-canvas/90 to-transparent"
            />
          </>
        )}
      </div>
      {arrows && arrow(1)}
    </>
  );
}

function TickerCell({
  item,
  copy,
  interactive,
}: {
  item: ScoreTickerItem;
  copy: boolean;
  interactive: boolean;
}) {
  const t = useT();
  const ticker = useScoreTicker();
  const { game, channels, mine } = item;
  const onNow =
    !!ticker?.playingChannelId && channels.some((c) => c.channel.id === ticker.playingChannelId);
  const body = <CellBody item={item} showOdds={!!ticker?.showOdds} t={t} />;
  const look = `flex h-11 shrink-0 items-center gap-2.5 rounded-xl border px-3 text-[13px] ${
    onNow
      ? "border-accent/60 bg-accent-soft"
      : mine
        ? "border-accent/30 bg-canvas/40"
        : "border-edge-soft bg-canvas/40"
  }`;
  if (!interactive) {
    return (
      <span data-ticker-cell className={look}>
        {body}
      </span>
    );
  }
  const away = tickerTeamName(game.away, game.league);
  const home = tickerTeamName(game.home, game.league);
  const label = `${away} ${t("at")} ${home}`;
  const best = channels[0]?.channel;
  return (
    <button
      type="button"
      data-ticker-cell
      tabIndex={copy ? -1 : undefined}
      aria-hidden={copy || undefined}
      aria-current={onNow || undefined}
      aria-label={
        channels.length ? t("Watch {game}", { game: label }) : `${t("Game details")}: ${label}`
      }
      title={best ? t("Watch on {channel}", { channel: best.name }) : undefined}
      draggable={false}
      onClick={() => ticker?.select(item)}
      className={`${look} text-ink transition-colors hover:border-edge hover:bg-ink/10`}
    >
      {body}
    </button>
  );
}

function CellBody({
  item,
  showOdds,
  t,
}: {
  item: ScoreTickerItem;
  showOdds: boolean;
  t: Translate;
}) {
  const { game, channels, mine } = item;
  const status = tickerStatus(game);
  const statusText =
    status.kind === "live"
      ? status.detail || t("Live")
      : status.kind === "final"
        ? status.detail || t("Final")
        : fmtClock(status.startMs);
  const quality = channels[0] ? qualityLabel(channels[0].channel.name) : null;
  return (
    <>
      {mine && (
        <Star size={11} fill="currentColor" strokeWidth={0} className="shrink-0 text-accent" />
      )}
      {[game.away, game.home].map((side, i) => (
        <span key={i} className="flex shrink-0 items-center gap-1.5">
          {i === 1 && <span className="text-ink-subtle">-</span>}
          {i === 1 && visibleScore(game, side) && (
            <span className="text-[15px] font-bold tabular-nums">{visibleScore(game, side)}</span>
          )}
          {side.logo && (
            <img
              src={side.logo}
              alt=""
              draggable={false}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="h-6 w-6 object-contain"
            />
          )}
          {side.rank ? (
            <span className="text-[11px] font-bold text-accent">#{side.rank}</span>
          ) : null}
          <span dir="auto" className="font-semibold">
            {tickerTeamName(side, game.league)}
          </span>
          {i === 0 && visibleScore(game, side) && (
            <span className="text-[15px] font-bold tabular-nums">{visibleScore(game, side)}</span>
          )}
        </span>
      ))}
      <span
        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] ${
          status.kind === "live" ? "bg-danger text-white" : "bg-ink/10 text-ink-muted"
        }`}
      >
        {status.kind === "live" && (
          <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" />
        )}
        {statusText}
      </span>
      {tickerExtras(game, showOdds).map((extra) => (
        <span key={extra} className="shrink-0 text-[11.5px] text-ink-subtle">
          {extra}
        </span>
      ))}
      {channels.length > 0 && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold text-white">
          <Play size={9} fill="currentColor" strokeWidth={0} />
          {quality ?? t("Watch")}
        </span>
      )}
    </>
  );
}
