import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  BellRing,
  Bookmark,
  BookmarkCheck,
  Clapperboard,
  List,
  Play,
  Star,
  Trophy,
  Tv,
  X,
} from "lucide-react";
import { nativeTvAvailable, TV_CONTROL_EVENT } from "@/lib/player/native-tv/bridge";
import { useT } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";
import { isPicked, toggleTodayPick, useTodayPicks } from "@/lib/iptv/today-picks";
import { useLiveToday } from "@/lib/jl/sports/live-today-store";
import { cinemetaEnabled, topMovies, topSeries, type Meta } from "@/lib/cinemeta";
import { useContinueWatching } from "@/lib/continue-watching";
import {
  readLocalEntries,
  subscribeWatchlist,
  toggleWatchlist,
  watchlistHas,
} from "@/lib/watchlist";
import { useView, type PlayerSrc } from "@/lib/view";

/** How long the drawer stays up on the TV with no key pressed. */
const TV_IDLE_MS = 15_000;
const POPULAR_COUNT = 15;

export type WatchTab = "games" | "series" | "movie" | "list";

/** One title in a row: enough to show it, save it and open its page. */
type Title = {
  id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
  note?: string;
  /** 0-1 for something already started. */
  progress?: number;
};

const popular: Partial<Record<"movie" | "series", Promise<Title[]>>> = {};

/** What's popular now, asked once per session. */
function loadPopular(type: "movie" | "series"): Promise<Title[]> {
  if (!cinemetaEnabled()) return Promise.resolve([]);
  popular[type] ??= (type === "movie" ? topMovies() : topSeries())
    .then((metas) =>
      metas.slice(0, POPULAR_COUNT).map((m) => ({
        id: m.id,
        type,
        name: m.name,
        poster: m.poster,
        note: m.releaseInfo,
      })),
    )
    .catch(() => {
      delete popular[type];
      return [];
    });
  return popular[type]!;
}

function useWatchlistEntries() {
  const version = useSyncExternalStore(
    subscribeWatchlist,
    () => readLocalEntries().length + ":" + readLocalEntries()[0]?.id,
  );
  return useMemo(() => {
    void version;
    return readLocalEntries()
      .slice()
      .sort((a, b) => b.addedAt - a.addedAt);
  }, [version]);
}

/**
 * "While you watch": other games, shows and movies one press away, without stopping what's on.
 * Games switch the player straight over; a show or movie is saved for later with OK (it never
 * interrupts), or opened with its Watch now button. On the TV the remote's Down opens it and it
 * shows over the picture (native-tv/bridge.ts `data-tv-games`); on the desktop a live channel
 * gets a Today's games tab on the edge of the player.
 */
