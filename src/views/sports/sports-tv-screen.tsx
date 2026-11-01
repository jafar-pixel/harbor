import { useEffect, useRef, useState } from "react";
import { Play, Star, Tv } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";
import { isPicked, toggleTodayPick, useTodayPicks } from "@/lib/iptv/today-picks";
import { sourceIdOf } from "@/lib/jl/sports/sports-channels";
import { useView } from "@/lib/view";
import { usePageVisible } from "@/lib/visibility";
import { MultiPlayer } from "@/views/multiview/multi-player";
import { useNativeSmallTv } from "@/lib/player/native-tv/small-screen";
import { TvVolumeControls, useTvVolume } from "@/views/live/tv-volume";
import type { SportsTvTuned } from "./sports-tv-tuner";

/** How long the overlay stays up after the mouse last moved over a playing screen. */
const OVERLAY_IDLE_MS = 2500;

/**
 * The Sports TV screen: the tuned feed playing live with sound controls, a provider switch when
 * the game is on more than one, a star for today's games, and Watch (or a double click) for the
 * full player. It stops while the full player is open, the page is hidden or Sports isn't on
 * screen, since many IPTV accounts allow one stream at a time.
 */
export function SportsTvScreen({
  tuned,
  active,
  sourceNames,
  emptyText,
  onWatch,
}: {
  tuned: SportsTvTuned | null;
  active: boolean;
  sourceNames: Map<string, string>;
  emptyText: string;
  onWatch: (channel: IptvChannel) => void;
}) {
  const t = useT();
  const { player } = useView();
  const pageVisible = usePageVisible();
  const sound = useTvVolume();
  const picks = useTodayPicks();
  const [sourceIdx, setSourceIdx] = useState(0);
  useEffect(() => setSourceIdx(0), [tuned?.key]);
  const channel = tuned?.channels[sourceIdx] ?? tuned?.channels[0] ?? null;
  const [playing, setPlaying] = useState(false);
  useEffect(() => setPlaying(false), [channel?.id]);
  const showVideo = !!channel?.url && active && pageVisible && !player;
  // On the Shield the TV app's own player plays in this box, and full screen is the same stream.
  const box = useRef<HTMLDivElement>(null);
  const nativeTv = useNativeSmallTv(box, showVideo ? channel : null, showVideo);
  const watch = (c: IptvChannel) => (nativeTv.native ? nativeTv.fullScreen() : onWatch(c));
  useEffect(() => {
    if (nativeTv.playing) setPlaying(true);
  }, [nativeTv.playing]);
  const picked = !!channel && isPicked(picks, channel.id);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  // The overlay hides while the game plays and the mouse is still, and comes back on movement.
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const wake = () => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), OVERLAY_IDLE_MS);
  };
  useEffect(() => {
    wake();
    return () => window.clearTimeout(idleTimer.current);
  }, [channel?.id]);
  const overlayHidden = idle && playing;

  return (
    <div
      ref={box}
      onDoubleClick={() => channel && watch(channel)}
      onMouseMove={wake}
      onMouseLeave={() => setIdle(true)}
      onFocus={wake}
      className={`relative h-full min-h-0 w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] ${overlayHidden ? "cursor-none" : "cursor-pointer"}`}
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
      {showVideo && channel && !nativeTv.native && (
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
      {!tuned && (
        <p className="absolute inset-x-8 top-[62%] text-center text-[14px] leading-relaxed text-white/75">
          {emptyText}
        </p>
      )}
      {tuned && !channel && (
        <p className="absolute inset-x-8 top-[62%] text-center text-[14px] leading-relaxed text-white/75">
          {t("None of your providers lists a channel for this game yet.")}
        </p>
      )}
      {tuned && (
        <div
          className={`absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-14 transition-opacity duration-300 ${overlayHidden ? "pointer-events-none opacity-0" : "opacity-100"}`}
        >
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium text-white/75">
              {tuned.live && (
                <span className="me-2 rounded bg-danger px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                  {t("Live")}
                </span>
              )}
              {tuned.subtitle ?? channel?.name}
            </p>
            <h3 dir="auto" className="truncate text-[18px] font-semibold text-white">
              {tuned.title}
            </h3>
          </div>
          {channel && (
            <div className="flex flex-wrap items-center gap-2" onDoubleClick={stop}>
              {tuned.channels.length > 1 && (
                <select
                  value={sourceIdx}
                  onChange={(e) => setSourceIdx(Number(e.target.value))}
                  onClick={stop}
                  aria-label={t("Provider")}
                  className="h-10 max-w-[40%] truncate rounded-full border border-white/15 bg-black/45 px-3 text-[12.5px] font-semibold text-white outline-none backdrop-blur"
                >
                  {tuned.channels.map((c, i) => (
                    <option key={c.id} value={i}>
                      {`${sourceNames.get(sourceIdOf(c.id)) ?? t("Provider {n}", { n: i + 1 })} · ${c.name}`}
                    </option>
                  ))}
                </select>
              )}
              <div className="ms-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    toggleTodayPick(channel, tuned.title);
                  }}
                  aria-pressed={picked}
                  aria-label={picked ? t("Remove from today's games") : t("Add to today's games")}
                  title={t("Today's games stay until midnight")}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur transition-colors hover:bg-black/65"
                >
                  <Star size={17} fill={picked ? "currentColor" : "none"} />
                </button>
                <TvVolumeControls />
                <button
                  type="button"
                  onClick={(e) => {
                    stop(e);
                    watch(channel);
                  }}
                  className="jl-cta flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13.5px] font-semibold text-black"
                >
                  <Play size={15} fill="currentColor" /> {t("Watch")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
