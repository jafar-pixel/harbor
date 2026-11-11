import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Heart, Radio, Search, Tv, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { EpgIndex, IptvChannel } from "@/lib/iptv/types";
import { buildNowItem, type NowItem } from "./use-live-home";
import { fmtClock } from "./now-format";
import { REST_TUNE_MS } from "./rest-tune";

export type SurfTab = { key: string; label: string; items: NowItem[] };

/** Search results shown at once; typing more narrows them. */
const SEARCH_MAX = 60;

/** Pressed look shared by the box's buttons: a click (or OK) visibly lands. */
const PRESS =
  "transition-[transform,background-color,color] duration-150 active:scale-[0.96] data-[pressed]:scale-[0.96]";

/**
 * Live TV's channel box, beside Your TV: search, Favorites, Recent and On now, on one row that
 * slides sideways, over a list the remote runs through like a cable box. Resting on a channel
 * puts it on Your TV after a moment; OK (or a click) on the channel already on Your TV opens it
 * full screen.
 */
export function SurfList({
  tabs,
  channels,
  epg,
  tvgCounts,
  tunedId,
  nowMs,
  onTune,
}: {
  tabs: SurfTab[];
  /** Every channel of the provider, for search. */
  channels: readonly IptvChannel[];
  epg: EpgIndex | null;
  tvgCounts: ReadonlyMap<string, number>;
  tunedId: string | null;
  nowMs: number;
  /** Puts a channel on Your TV; on the channel already there, opens it full screen. */
  onTune: (channel: IptvChannel) => void;
}) {
  const t = useT();
  const shown = tabs.filter((tab) => tab.items.length > 0);
  const [tabKey, setTabKey] = useState(shown[0]?.key ?? "");
  // Search is a chip like the tabs: focusing it doesn't start typing; OK opens the box.
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const dwell = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(dwell.current), []);
  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searching || q.length < 2) return [];
    const out: NowItem[] = [];
    for (const c of channels) {
      if (!c.name.toLowerCase().includes(q)) continue;
      out.push(buildNowItem(c, epg, tvgCounts, nowMs));
      if (out.length >= SEARCH_MAX) break;
    }
    return out;
  }, [searching, query, channels, epg, tvgCounts, nowMs]);

  const tab = shown.find((x) => x.key === tabKey) ?? shown[0];
  const list = searching ? results : (tab?.items ?? []);

  const icon = (key: string) =>
    key === "fav" ? (
      <Heart size={14} />
    ) : key === "recent" ? (
      <Clock size={14} />
    ) : (
      <Radio size={14} />
    );
  const chip = (on: boolean) =>
    `flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[12.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white/85 ${PRESS} ${
      on ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20"
    }`;

  return (
    <aside
      aria-label={t("Surf channels")}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/35 backdrop-blur-xl"
    >
      <div
        role="tablist"
        className="flex shrink-0 gap-1.5 overflow-x-auto p-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {searching ? (
          <form
            role="search"
            className="flex h-9 min-w-[220px] flex-1 items-center gap-2 rounded-full bg-white/15 px-3"
            onSubmit={(e) => e.preventDefault()}
          >
            <Search size={14} className="shrink-0 text-white/70" />
            <input
              ref={input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSearching(false);
                  setQuery("");
                }
              }}
              placeholder={t("Search {n} channels", { n: channels.length })}
              aria-label={t("Search channels")}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-white placeholder:text-white/50 focus:outline-none"
            />
            <button
              type="button"
              aria-label={t("Close search")}
              onClick={() => {
                setSearching(false);
                setQuery("");
              }}
              className={`grid size-7 shrink-0 place-items-center rounded-full text-white/70 hover:text-white ${PRESS}`}
            >
              <X size={14} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            aria-label={t("Search channels")}
            onClick={() => setSearching(true)}
            className={chip(false)}
          >
            <Search size={14} />
            {t("Search")}
          </button>
        )}
        {shown.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={!searching && x.key === tab?.key}
            onClick={() => {
              setSearching(false);
              setTabKey(x.key);
            }}
            onFocus={() => {
              if (!searching) setTabKey(x.key);
            }}
            className={chip(!searching && x.key === tab?.key)}
          >
            {icon(x.key)}
            {x.label}
          </button>
        ))}
      </div>
      <ul className="harbor-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {searching && query.trim().length >= 2 && results.length === 0 && (
          <li className="px-3 py-6 text-center text-[13px] text-white/60">
            {t("No channels match.")}
          </li>
        )}
        {list.map((it) => {
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
                    dwell.current = window.setTimeout(() => onTune(it.channel), REST_TUNE_MS);
                }}
                onBlur={() => window.clearTimeout(dwell.current)}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-white/85 ${PRESS} ${
                  on ? "bg-white/15" : "hover:bg-white/10 focus-visible:bg-white/10"
                }`}
              >
                <ChannelLogo channel={it.channel} />
                <span className="min-w-0 flex-1">
                  <span
                    dir="auto"
                    className="block truncate text-[13.5px] font-semibold text-white"
                  >
                    {it.current?.title ?? it.channel.name}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-[12px] text-white/60">
                    {on && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />}
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

/** The channel's own logo; a TV glyph when the provider has none. */
function ChannelLogo({ channel }: { channel: IptvChannel }) {
  const [err, setErr] = useState(false);
  return (
    <span className="flex h-11 w-16 shrink-0 items-center justify-center rounded-lg bg-white/10">
      {channel.logo && !err ? (
        <img
          src={channel.logo}
          alt=""
          loading="lazy"
          draggable={false}
          onError={() => setErr(true)}
          className="max-h-8 max-w-[52px] object-contain"
        />
      ) : (
        <Tv size={18} className="text-white/60" />
      )}
    </span>
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
      <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
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
