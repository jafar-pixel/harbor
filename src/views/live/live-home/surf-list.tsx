import { useEffect, useRef, useState } from "react";
import { Clock, Heart, Radio } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";
import { hydrationKey, type NowItem } from "./use-live-home";
import { ChannelArt } from "./channel-art";
import { fmtClock } from "./now-format";

/** How long the remote rests on a channel before Your TV switches to it. */
const PREVIEW_DWELL_MS = 900;

export type SurfTab = { key: string; label: string; items: NowItem[] };

/**
 * Live TV Home's channel surfer, beside Your TV: Favorites, Recent and On now as lists the remote
 * runs through like a cable box. Resting on a channel puts it on Your TV after a moment; OK (or a
 * click) on the channel already on Your TV opens it full screen.
 */
export function SurfList({
  tabs,
  tunedId,
  nowMs,
  hydrations,
  onTune,
}: {
  tabs: SurfTab[];
  /** Program art for the channels (Cinemeta), by `hydrationKey`. */
  hydrations: ReadonlyMap<string, Meta | null>;
  tunedId: string | null;
  nowMs: number;
  /** Puts a channel on Your TV; on the channel already there, opens it full screen. */
  onTune: (channel: IptvChannel) => void;
}) {
  const t = useT();
  const shown = tabs.filter((tab) => tab.items.length > 0);
  const [tabKey, setTabKey] = useState(shown[0]?.key ?? "");
  const tab = shown.find((x) => x.key === tabKey) ?? shown[0];
  const dwell = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(dwell.current), []);
  if (!tab) return null;

  const icon = (key: string) =>
    key === "fav" ? (
      <Heart size={14} />
    ) : key === "recent" ? (
      <Clock size={14} />
    ) : (
      <Radio size={14} />
    );

  return (
    <aside
      aria-label={t("Surf channels")}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/35 backdrop-blur-xl"
    >
      <div role="tablist" className="flex gap-1.5 p-2.5">
        {shown.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={x.key === tab.key}
            onClick={() => setTabKey(x.key)}
            onFocus={() => setTabKey(x.key)}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/85 ${
              x.key === tab.key
                ? "bg-white text-black"
                : "bg-white/10 text-white/80 hover:bg-white/20"
            }`}
          >
            {icon(x.key)}
            {x.label}
          </button>
        ))}
      </div>
      <ul className="harbor-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {tab.items.map((it) => {
          const on = it.channel.id === tunedId;
          const left = it.current
            ? Math.max(0, Math.round((it.current.endMs - nowMs) / 60000))
            : null;
          return (
            <li key={it.channel.id}>
              <button
                type="button"
                aria-current={on || undefined}
                onClick={() => onTune(it.channel)}
                onFocus={() => {
                  // Surfing: the channel goes on Your TV once the remote rests on it.
                  window.clearTimeout(dwell.current);
                  if (!on)
                    dwell.current = window.setTimeout(() => onTune(it.channel), PREVIEW_DWELL_MS);
                }}
                onBlur={() => window.clearTimeout(dwell.current)}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/85 ${
                  on ? "bg-white/15" : "hover:bg-white/10 focus-visible:bg-white/10"
                }`}
              >
                <span className="relative h-[52px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-white/10">
                  <ChannelArt item={it} hydrated={hydrations.get(hydrationKey(it)) ?? null} />
                  {it.channel.logo && (
                    <span className="absolute bottom-1 end-1 flex h-[18px] max-w-[46px] items-center rounded bg-black/60 px-1 backdrop-blur-sm">
                      <img
                        src={it.channel.logo}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="max-h-3.5 max-w-full object-contain"
                      />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    dir="auto"
                    className="block truncate text-[13.5px] font-semibold text-white"
                  >
                    {it.current?.title ?? it.channel.name}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-[12px] text-white/60">
                    {on && (
                      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-danger" />
                    )}
                    <span className="truncate">{it.channel.name}</span>
                    {left != null && (
                      <span className="shrink-0 tabular-nums">· {t("{n}m left", { n: left })}</span>
                    )}
                  </span>
                  {it.progress != null && (
                    <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-white/15">
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{
                          width: `${Math.round(Math.min(1, Math.max(0, it.progress)) * 100)}%`,
                        }}
                      />
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/** The slim bar under Your TV: what's on now, how long is left, and what's next. */
export function NowNextBar({ item, nowMs }: { item: NowItem | null; nowMs: number }) {
  const t = useT();
  if (!item) return null;
  const { channel, current, next, progress } = item;
  const left = current ? Math.max(0, Math.round((current.endMs - nowMs) / 60000)) : null;
  return (
    <div className="flex min-w-0 items-center gap-4 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-danger" />
      <div className="min-w-0 flex-1">
        <p dir="auto" className="truncate text-[15px] font-semibold text-white">
          {current?.title ?? channel.name}
        </p>
        <p className="truncate text-[12.5px] text-white/60">
          {channel.name}
          {current && ` · ${fmtClock(current.startMs)} – ${fmtClock(current.endMs)}`}
          {left != null && ` · ${t("{n}m left", { n: left })}`}
        </p>
        {progress != null && (
          <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-white/15">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
            />
          </span>
        )}
      </div>
      {next && (
        <div className="hidden min-w-0 max-w-[40%] shrink text-end sm:block">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
            {t("Next")} · {fmtClock(next.startMs)}
          </p>
          <p dir="auto" className="truncate text-[13.5px] text-white/80">
            {next.title}
          </p>
        </div>
      )}
    </div>
  );
}
