import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { usePlaylists } from "@/lib/iptv/playlists-store";
import { clearPlaylistCache, getCachedPlaylist, subscribePlaylists } from "@/lib/iptv/store";
import {
  ACTIVE_SOURCE_EVENT,
  readActiveId,
  requestSourceRefresh,
  writeActiveId,
} from "@/lib/iptv/active-source";
import type { IptvPlaylistSource } from "@/lib/iptv/types";
import { SourcePicker } from "@/views/live/source-picker";
import { usePlaylistMutations } from "@/views/live/hooks/use-playlist-mutations";
import { useLiveActions } from "@/views/live/hooks/use-live-actions";
import { Section } from "../shared";
import { SettingRow } from "../kit";

/**
 * Settings › Library › Live TV: which provider Live TV shows, refreshing its channels, and
 * adding, editing or removing playlists. Live TV itself has no toolbar; it follows what is
 * picked here (ACTIVE_SOURCE_EVENT) and refetches when asked (REFRESH_SOURCE_EVENT).
 */
export function LiveTvTab() {
  const t = useT();
  const sources = usePlaylists();
  const [activeId, setActiveIdState] = useState<string | null>(() => readActiveId());
  const [version, setVersion] = useState(0);
  useEffect(() => subscribePlaylists(() => setVersion((v) => v + 1)), []);
  useEffect(() => {
    const onActive = () => setActiveIdState(readActiveId());
    window.addEventListener(ACTIVE_SOURCE_EVENT, onActive);
    return () => window.removeEventListener(ACTIVE_SOURCE_EVENT, onActive);
  }, []);

  const managed = useMemo<IptvPlaylistSource[]>(
    () =>
      sources.map((p) => ({
        id: p.id,
        name: p.name,
        url: p.url,
        epgUrl: p.epgUrl,
        kind: p.kind,
        xtream: p.xtream,
      })),
    [sources],
  );
  const shownId = activeId ?? managed.find((s) => (s.kind ?? "m3u") !== "epg")?.id ?? null;
  const cached = useMemo(() => {
    void version;
    return shownId ? getCachedPlaylist(shownId) : null;
  }, [shownId, version]);

  const setActive = useCallback((id: string | null) => {
    setActiveIdState(id);
    writeActiveId(id);
  }, []);
  const refresh = useCallback(() => {
    if (!shownId) return;
    clearPlaylistCache(shownId);
    requestSourceRefresh(shownId);
  }, [shownId]);
  const { addPlaylist, removePlaylist, editPlaylist, reorderPlaylist, movePlaylistTop } =
    usePlaylistMutations({ activeId: shownId, setActiveId: setActive, refresh });
  const { exportPlaylist } = useLiveActions({
    epg: null,
    activeId: shownId,
    playlist: cached ?? null,
  });

  return (
    <Section
      title={t("Live TV")}
      subtitle={t(
        "The provider Live TV shows, and your playlists. Live TV follows what you pick here.",
      )}
    >
      <SettingRow
        wide
        label={t("Provider")}
        desc={t(
          "Pick the provider, refresh its channels, or add, edit and remove playlists (M3U or Xtream).",
        )}
      >
        <SourcePicker
          sources={managed}
          activeId={shownId}
          exportEnabled={!!cached?.channels.length}
          onSelect={(id) => setActive(id)}
          onAdd={addPlaylist}
          onEdit={editPlaylist}
          onRemove={removePlaylist}
          onMove={reorderPlaylist}
          onMoveTop={movePlaylistTop}
          onRefresh={refresh}
          onExport={exportPlaylist}
          fetchedAt={cached?.fetchedAt ?? null}
          channelCount={cached?.channels.length ?? null}
          loading={!!cached?.loading}
        />
      </SettingRow>
    </Section>
  );
}
