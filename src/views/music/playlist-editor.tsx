import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Pin, Plus, Search, Trash2, X } from "lucide-react";
import { searchVideos } from "@/lib/music/dj/api";
import { togglePin, usePins } from "@/lib/music/playlist-pins";
import { connectSpotifyWeb, spotifyCanEdit, useSpotifyWeb } from "@/lib/music/spotify-web/auth";
import { spotifyPlaylistRows, spotifyPlaylists, spotifyProfile } from "@/lib/music/spotify-web/api";
import {
  addSpotifyTracks,
  createSpotifyPlaylist,
  deleteSpotifyPlaylist,
  moveSpotifyTrack,
  removeSpotifyTrack,
  renameSpotifyPlaylist,
  searchSpotifyTracks,
} from "@/lib/music/spotify-web/edit";
import { connectYouTubeWeb, youtubeCanEdit, useYouTubeWeb } from "@/lib/music/youtube-web/auth";
import { youtubePlaylistRows, youtubePlaylists } from "@/lib/music/youtube-web/api";
import {
  addYouTubeVideo,
  createYouTubePlaylist,
  deleteYouTubePlaylist,
  moveYouTubeItem,
  removeYouTubeItem,
  renameYouTubePlaylist,
} from "@/lib/music/youtube-web/edit";
import { useT } from "@/lib/i18n";
import "./playlist-editor.css";

type Service = "spotify" | "youtube";
type List = { id: string; name: string; count: number; image: string | null; mine: boolean };
type Row = {
  key: string;
  title: string;
  artist: string;
  image: string | null;
  uri?: string;
  videoId?: string;
  itemId?: string;
};
type Found = {
  title: string;
  artist: string;
  image: string | null;
  uri?: string;
  videoId?: string;
};

/**
 * Edit your Spotify and YouTube playlists without leaving the app: create, rename and delete
 * playlists, pin favourites, add songs from search, remove them and reorder them by dragging or
 * with the arrows. Every change is saved to the service straight away.
 */
