import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlaylistMutations } from "./live/hooks/use-playlist-mutations";
import { useLiveActions } from "./live/hooks/use-live-actions";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { usePlaylists } from "@/lib/iptv/playlists-store";
import { useScrollMemory, useView } from "@/lib/view";
import { useFavorites } from "@/lib/iptv/favorites";
import { clearPlaylistCache, getCachedPlaylist } from "@/lib/iptv/store";
import {
  ACTIVE_SOURCE_EVENT,
  readActiveId,
  REFRESH_SOURCE_EVENT,
  toPlaylistSource,
  writeActiveId,
} from "@/lib/iptv/active-source";
import type { IptvChannel, IptvPlaylistSource } from "@/lib/iptv/types";
import { ErrorBlock } from "./live/channel-grid";
import { GridSkeleton } from "./live/skeletons";
import { PlaylistEmpty } from "./live/playlist-empty";
import { LiveHome } from "./live/live-home";
import { useAllPlaylists } from "./live/hooks/use-all-playlists";
import { useChannelPipeline } from "./live/hooks/use-channel-pipeline";
import { useEpg, useNowTick } from "./live/hooks/use-epg";
import { useXtreamEpgFallback } from "./live/hooks/use-xtream-epg-fallback";
import { useIptvPlaylist } from "./live/hooks/use-iptv-playlist";

const EMPTY_CHANNELS: IptvChannel[] = [];

/**
 * Live TV is one page: Your TV, the channel box beside it and the rows below (live-home.tsx).
 * There's no toolbar; the provider, refresh and playlists are managed in Settings › Live TV,
 * which tells this page through ACTIVE_SOURCE_EVENT and REFRESH_SOURCE_EVENT.
 */
export function LiveView({ active }: { active: boolean }) {
  const t = useT();
  const { settings } = useSettings();
  const { setView } = useView();
  const sources = usePlaylists();

  const [activeId, setActiveId] = useState<string | null>(() => readActiveId());
  useEffect(() => {
    if (sources.length === 0) {
      if (activeId !== null) {
        setActiveId(null);
        writeActiveId(null);
      }
      return;
    }
    if (!activeId || !sources.find((s) => s.id === activeId)) {
      const fallback = sources[0]?.id ?? null;
      setActiveId(fallback);
      writeActiveId(fallback);
    }
  }, [sources, activeId]);
  // Settings › Live TV picks the provider.
  useEffect(() => {
    const onActive = () => setActiveId(readActiveId());
    window.addEventListener(ACTIVE_SOURCE_EVENT, onActive);
    return () => window.removeEventListener(ACTIVE_SOURCE_EVENT, onActive);
  }, []);

  const activeSource: IptvPlaylistSource | null = useMemo(() => {
    if (!activeId) return null;
    const found = sources.find((s) => s.id === activeId);
    return found ? toPlaylistSource(found) : null;
  }, [activeId, sources]);

  const { state, refresh } = useIptvPlaylist(active ? activeSource : null);
  const cachedForActive = getCachedPlaylist(activeSource?.id ?? "");
  const playlist =
    state.kind === "ready"
      ? state.playlist
      : cachedForActive && cachedForActive.id === activeId
        ? cachedForActive
        : null;
  // Settings › Live TV › Refresh.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    const onRefresh = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (!id || id !== activeId) return;
      clearPlaylistCache(id);
      refreshRef.current();
    };
    window.addEventListener(REFRESH_SOURCE_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_SOURCE_EVENT, onRefresh);
  }, [activeId]);

  const epgOnlyUrls = useMemo(
    () => sources.filter((s) => s.kind === "epg").map((s) => s.epgUrl || s.url),
    [sources],
  );
  const { index: baseEpg, error: epgError } = useEpg(active ? activeSource : null, epgOnlyUrls);
  const [epgErrorHidden, setEpgErrorHidden] = useState<string | null>(null);
  const epgErrorShown = epgError && epgError !== epgErrorHidden ? epgError : null;
  const epg = useXtreamEpgFallback(activeSource, playlist?.channels ?? EMPTY_CHANNELS, baseEpg);
  const nowMs = useNowTick(30_000);

  const favorites = useFavorites();

  useEffect(() => {
    if (!active) return;
    const onLocalBack = (e: Event) => {
      if (sources.length === 0) {
        e.preventDefault();
        setView("home");
      }
    };
    window.addEventListener("harbor:local-back", onLocalBack);
    return () => window.removeEventListener("harbor:local-back", onLocalBack);
  }, [active, setView, sources.length]);

  const region = settings.region || "US";
  const preferredLanguages =
    settings.preferredLanguages.length > 0 ? settings.preferredLanguages : ["English"];

  const allSources = useMemo<IptvPlaylistSource[]>(
    () =>
      sources
        .filter((p) => (p.kind ?? "m3u") !== "epg")
        .map((p) => ({
          id: p.id,
          name: p.name,
          url: p.url,
          epgUrl: p.epgUrl,
          kind: p.kind,
          xtream: p.xtream,
        })),
    [sources],
  );
  const allPlaylists = useAllPlaylists(allSources, false);

  const { shownChannels } = useChannelPipeline({
    playlist,
    region,
    preferredLanguages,
    mode: "home",
    group: null,
    query: "",
    favorites,
    allPlaylists,
    allSources,
  });

  const selectActive = useCallback((id: string | null) => {
    setActiveId(id);
    writeActiveId(id);
  }, []);
  const { addPlaylist } = usePlaylistMutations({
    activeId,
    setActiveId: selectActive,
    refresh,
  });

  const { handlePlay } = useLiveActions({ epg, activeId, playlist });

  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollMemory("live", scrollRef, active);

  if (sources.length === 0) {
    return (
      <main data-live-page className="media-start-scroll pt-24">
        <PlaylistEmpty onSave={(entry) => addPlaylist(entry)} />
      </main>
    );
  }

  return (
    <main data-rail-flush data-live-page className="relative flex min-h-0 flex-1 pt-20">
      <div className="flex min-w-0 flex-1 flex-col">
        {epgErrorShown && !epg && (
          <div className="mx-6 mt-2 flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 py-2 pe-2 ps-4 text-[12.5px] text-ink-muted">
            <span className="font-semibold text-danger">{t("EPG failed:")}</span>
            <span className="min-w-0 flex-1 truncate" title={epgErrorShown}>
              {epgErrorShown}
            </span>
            <button
              type="button"
              onClick={() => setEpgErrorHidden(epgErrorShown)}
              aria-label={t("Dismiss")}
              title={t("Dismiss")}
              className="grid size-7 shrink-0 place-items-center rounded-md text-ink-subtle transition-colors duration-150 hover:bg-white/[0.08] hover:text-ink active:scale-[0.97]"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>
        )}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-[calc(1.5rem+var(--env-fab-room,0px))]"
        >
          {state.kind === "error" ? (
            <ErrorBlock
              message={state.message}
              onRetry={() => {
                if (activeId) clearPlaylistCache(activeId);
                refresh();
              }}
            />
          ) : state.kind === "loading" && !playlist ? (
            <GridSkeleton />
          ) : (
            playlist && (
              <LiveHome
                channels={shownChannels}
                epg={epg}
                nowMs={nowMs}
                sourceId={activeId ?? ""}
                region={region}
                favorites={favorites}
                active={active}
                onPlay={handlePlay}
              />
            )
          )}
        </div>
      </div>
    </main>
  );
}
