import { useEffect, useState } from "react";
import { BellRing, Star, Tv, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";
import { isPicked, toggleTodayPick, useTodayPicks } from "@/lib/iptv/today-picks";
import { useLiveToday } from "@/lib/jl/sports/live-today-store";
import type { PlayerSrc } from "@/lib/view";

/**
 * Today's games beside a live channel, like Next Episodes beside a show: the channels the viewer
 * starred for today, one click away, and a star to add the one playing now.
 */
export function TodayPicksPanel({
  src,
  channelId,
  chromeVisible,
  onSwitch,
}: {
  src: PlayerSrc;
  channelId: string | null;
  chromeVisible: boolean;
  onSwitch: (channel: IptvChannel, program?: string) => void;
}) {
  const t = useT();
  const picks = useTodayPicks();
  // Today's games from the Sports Hub, with scores; only the ones a provider carries can switch.
  const liveToday = useLiveToday().filter((r) => r.channel);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!channelId) return null;

  const current: IptvChannel = {
    id: channelId,
    tvgId: null,
    name: src.meta.name ?? src.title,
    logo: src.meta.logo ?? null,
    group: src.subtitle ?? null,
    url: src.url,
    catchupSource: null,
    durationSec: null,
    attrs: {},
  };
  const starred = isPicked(picks, channelId);

  if (!open) {
    if (!chromeVisible) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute end-0 top-1/2 z-[150] flex -translate-y-1/2 items-center gap-2 rounded-s-full bg-black/60 py-3 pe-3 ps-4 text-[13px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/80"
      >
        <Star size={15} fill={picks.length ? "currentColor" : "none"} />
        {t("Today's games")}
        {picks.length > 0 && <span className="tabular-nums text-white/70">{picks.length}</span>}
      </button>
    );
  }

  return (
    <aside
      aria-label={t("Today's games")}
      className="pointer-events-auto absolute bottom-28 end-4 top-20 z-[150] flex w-[340px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/75 text-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl animate-menu-pop"
    >
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <h2 className="flex-1 text-[15px] font-semibold">{t("Today's games")}</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("Close")}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
        >
          <X size={16} />
        </button>
      </header>
      <button
        type="button"
        onClick={() => toggleTodayPick(current, src.liveProgram ?? current.name)}
        aria-pressed={starred}
        className="mx-3 mt-3 flex h-10 items-center justify-center gap-2 rounded-full bg-white/10 text-[13px] font-semibold transition-colors hover:bg-white/20"
      >
        <Star size={15} fill={starred ? "currentColor" : "none"} />
        {starred ? t("Remove this channel from today") : t("Add this channel to today")}
      </button>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {liveToday.length > 0 && (
          <>
            <h3 className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
              {t("Live Today")}
            </h3>
            {liveToday.map((r) => {
              const playing = r.channel!.id === channelId;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => !playing && onSwitch(r.channel!, r.title)}
                  aria-current={playing || undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors ${
                    playing ? "bg-white/15" : "hover:bg-white/10"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-[13.5px] font-semibold">
                      {r.title}
                    </span>
                    <span className="block truncate text-[12px] text-white/60">
                      {r.reminded && <BellRing size={11} className="me-1 inline align-[-1px]" />}
                      {r.live && <span className="me-1 text-danger">●</span>}
                      {[r.score, r.detail].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
            {picks.length > 0 && (
              <h3 className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
                {t("Starred")}
              </h3>
            )}
          </>
        )}
        {picks.length === 0 && liveToday.length === 0 && (
          <p className="px-2 py-6 text-center text-[13px] leading-relaxed text-white/65">
            {t(
              "Star games in Sports or here while you watch. They stay until midnight, since game channels change every day.",
            )}
          </p>
        )}
        {picks.map((p) => {
          const playing = p.channel.id === channelId;
          return (
            <button
              key={p.channel.id}
              type="button"
              onClick={() => !playing && onSwitch(p.channel, p.title)}
              aria-current={playing || undefined}
              className={`flex items-center gap-3 rounded-xl p-2 text-start transition-colors ${
                playing ? "bg-white/15" : "hover:bg-white/10"
              }`}
            >
              <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-lg bg-white/10">
                {p.channel.logo ? (
                  <img
                    src={p.channel.logo}
                    alt=""
                    draggable={false}
                    className="max-h-8 max-w-[52px] object-contain"
                  />
                ) : (
                  <Tv size={18} className="text-white/60" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-[13.5px] font-semibold">
                  {p.title}
                </span>
                <span className="block truncate text-[12px] text-white/60">
                  {playing ? t("Playing now") : p.channel.name}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
