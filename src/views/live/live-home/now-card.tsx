import { useState } from "react";
import { Play } from "@/components/icons/play-filled";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";
import { channelNumber, fmtLeft } from "./now-format";
import type { NowItem } from "./use-live-home";
import { useAmbientTarget } from "./ambient";
import { ChannelArt, programPicture, useChannelGame } from "./channel-art";

export function NowCard({
  item,
  hydrated,
  onPlay,
}: {
  item: NowItem;
  hydrated?: Meta | null;
  onPlay: (ch: IptvChannel) => void;
}) {
  const t = useT();
  const { channel, current, progress } = item;
  const [logoErr, setLogoErr] = useState(false);
  const game = useChannelGame(channel.id);
  const backdrop = programPicture(item, hydrated);
  // The logo goes in the caption once a picture (not the logo itself) fills the card.
  const art = !!game || !!backdrop;
  const logo = channel.logo && !logoErr ? channel.logo : null;
  const chno = channelNumber(channel.attrs);
  const left = current ? fmtLeft(current.endMs, Date.now(), t) : null;
  const ambient = useAmbientTarget(`ch:${channel.id}`, () => (
    <ChannelArt item={item} hydrated={hydrated} />
  ));

  return (
    <button
      type="button"
      data-art={backdrop || channel.logo || ""}
      onClick={() => onPlay(channel)}
      {...ambient}
      aria-label={t("Play {name}", { name: channel.name })}
      className="group group/now relative flex aspect-[16/9] w-full flex-col justify-end overflow-hidden rounded-lg border border-edge-soft/55 bg-elevated text-start transition-all duration-200 hover:border-edge hover:shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]"
    >
      <ChannelArt item={item} hydrated={hydrated} zoom />
      <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/35 to-transparent" />

      <span className="absolute start-3 top-3 flex h-[22px] items-center gap-1.5 rounded-full bg-canvas/90 px-2.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-danger backdrop-blur">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
        {t("Live")}
      </span>
      <span className="absolute end-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-canvas opacity-0 shadow-[0_4px_14px_rgba(0,0,0,0.4)] transition-all duration-200 group-hover/now:opacity-100">
        <Play size={15} fill="currentColor" />
      </span>

      <div className="relative z-10 flex flex-col gap-1 p-3.5">
        <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-muted">
          {chno && <span className="tabular-nums text-ink-subtle">{chno}</span>}
          {art && logo && (
            <img
              src={logo}
              alt=""
              draggable={false}
              onError={() => setLogoErr(true)}
              className="h-4 w-auto max-w-[52px] object-contain"
            />
          )}
          <span className="truncate">{channel.name}</span>
        </div>
        <div dir="auto" className="truncate text-[14.5px] font-semibold leading-tight text-ink">
          {current?.title ||
            hydrated?.name ||
            (game ? `${game.away.name} at ${game.home.name}` : null) ||
            channel.group ||
            t("Live channel")}
        </div>
        {progress != null && (
          <div className="mt-1 flex items-center gap-2">
            <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-canvas/55">
              <div
                className="h-full rounded-full bg-danger"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            {left && (
              <span className="shrink-0 text-[10.5px] font-medium text-ink-subtle">{left}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