export function WatchDrawer({
  src,
  channelId,
  live,
  chromeVisible,
  onSwitch,
  onAllChannels,
}: {
  src: PlayerSrc;
  /** The live channel playing, if any. */
  channelId: string | null;
  live: boolean;
  chromeVisible: boolean;
  onSwitch: (channel: IptvChannel, program?: string) => void;
  /** Opens the full channel guide (the player's live list); only for live channels. */
  onAllChannels?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const startTab: WatchTab = live
    ? "games"
    : src.meta.type === "movie"
      ? "movie"
      : src.meta.type === "series"
        ? "series"
        : "games";
  const [tab, setTab] = useState<WatchTab>(startTab);
  const panel = useRef<HTMLElement>(null);
  const picks = useTodayPicks();
  const liveToday = useLiveToday().filter((r) => r.channel);

  useEffect(() => {
    if (!nativeTvAvailable()) return;
    const onControl = (e: Event) => {
      if ((e as CustomEvent<string>).detail === "today-games") {
        setTab(startTab);
        setOpen(true);
      }
    };
    window.addEventListener(TV_CONTROL_EVENT, onControl);
    return () => window.removeEventListener(TV_CONTROL_EVENT, onControl);
  }, [startTab]);

  useEffect(() => {
    if (!open || !nativeTvAvailable()) return;
    const root = document.documentElement;
    root.dataset.tvGames = "1";
    // The remote starts on the first row (the page has the remote while the drawer is open).
    window.requestAnimationFrame(() =>
      (
        panel.current?.querySelector<HTMLElement>("[data-watch-row]:not([aria-current])") ??
        panel.current?.querySelector<HTMLElement>("[data-watch-row]")
      )?.focus(),
    );
    let timer = window.setTimeout(() => setOpen(false), TV_IDLE_MS);
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setOpen(false), TV_IDLE_MS);
    };
    window.addEventListener("keydown", restart, true);
    return () => {
      delete root.dataset.tvGames;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", restart, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // The TV remote's Back closes the drawer, never what is playing behind it (the player's
    // own Back handler would leave the player).
    const onLocalBack = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("harbor:local-back", onLocalBack, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("harbor:local-back", onLocalBack, true);
    };
  }, [open]);

  if (!open) {
    // On the TV the remote's Down (or the bar's button) opens it; the desktop keeps its edge tab
    // for live channels.
    if (!chromeVisible || nativeTvAvailable() || !live) return null;
    return (
      <button
        type="button"
        onClick={() => {
          setTab("games");
          setOpen(true);
        }}
        className="pointer-events-auto absolute end-0 top-1/2 z-[150] flex -translate-y-1/2 items-center gap-2 rounded-s-full bg-black/60 py-3 pe-3 ps-4 text-[13px] font-semibold text-white backdrop-blur transition-colors hover:bg-black/80"
      >
        <Star size={15} fill={picks.length ? "currentColor" : "none"} />
        {t("Today's games")}
        {picks.length > 0 && <span className="tabular-nums text-white/70">{picks.length}</span>}
      </button>
    );
  }

  const tabs: Array<{ id: WatchTab; label: string; icon: ReactNode }> = [
    { id: "games", label: t("Games"), icon: <Trophy size={15} /> },
    { id: "series", label: t("Shows"), icon: <Tv size={15} /> },
    { id: "movie", label: t("Movies"), icon: <Clapperboard size={15} /> },
    { id: "list", label: t("My list"), icon: <Bookmark size={15} /> },
  ];

  return (
    <aside
      ref={panel}
      aria-label={t("While you watch")}
      className="pointer-events-auto absolute bottom-6 end-4 top-6 z-[150] flex w-[440px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-3xl border border-white/10 bg-black/75 text-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] backdrop-blur-2xl animate-menu-pop"
    >
      <header className="flex items-center gap-3 px-5 pb-2 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-bold">{t("While you watch")}</h2>
          <p className="truncate text-[12px] text-white/60">
            <span className="me-1 inline-block h-2 w-2 rounded-full bg-accent align-middle" />
            {t("Still playing:")} {src.meta.name ?? src.title}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("Close")}
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 focus-visible:bg-white/15 focus-visible:outline-none"
        >
          <X size={17} />
        </button>
      </header>
      <div role="tablist" className="flex gap-1.5 px-4 pb-3">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            onFocus={() => setTab(x.id)}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
              tab === x.id ? "bg-white text-black" : "bg-white/10 text-white/80 hover:bg-white/20"
            }`}
          >
            {x.icon}
            {x.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
        {tab === "games" ? (
          <GamesTab
            src={src}
            channelId={channelId}
            picks={picks}
            liveToday={liveToday}
            onSwitch={onSwitch}
            onAllChannels={
              onAllChannels
                ? () => {
                    setOpen(false);
                    onAllChannels();
                  }
                : undefined
            }
          />
        ) : tab === "list" ? (
          <ListTab />
        ) : (
          <TitlesTab key={tab} type={tab} currentId={src.meta.id} />
        )}
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
      {children}
    </h3>
  );
}

/** A row's button; `grow` when it shares its line with a Watch now button. */
const rowClass = (current = false, grow = false) =>
  `flex min-w-0 ${grow ? "flex-1" : "shrink-0"} items-center gap-3 rounded-2xl p-2 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
    current ? "bg-white/15" : "hover:bg-white/10 focus-visible:bg-white/10"
  }`;

function GamesTab({
  src,
  channelId,
  picks,
  liveToday,
  onSwitch,
  onAllChannels,
}: {
  src: PlayerSrc;
  channelId: string | null;
  picks: ReturnType<typeof useTodayPicks>;
  liveToday: ReturnType<typeof useLiveToday>;
  onSwitch: (channel: IptvChannel, program?: string) => void;
  onAllChannels?: () => void;
}) {
  const t = useT();
  const current: IptvChannel | null = channelId
    ? {
        id: channelId,
        tvgId: null,
        name: src.meta.name ?? src.title,
        logo: src.meta.logo ?? null,
        group: src.subtitle ?? null,
        url: src.url,
        catchupSource: null,
        durationSec: null,
        attrs: {},
      }
    : null;
  const starred = current ? isPicked(picks, current.id) : false;
  return (
    <>
      {(current || onAllChannels) && (
        <div className="flex gap-2 px-1 pt-1">
          {current && (
            <button
              type="button"
              onClick={() => toggleTodayPick(current, src.liveProgram ?? current.name)}
              aria-pressed={starred}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-[12.5px] font-semibold transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <Star size={15} fill={starred ? "currentColor" : "none"} />
              {starred ? t("Starred for today") : t("Star this channel")}
            </button>
          )}
          {onAllChannels && (
            <button
              type="button"
              onClick={onAllChannels}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-white/10 text-[12.5px] font-semibold transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            >
              <List size={15} />
              {t("All channels")}
            </button>
          )}
        </div>
      )}
      {liveToday.length > 0 && <SectionTitle>{t("Live Today")}</SectionTitle>}
      {liveToday.map((r) => {
        const playing = r.channel!.id === channelId;
        return (
          <button
            key={r.key}
            type="button"
            data-watch-row
            onClick={() => !playing && onSwitch(r.channel!, r.title)}
            aria-current={playing || undefined}
            className={rowClass(playing)}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
              {r.live ? (
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
              ) : (
                <Trophy size={18} className="text-white/60" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span dir="auto" className="block truncate text-[14px] font-semibold">
                {r.title}
              </span>
              <span className="block truncate text-[12px] text-white/65">
                {r.reminded && <BellRing size={11} className="me-1 inline align-[-1px]" />}
                {playing
                  ? t("Playing now")
                  : [r.score, r.detail, r.channel!.name].filter(Boolean).join(" · ")}
              </span>
            </span>
          </button>
        );
      })}
      {picks.length > 0 && <SectionTitle>{t("Starred")}</SectionTitle>}
      {picks.map((p) => {
        const playing = p.channel.id === channelId;
        return (
          <button
            key={p.channel.id}
            type="button"
            data-watch-row
            onClick={() => !playing && onSwitch(p.channel, p.title)}
            aria-current={playing || undefined}
            className={rowClass(playing)}
          >
            <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl bg-white/10">
              {p.channel.logo ? (
                <img
                  src={p.channel.logo}
                  alt=""
                  draggable={false}
                  className="max-h-9 max-w-[56px] object-contain"
                />
              ) : (
                <Tv size={18} className="text-white/60" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span dir="auto" className="block truncate text-[14px] font-semibold">
                {p.title}
              </span>
              <span className="block truncate text-[12px] text-white/65">
                {playing ? t("Playing now") : p.channel.name}
              </span>
            </span>
          </button>
        );
      })}
      {picks.length === 0 && liveToday.length === 0 && (
        <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-white/65">
          {t(
            "Star games in Sports or here while you watch. They stay until midnight, since game channels change every day.",
          )}
        </p>
      )}
    </>
  );
}

function TitlesTab({ type, currentId }: { type: "movie" | "series"; currentId?: string }) {
  const t = useT();
  const started = useContinueWatching(currentId, 12)
    .filter((c) => c.type === type)
    .map((c): Title => ({
      id: c.id,
      type: c.type,
      name: c.name,
      poster: c.poster,
      note: c.season != null && c.episode != null ? `S${c.season} · E${c.episode}` : undefined,
      progress: c.progress,
    }));
  const [top, setTop] = useState<Title[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadPopular(type).then((list) => live && setTop(list));
    return () => {
      live = false;
    };
  }, [type]);
  const startedIds = new Set(started.map((s) => s.id));
  const popularNow = (top ?? []).filter((x) => !startedIds.has(x.id) && x.id !== currentId);
  return (
    <>
      {started.length > 0 && <SectionTitle>{t("Continue watching")}</SectionTitle>}
      {started.map((x) => (
        <TitleRow key={x.id} title={x} />
      ))}
      <SectionTitle>{type === "movie" ? t("Popular movies") : t("Popular shows")}</SectionTitle>
      {top === null ? (
        <p className="px-3 py-4 text-[13px] text-white/55">{t("Loading…")}</p>
      ) : popularNow.length === 0 ? (
        <p className="px-3 py-4 text-[13px] text-white/55">{t("Nothing to show right now.")}</p>
      ) : (
        popularNow.map((x) => <TitleRow key={x.id} title={x} />)
      )}
    </>
  );
}

function ListTab() {
  const t = useT();
  const entries = useWatchlistEntries();
  if (!entries.length) {
    return (
      <p className="px-3 py-6 text-center text-[13px] leading-relaxed text-white/65">
        {t("Shows and movies you save for later show up here. Press OK on one to save it.")}
      </p>
    );
  }
  return (
    <>
      <SectionTitle>{t("Saved for later")}</SectionTitle>
      {entries.map((e) => (
        <TitleRow key={e.id} title={{ id: e.id, type: e.type, name: e.name, poster: e.poster }} />
      ))}
    </>
  );
}

/**
 * A show or movie. OK (the row) saves it for later or takes it off the list, which never stops
 * what's playing; Watch now (to its right) leaves the player and opens the title's page.
 */
function TitleRow({ title }: { title: Title }) {
  const t = useT();
  const { openMeta, exitPlayer } = useView();
  const saved = useSyncExternalStore(subscribeWatchlist, () => watchlistHas(title.id));
  const meta: Meta = {
    id: title.id,
    type: title.type,
    name: title.name,
    poster: title.poster,
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        data-watch-row
        aria-pressed={saved}
        onClick={() => toggleWatchlist({ ...meta })}
        className={rowClass(false, true)}
      >
        <span className="relative h-[60px] w-10 shrink-0 overflow-hidden rounded-lg bg-white/10">
          {title.poster && (
            <img
              src={title.poster}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover"
            />
          )}
          {title.progress != null && title.progress > 0 && (
            <span className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
              <span
                className="block h-full bg-accent"
                style={{ width: `${Math.min(100, Math.round(title.progress * 100))}%` }}
              />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-[14px] font-semibold">
            {title.name}
          </span>
          <span className="flex items-center gap-1 truncate text-[12px] text-white/65">
            {saved ? (
              <>
                <BookmarkCheck size={12} className="text-accent" />
                {t("Saved for later")}
              </>
            ) : (
              <>
                <Bookmark size={12} />
                {title.note ? `${title.note} · ` : ""}
                {t("OK to save for later")}
              </>
            )}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          exitPlayer();
          openMeta(meta);
        }}
        aria-label={`${t("Watch now")}: ${title.name}`}
        title={t("Watch now")}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/25 focus-visible:bg-white focus-visible:text-black focus-visible:outline-none"
      >
        <Play size={17} fill="currentColor" />
      </button>
    </div>
  );
}