export function PlaylistEditor() {
  const t = useT();
  const spotify = useSpotifyWeb();
  const youtube = useYouTubeWeb();
  const [service, setService] = useState<Service>(
    spotify.connected || !youtube.connected ? "spotify" : "youtube",
  );
  const connected = service === "spotify" ? spotify.connected : youtube.connected;
  const canEdit = service === "spotify" ? spotifyCanEdit() : youtubeCanEdit();
  const pins = usePins(service);
  const [me, setMe] = useState("");
  const [lists, setLists] = useState<List[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const loadLists = async () => {
    setLists(null);
    setError(null);
    try {
      if (service === "spotify") {
        const [profile, all] = await Promise.all([spotifyProfile(), spotifyPlaylists(50)]);
        setMe(profile.id);
        setLists(all.map((p) => ({ ...p, mine: !p.ownerId || p.ownerId === profile.id })));
      } else {
        setLists((await youtubePlaylists()).map((p) => ({ ...p, mine: true })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLists([]);
    }
  };

  const loadRows = async (id: string) => {
    setRows(null);
    try {
      if (service === "spotify") {
        const all = await spotifyPlaylistRows(id);
        setRows(
          all.map((r, i) =>
            r
              ? {
                  key: `${i}:${r.id}`,
                  title: r.title,
                  artist: r.artist,
                  image: r.image,
                  uri: r.uri,
                }
              : { key: `${i}:x`, title: t("Unavailable song"), artist: "", image: null },
          ),
        );
      } else {
        const all = await youtubePlaylistRows(id);
        setRows(all.map((r) => ({ key: r.itemId, ...r })));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    }
  };

  useEffect(() => {
    setOpenId(null);
    setRows(null);
    setFound(null);
    if (connected) void loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, connected]);

  useEffect(() => {
    if (openId) void loadRows(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const sorted = useMemo(() => {
    if (!lists) return null;
    return [...lists].sort((a, b) => {
      const pa = pins.indexOf(a.id);
      const pb = pins.indexOf(b.id);
      if (pa !== pb) return (pa < 0 ? 1e9 : pa) - (pb < 0 ? 1e9 : pb);
      return 0;
    });
  }, [lists, pins]);
  const open = lists?.find((l) => l.id === openId) ?? null;
  const editable = canEdit && !!open?.mine;

  /** Run a change; on failure, show why and reload the truth from the service. */
  const change = async (action: () => Promise<unknown>, reload: "rows" | "lists" | "both") => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if ((reload === "rows" || reload === "both") && openId) void loadRows(openId);
      if (reload === "lists" || reload === "both") void loadLists();
    }
  };

  const allowEditing = () =>
    service === "spotify" ? void connectSpotifyWeb() : void connectYouTubeWeb(true);

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    void change(async () => {
      const made =
        service === "spotify"
          ? await createSpotifyPlaylist(me, name)
          : await createYouTubePlaylist(name);
      setOpenId(made.id);
    }, "lists");
  };

  const rename = (list: List) => {
    const name = window.prompt(t("New name for this playlist"), list.name)?.trim();
    if (!name || name === list.name) return;
    setLists((ls) => ls?.map((l) => (l.id === list.id ? { ...l, name } : l)) ?? ls);
    void change(
      () =>
        service === "spotify"
          ? renameSpotifyPlaylist(list.id, name)
          : renameYouTubePlaylist(list.id, name),
      "lists",
    );
  };

  const remove = (list: List) => {
    if (
      !window.confirm(
        t('Delete "{name}" from your {service}?', {
          name: list.name,
          service: service === "spotify" ? "Spotify" : "YouTube",
        }),
      )
    )
      return;
    setLists((ls) => ls?.filter((l) => l.id !== list.id) ?? ls);
    if (openId === list.id) setOpenId(null);
    void change(
      () =>
        service === "spotify" ? deleteSpotifyPlaylist(list.id) : deleteYouTubePlaylist(list.id),
      "lists",
    );
  };

  const move = (from: number, to: number) => {
    if (!rows || !open || to < 0 || to >= rows.length || from === to) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    setRows(next);
    void change(
      () =>
        service === "spotify"
          ? moveSpotifyTrack(open.id, from, to)
          : moveYouTubeItem(open.id, row.itemId!, row.videoId!, to),
      "rows",
    );
  };

  const drop = (index: number) => {
    const row = rows?.[index];
    if (!row || !open) return;
    setRows((r) => r?.filter((_, i) => i !== index) ?? r);
    void change(
      () =>
        service === "spotify"
          ? removeSpotifyTrack(open.id, row.uri!)
          : removeYouTubeItem(row.itemId!),
      "rows",
    );
  };

  const add = (song: Found) => {
    if (!open) return;
    setRows((r) => [
      ...(r ?? []),
      { key: `new:${Date.now()}`, title: song.title, artist: song.artist, image: song.image },
    ]);
    void change(
      () =>
        service === "spotify"
          ? addSpotifyTracks(open.id, [song.uri!])
          : addYouTubeVideo(open.id, song.videoId!),
      "both",
    );
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setFound(null);
    try {
      setFound(
        service === "spotify"
          ? (await searchSpotifyTracks(q)).map((s) => ({
              title: s.title,
              artist: s.artist,
              image: s.image,
              uri: s.uri,
            }))
          : (await searchVideos(q)).map((v) => ({
              title: v.title,
              artist: v.channel,
              image: v.thumb,
              videoId: v.id,
            })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFound([]);
    }
  };

  return (
    <section className="pl" aria-label={t("Playlists")}>
      <div className="pl-services" role="tablist">
        {(["spotify", "youtube"] as Service[]).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={service === s}
            className={`pl-service${service === s ? " is-on" : ""}`}
            data-service={s}
            onClick={() => setService(s)}
          >
            {s === "spotify" ? "Spotify" : "YouTube"}
          </button>
        ))}
      </div>

      {!connected ? (
        <div className="pl-empty">
          <p>
            {t("Connect your {service} to edit your playlists here.", {
              service: service === "spotify" ? "Spotify" : "YouTube",
            })}
          </p>
          <button type="button" className="pl-btn is-primary" onClick={allowEditing}>
            {t("Connect {service}", { service: service === "spotify" ? "Spotify" : "YouTube" })}
          </button>
        </div>
      ) : (
        <>
          {!canEdit && (
            <div className="pl-note">
              <span>
                {t("You can browse your playlists. To create and change them, allow editing once.")}
              </span>
              <button type="button" className="pl-btn is-primary" onClick={allowEditing}>
                {t("Allow editing")}
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="pl-error">
              {error}
            </p>
          )}
          <div className="pl-body">
            <aside className="pl-lists">
              <div className="pl-lists-head">
                <strong>{t("Playlists")}</strong>
                {busy && <Loader2 size={15} className="animate-spin" />}
              </div>
              {canEdit && (
                <div className="pl-new">
                  <input
                    value={newName}
                    placeholder={t("New playlist name")}
                    aria-label={t("New playlist name")}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && create()}
                  />
                  <button
                    type="button"
                    className="pl-icon"
                    disabled={!newName.trim()}
                    onClick={create}
                    aria-label={t("Create playlist")}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              )}
              {!sorted ? (
                <p className="pl-muted">{t("Loading…")}</p>
              ) : (
                sorted.map((l) => {
                  const pinned = pins.includes(l.id);
                  return (
                    <div key={l.id} className={`pl-list${openId === l.id ? " is-open" : ""}`}>
                      <button
                        type="button"
                        className="pl-list-main"
                        onClick={() => setOpenId(l.id)}
                      >
                        <span
                          className="pl-art"
                          style={l.image ? { backgroundImage: `url("${l.image}")` } : undefined}
                        />
                        <span className="pl-list-text">
                          <strong>{l.name}</strong>
                          <span>
                            {t("{n} songs", { n: l.count })}
                            {!l.mine ? ` · ${t("Following")}` : ""}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`pl-icon${pinned ? " is-pinned" : ""}`}
                        aria-pressed={pinned}
                        aria-label={pinned ? t("Unpin") : t("Pin to the top")}
                        onClick={() => togglePin(service, l.id)}
                      >
                        <Pin size={14} />
                      </button>
                    </div>
                  );
                })
              )}
            </aside>

            <div className="pl-tracks">
              {!open ? (
                <p className="pl-muted">{t("Pick a playlist to see and edit its songs.")}</p>
              ) : (
                <>
                  <div className="pl-tracks-head">
                    <strong>{open.name}</strong>
                    <span className="pl-muted">
                      {t("{n} songs", { n: rows?.length ?? open.count })}
                    </span>
                    {editable && (
                      <span className="pl-actions">
                        <button
                          type="button"
                          className="pl-icon"
                          onClick={() => rename(open)}
                          aria-label={t("Rename")}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          className="pl-icon is-danger"
                          onClick={() => remove(open)}
                          aria-label={t("Delete playlist")}
                        >
                          <Trash2 size={15} />
                        </button>
                      </span>
                    )}
                    {!open.mine && (
                      <span className="pl-muted">
                        {t("Only the owner can change this playlist.")}
                      </span>
                    )}
                  </div>
                  {editable && (
                    <div className="pl-search">
                      <Search size={15} />
                      <input
                        value={query}
                        placeholder={t("Search songs to add")}
                        aria-label={t("Search songs to add")}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void search()}
                      />
                      {found && (
                        <button
                          type="button"
                          className="pl-icon"
                          onClick={() => setFound(null)}
                          aria-label={t("Close results")}
                        >
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  )}
                  {found && (
                    <div className="pl-found">
                      {found.length === 0 && <p className="pl-muted">{t("Nothing found.")}</p>}
                      {found.map((s, i) => (
                        <div key={i} className="pl-row">
                          <span
                            className="pl-art"
                            style={s.image ? { backgroundImage: `url("${s.image}")` } : undefined}
                          />
                          <span className="pl-row-text">
                            <strong>{s.title}</strong>
                            <span>{s.artist}</span>
                          </span>
                          <button
                            type="button"
                            className="pl-btn"
                            disabled={busy}
                            onClick={() => add(s)}
                          >
                            <Plus size={14} /> {t("Add")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!rows ? (
                    <p className="pl-muted">{t("Loading…")}</p>
                  ) : (
                    <ol className="pl-rows">
                      {rows.map((r, i) => (
                        <li
                          key={r.key}
                          className={`pl-row${dragging === i ? " is-dragging" : ""}`}
                          draggable={editable}
                          onDragStart={() => setDragging(i)}
                          onDragOver={(e) => editable && e.preventDefault()}
                          onDrop={() => {
                            if (dragging !== null) move(dragging, i);
                            setDragging(null);
                          }}
                          onDragEnd={() => setDragging(null)}
                        >
                          <span className="pl-num">{i + 1}</span>
                          <span
                            className="pl-art"
                            style={r.image ? { backgroundImage: `url("${r.image}")` } : undefined}
                          />
                          <span className="pl-row-text">
                            <strong>{r.title}</strong>
                            <span>{r.artist}</span>
                          </span>
                          {editable && (
                            <span className="pl-actions">
                              <button
                                type="button"
                                className="pl-icon"
                                disabled={busy || i === 0}
                                onClick={() => move(i, i - 1)}
                                aria-label={t("Move up")}
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                className="pl-icon"
                                disabled={busy || i === rows.length - 1}
                                onClick={() => move(i, i + 1)}
                                aria-label={t("Move down")}
                              >
                                ▼
                              </button>
                              <button
                                type="button"
                                className="pl-icon is-danger"
                                disabled={busy || (service === "spotify" ? !r.uri : !r.itemId)}
                                onClick={() => drop(i)}
                                aria-label={t("Remove from playlist")}
                              >
                                <X size={15} />
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
