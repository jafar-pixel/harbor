import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  GripVertical,
  ListMusic,
  Loader2,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  Repeat,
  Search,
  Shuffle,
  SkipForward,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useMusicLinks } from "@/lib/music/account-link";
import { analyzeSongs, factsKey, knownFacts, type SongFacts } from "@/lib/music/automix/analyze";
import {
  addSongs,
  createFromPrompt,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  moveRow,
  playlistRows,
  removeRow,
  renamePlaylist,
  rowTrack,
  searchSongs,
  suggestFor,
  type AutoList,
  type AutoRow,
  type AutoSong,
} from "@/lib/music/automix/playlists";
import { harmonicOrder } from "@/lib/music/dj/mixing";
import { SERVICE_LABEL, type HubService } from "@/lib/music/hub/library";
import { togglePin, usePins } from "@/lib/music/playlist-pins";
import {
  addToQueue,
  cycleRepeat,
  next,
  playNow,
  playTracks,
  setAutomix,
  toggleQueue,
  togglePlay,
  toggleShuffle,
  usePlayer,
} from "@/lib/music/player/store";
import type { PlayerTrack } from "@/lib/music/player/types";
import { connectSpotifyWeb, spotifyCanEdit, useSpotifyWeb } from "@/lib/music/spotify-web/auth";
import { connectYouTubeWeb, youtubeCanEdit, useYouTubeWeb } from "@/lib/music/youtube-web/auth";
import "./automix.css";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const clock = (s?: number) =>
  s && Number.isFinite(s) && s > 0
    ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`
    : "";

/**
 * Integrated Automix: pick one of your YouTube or Spotify playlists and let the AI mix it,
 * songs in key and tempo order with each transition a musical phrase long. Edit the playlist
 * in place (add, remove, reorder, create, rename, delete, pin); every change syncs back to
 * your account. The AI suggests songs that fit and builds playlists from a prompt, and any
 * song can be previewed in the player first.
 */
export function AutomixView({ active }: { active: boolean }) {
  const t = useT();
  const links = useMusicLinks();
  const youtube = useYouTubeWeb();
  const spotify = useSpotifyWeb();
  const [service, setService] = useState<HubService>(links.main);
  const connected = service === "spotify" ? spotify.connected : youtube.connected;
  const canEdit = service === "spotify" ? spotifyCanEdit() : youtubeCanEdit();
  const pins = usePins(service);
  const [lists, setLists] = useState<AutoList[] | null>(null);
  const [open, setOpen] = useState<AutoList | null>(null);
  const [rows, setRows] = useState<AutoRow[] | null>(null);
  const [facts, setFacts] = useState<Map<string, SongFacts>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<AutoSong[] | null>(null);
  const [suggested, setSuggested] = useState<AutoSong[] | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const editable = canEdit && !!open?.mine;

  useEffect(() => setService(links.main), [links.main]);

  const loadLists = async (pick?: AutoList) => {
    setLists(null);
    try {
      const all = await listPlaylists(service);
      setLists(all);
      if (pick) setOpen(all.find((l) => l.id === pick.id) ?? pick);
      else setOpen((cur) => (cur && all.some((l) => l.id === cur.id) ? cur : (all[0] ?? null)));
    } catch (e) {
      setError(message(e));
      setLists([]);
    }
  };

  const loadRows = async (list: AutoList) => {
    setRows(null);
    try {
      const r = await playlistRows(list);
      setRows(r);
      void analyzeSongs(r.filter((x) => x.title).slice(0, 200))
        .then(setFacts)
        .catch(() => undefined);
    } catch (e) {
      setError(message(e));
      setRows([]);
    }
  };

  useEffect(() => {
    if (!active || !connected) return;
    setOpen(null);
    setRows(null);
    void loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, connected, service]);

  useEffect(() => {
    setFound(null);
    setSuggested(null);
    if (open) void loadRows(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id]);

  const factsOf = (r: { artist: string; title: string }) =>
    facts.get(factsKey(r)) ?? knownFacts(r) ?? {};

  /** Run a change; on failure show why and reload the playlist from the service. */
  const change = async (label: string, action: () => Promise<unknown>, reloadLists = false) => {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
      if (open) void loadRows(open);
      if (reloadLists) void loadLists(open ?? undefined);
    }
  };

  const tracks = (list: AutoRow[]) =>
    list.filter((r) => r.title && r.artist).map((r) => rowTrack(service, r, factsOf(r)));

  const startAutomix = async () => {
    if (!open || !rows?.length) return;
    setBusy(t("Reading tempo and key…"));
    setError(null);
    try {
      const f = await analyzeSongs(rows.filter((r) => r.title));
      setFacts(f);
      const items = rows
        .filter((r) => r.title && r.artist)
        .map((r) => {
          const x = f.get(factsKey(r)) ?? {};
          return { track: rowTrack(service, r, x), bpm: x.bpm, key: x.key, energy: x.energy };
        });
      const ordered = items.length ? [items[0], ...harmonicOrder(items[0], items.slice(1))] : [];
      setAutomix(true);
      playTracks(
        ordered.map((o) => o.track),
        0,
        `Automix · ${open.name}`,
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const move = (from: number, to: number) => {
    if (!rows || !open || to < 0 || to >= rows.length || from === to) return;
    const before = rows;
    const nextRows = [...rows];
    const [row] = nextRows.splice(from, 1);
    nextRows.splice(to, 0, row);
    setRows(nextRows);
    void change(t("Saving…"), () => moveRow(open, before, from, to));
  };

  const remove = (i: number) => {
    const row = rows?.[i];
    if (!row || !open) return;
    setRows((r) => r?.filter((_, j) => j !== i) ?? r);
    void change(t("Saving…"), () => removeRow(open, row));
  };

  const add = (songs: AutoSong[]) => {
    if (!open || !songs.length) return;
    setRows((r) => [
      ...(r ?? []),
      ...songs.map((s, i) => ({
        key: `new:${Date.now()}:${i}`,
        title: s.title,
        artist: s.artist,
        image: s.image,
      })),
    ]);
    void change(t("Adding…"), () => addSongs(open, songs), true);
  };

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setFound([]);
    setBusy(t("Searching…"));
    try {
      setFound(await searchSongs(service, q));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const suggest = async () => {
    if (!open || !rows) return;
    setBusy(t("The AI is listening to your playlist…"));
    setError(null);
    try {
      setSuggested(await suggestFor(open, rows));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const allowEditing = () =>
    service === "spotify" ? void connectSpotifyWeb() : void connectYouTubeWeb(true);

  if (!connected)
    return (
      <section className="am">
        <AutomixDeck />
        <div className="am-empty">
          <ServiceTabs service={service} onChange={setService} />
          <p>
            {t("Connect {service} to mix and edit your playlists here.", {
              service: SERVICE_LABEL[service],
            })}
          </p>
          <button type="button" className="am-btn is-primary" onClick={allowEditing}>
            {t("Connect {service}", { service: SERVICE_LABEL[service] })}
          </button>
        </div>
      </section>
    );

  return (
    <section className="am" aria-label={t("Integrated Automix")}>
      <AutomixDeck />
      <UpNext />

      <div className="am-list-head">
        <button type="button" className="am-list-name" onClick={() => setPicker(true)}>
          <ListMusic size={18} />
          <span>{open?.name ?? t("Select playlist")}</span>
          <ChevronDown size={16} />
        </button>
        <span className="am-muted">
          {open ? `${SERVICE_LABEL[service]} · ${rows?.length ?? open.count} ${t("songs")}` : ""}
        </span>
        <div className="am-list-actions">
          {busy && (
            <span className="am-busy" role="status">
              <Loader2 size={14} className="animate-spin" /> {busy}
            </span>
          )}
          <button
            type="button"
            className="am-btn is-primary"
            disabled={!rows?.length || !!busy}
            onClick={() => void startAutomix()}
          >
            <Play size={15} /> {t("Automix")}
          </button>
          <button
            type="button"
            className="am-btn"
            disabled={!rows?.length}
            onClick={() =>
              rows &&
              playTracks(
                [...tracks(rows)].sort(() => Math.random() - 0.5),
                0,
                open?.name ?? null,
              )
            }
          >
            <Shuffle size={15} /> {t("Shuffle")}
          </button>
          <button
            type="button"
            className="am-btn"
            disabled={!rows?.length || !!busy}
            onClick={() => void suggest()}
          >
            <Sparkles size={15} /> {t("AI suggest")}
          </button>
          {editable && open && (
            <>
              <button
                type="button"
                className="am-icon"
                aria-label={t("Rename playlist")}
                onClick={() => {
                  const name = window.prompt(t("New name for this playlist"), open.name)?.trim();
                  if (!name || name === open.name) return;
                  setOpen({ ...open, name });
                  void change(t("Saving…"), () => renamePlaylist(open, name), true);
                }}
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                className="am-icon is-danger"
                aria-label={t("Delete playlist")}
                onClick={() => {
                  if (
                    !window.confirm(
                      t('Delete "{name}" from your {service}?', {
                        name: open.name,
                        service: SERVICE_LABEL[service],
                      }),
                    )
                  )
                    return;
                  const gone = open;
                  setOpen(null);
                  void change(t("Deleting…"), () => deletePlaylist(gone), true);
                }}
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="am-note">
          <span>{t("To add, remove and reorder songs, allow editing once.")}</span>
          <button type="button" className="am-btn is-primary" onClick={allowEditing}>
            {t("Allow editing")}
          </button>
        </div>
      )}
      {open && !open.mine && (
        <p className="am-muted">{t("Only the owner can change this playlist.")}</p>
      )}
      {error && (
        <p role="alert" className="am-error">
          {error}
        </p>
      )}

      {editable && (
        <div className="am-search">
          <Search size={16} />
          <label className="sr-only" htmlFor="am-search">
            {t("Search songs to add")}
          </label>
          <input
            id="am-search"
            value={query}
            placeholder={t("Search songs to add")}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void search()}
          />
          {found && (
            <button
              type="button"
              className="am-icon"
              aria-label={t("Close results")}
              onClick={() => setFound(null)}
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
      {found && (
        <SongPicks
          title={t("Search results")}
          songs={found}
          service={service}
          canAdd={editable}
          onAdd={(s) => add([s])}
        />
      )}
      {suggested && (
        <SongPicks
          title={t("Suggested by the AI")}
          songs={suggested}
          service={service}
          canAdd={editable}
          onAdd={(s) => add([s])}
          onAddAll={() => {
            add(suggested);
            setSuggested(null);
          }}
          onClose={() => setSuggested(null)}
        />
      )}

      {!open ? (
        <p className="am-muted">{lists ? t("Pick a playlist to start.") : t("Loading…")}</p>
      ) : !rows ? (
        <p className="am-muted">{t("Loading…")}</p>
      ) : (
        <PlaylistRows
          rows={rows}
          service={service}
          editable={editable}
          busy={!!busy}
          dragging={dragging}
          setDragging={setDragging}
          factsOf={factsOf}
          onPlay={(i) => playTracks(tracks(rows), i, open.name)}
          onPreview={(r) => playNow(rowTrack(service, r, factsOf(r)))}
          onMove={move}
          onRemove={remove}
        />
      )}

      <button type="button" className="am-select" onClick={() => setPicker(true)}>
        {t("Select playlist…")}
      </button>

      {picker && (
        <PlaylistPicker
          service={service}
          onService={setService}
          lists={lists}
          pins={pins}
          canEdit={canEdit}
          onPick={(l) => {
            setOpen(l);
            setPicker(false);
          }}
          onCreate={async (name) => {
            const made = await createPlaylist(service, name);
            setPicker(false);
            await loadLists(made);
          }}
          onCreateAi={async (prompt) => {
            const { list } = await createFromPrompt(service, prompt);
            setPicker(false);
            await loadLists(list);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </section>
  );
}

function ServiceTabs({
  service,
  onChange,
}: {
  service: HubService;
  onChange: (s: HubService) => void;
}) {
  return (
    <div className="am-services" role="tablist">
      {(["youtube", "spotify"] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={service === s}
          onClick={() => onChange(s)}
        >
          {SERVICE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/** A picture of the song for the deck: bars drawn from its name (decoration, not analysis). */
function waveBars(seed: string, count = 96): number[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: count }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    const base = 0.35 + 0.45 * Math.abs(Math.sin(i / 7 + (h % 7)));
    return Math.min(1, base + ((h % 100) / 100) * 0.25);
  });
}

/** The deck at the top: what plays now, its place in the song, Automix and the transport. */
function AutomixDeck() {
  const t = useT();
  const player = usePlayer();
  const track = player.queue[player.index] ?? null;
  const bars = useMemo(
    () => waveBars(`${track?.artist}-${track?.title}`),
    [track?.artist, track?.title],
  );
  const progress = player.duration ? player.position / player.duration : 0;
  return (
    <div className="am-deck">
      <div className="am-deck-top">
        <div className="am-deck-art">
          {track?.art ? <img src={track.art} alt="" /> : <ListMusic size={34} />}
        </div>
        <div className="am-deck-info">
          <span className="am-deck-artist">{track?.artist ?? t("Nothing playing")}</span>
          <span className="am-deck-title">
            {track?.title ?? t("Pick a playlist and press Automix")}
          </span>
          <div
            className="am-wave"
            role="progressbar"
            aria-label={t("Song progress")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            {bars.map((b, i) => (
              <span
                key={i}
                data-played={i / bars.length < progress}
                style={{ height: `${Math.round(b * 100)}%` }}
              />
            ))}
            <i className="am-wave-head" style={{ left: `${progress * 100}%` }} />
          </div>
        </div>
        <span className="am-deck-left">
          {player.duration ? `-${clock(player.duration - player.position)}` : ""}
        </span>
      </div>
      <div className="am-deck-controls">
        <button
          type="button"
          className="am-automix"
          aria-pressed={player.automix}
          onClick={() => setAutomix(!player.automix)}
        >
          <Play size={14} /> {t("AUTOMIX")}
          <span className="am-automix-state">{player.automix ? t("On") : t("Off")}</span>
        </button>
        <div className="am-transport">
          <button
            type="button"
            className="am-round is-queue"
            aria-label={t("Queue")}
            onClick={() => toggleQueue()}
          >
            <ListMusic size={20} />
          </button>
          <button
            type="button"
            className="am-round is-play"
            aria-label={player.playing ? t("Pause") : t("Play")}
            onClick={togglePlay}
          >
            {player.playing ? <Pause size={26} /> : <Play size={26} />}
          </button>
          <button type="button" className="am-round" aria-label={t("Next")} onClick={next}>
            <SkipForward size={20} />
          </button>
        </div>
        <div className="am-bpm">
          <span>{t("BPM")}</span>
          <strong>{track?.bpm ? track.bpm.toFixed(1) : "—"}</strong>
          {track?.camelot && <em>{track.camelot}</em>}
        </div>
      </div>
    </div>
  );
}

function UpNext() {
  const t = useT();
  const player = usePlayer();
  const upcoming = player.queue.slice(player.index + 1, player.index + 3);
  return (
    <div className="am-upnext">
      <div className="am-upnext-head">
        <span>{t("Up Next")}</span>
        <div className="am-upnext-tools">
          <button
            type="button"
            className="am-icon"
            data-on={player.shuffle}
            aria-pressed={player.shuffle}
            aria-label={t("Shuffle")}
            onClick={toggleShuffle}
          >
            <Shuffle size={15} />
          </button>
          <button
            type="button"
            className="am-icon"
            data-on={player.repeat !== "off"}
            aria-label={t("Repeat")}
            onClick={cycleRepeat}
          >
            <Repeat size={15} />
          </button>
        </div>
      </div>
      {upcoming.length ? (
        upcoming.map((u) => <QueueRow key={u.key} track={u} />)
      ) : (
        <p className="am-muted">{t("Nothing queued yet.")}</p>
      )}
    </div>
  );
}

function QueueRow({ track }: { track: PlayerTrack }) {
  return (
    <div className="am-row is-queue">
      <span className="am-row-art">{track.art ? <img src={track.art} alt="" /> : null}</span>
      <span className="am-row-title">{track.title}</span>
      <span className="am-row-dim">{track.artist}</span>
      <span className="am-row-dim">{track.bpm ? `${Math.round(track.bpm)} BPM` : ""}</span>
      <span className="am-row-key">{track.camelot ?? ""}</span>
    </div>
  );
}

function PlaylistRows({
  rows,
  service,
  editable,
  busy,
  dragging,
  setDragging,
  factsOf,
  onPlay,
  onPreview,
  onMove,
  onRemove,
}: {
  rows: AutoRow[];
  service: HubService;
  editable: boolean;
  busy: boolean;
  dragging: number | null;
  setDragging: (i: number | null) => void;
  factsOf: (r: AutoRow) => SongFacts;
  onPlay: (i: number) => void;
  onPreview: (r: AutoRow) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (i: number) => void;
}) {
  const t = useT();
  const player = usePlayer();
  const current = player.queue[player.index];
  return (
    <ol className="am-rows" aria-label={t("Playlist songs")}>
      {rows.map((r, i) => {
        const f = factsOf(r);
        const playing = !!current && current.title === r.title && current.artist === r.artist;
        return (
          <li
            key={r.key}
            className="am-row"
            data-playing={playing}
            data-dragging={dragging === i}
            draggable={editable}
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => editable && e.preventDefault()}
            onDrop={() => {
              if (dragging !== null) onMove(dragging, i);
              setDragging(null);
            }}
            onDragEnd={() => setDragging(null)}
          >
            <button type="button" className="am-row-main" onClick={() => onPlay(i)}>
              <span className="am-row-art">
                {r.image ? <img src={r.image} alt="" loading="lazy" /> : null}
              </span>
              <span className="am-row-title">{r.title}</span>
            </button>
            <span className="am-row-dim">{r.artist}</span>
            <span className="am-row-dim" title={SERVICE_LABEL[service]}>
              {clock(r.durationSec)}
            </span>
            <span className="am-row-dim">{f.bpm ? `${f.bpm} BPM` : "—"}</span>
            <span className="am-row-key">{f.key ?? ""}</span>
            <span className="am-row-tools">
              <button
                type="button"
                className="am-icon"
                aria-label={`${t("Preview")} ${r.title}`}
                onClick={() => onPreview(r)}
              >
                <Play size={14} />
              </button>
              {editable && (
                <>
                  <button
                    type="button"
                    className="am-icon"
                    aria-label={t("Move up")}
                    disabled={busy || i === 0}
                    onClick={() => onMove(i, i - 1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="am-icon"
                    aria-label={t("Move down")}
                    disabled={busy || i === rows.length - 1}
                    onClick={() => onMove(i, i + 1)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="am-icon is-danger"
                    aria-label={`${t("Remove")} ${r.title}`}
                    disabled={busy || (service === "spotify" ? !r.uri : !r.itemId)}
                    onClick={() => onRemove(i)}
                  >
                    <X size={15} />
                  </button>
                </>
              )}
              {editable && <GripVertical size={16} className="am-grip" aria-hidden="true" />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function SongPicks({
  title,
  songs,
  service,
  canAdd,
  onAdd,
  onAddAll,
  onClose,
}: {
  title: string;
  songs: AutoSong[];
  service: HubService;
  canAdd: boolean;
  onAdd: (s: AutoSong) => void;
  onAddAll?: () => void;
  onClose?: () => void;
}) {
  const t = useT();
  return (
    <div className="am-picks">
      <div className="am-picks-head">
        <strong>{title}</strong>
        <div className="am-list-actions">
          {onAddAll && canAdd && songs.length > 0 && (
            <button type="button" className="am-btn" onClick={onAddAll}>
              <Plus size={14} /> {t("Add all")}
            </button>
          )}
          {onClose && (
            <button type="button" className="am-icon" aria-label={t("Close")} onClick={onClose}>
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      {songs.length === 0 && <p className="am-muted">{t("Nothing found.")}</p>}
      {songs.map((s, i) => (
        <div key={`${s.artist}-${s.title}-${i}`} className="am-row is-pick">
          <span className="am-row-art">{s.image ? <img src={s.image} alt="" /> : null}</span>
          <span className="am-row-title">{s.title}</span>
          <span className="am-row-dim">{s.artist}</span>
          <span className="am-row-dim">{s.bpm ? `${s.bpm} BPM` : ""}</span>
          <span className="am-row-key">{s.key ?? ""}</span>
          <span className="am-row-tools">
            <button
              type="button"
              className="am-icon"
              aria-label={`${t("Preview")} ${s.title}`}
              onClick={() => playNow(rowTrack(service, s, { bpm: s.bpm, key: s.key }))}
            >
              <Play size={14} />
            </button>
            <button
              type="button"
              className="am-icon"
              aria-label={`${t("Add to queue")} ${s.title}`}
              onClick={() => addToQueue([rowTrack(service, s, { bpm: s.bpm, key: s.key })])}
            >
              <ListMusic size={14} />
            </button>
            {canAdd && (
              <button type="button" className="am-btn" onClick={() => onAdd(s)}>
                <Plus size={14} /> {t("Add")}
              </button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function PlaylistPicker({
  service,
  onService,
  lists,
  pins,
  canEdit,
  onPick,
  onCreate,
  onCreateAi,
  onClose,
}: {
  service: HubService;
  onService: (s: HubService) => void;
  lists: AutoList[] | null;
  pins: string[];
  canEdit: boolean;
  onPick: (l: AutoList) => void;
  onCreate: (name: string) => Promise<void>;
  onCreateAi: (prompt: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sorted = useMemo(
    () =>
      lists
        ? [...lists].sort((a, b) => {
            const pa = pins.indexOf(a.id);
            const pb = pins.indexOf(b.id);
            return (pa < 0 ? 1e9 : pa) - (pb < 0 ? 1e9 : pb);
          })
        : null,
    [lists, pins],
  );
  const run = async (label: string, fn: () => Promise<void>) => {
    setWorking(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setWorking(null);
    }
  };
  return (
    <div className="am-sheet" role="dialog" aria-modal="true" aria-label={t("Select playlist")}>
      <div className="am-sheet-card">
        <div className="am-picks-head">
          <strong>{t("Select playlist")}</strong>
          <button type="button" className="am-icon" aria-label={t("Close")} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <ServiceTabs service={service} onChange={onService} />
        {canEdit && (
          <div className="am-create">
            <label className="am-field">
              <span>{t("New playlist")}</span>
              <span className="am-field-row">
                <input
                  value={name}
                  placeholder={t("Name")}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  type="button"
                  className="am-btn"
                  disabled={!name.trim() || !!working}
                  onClick={() => void run(t("Creating…"), () => onCreate(name.trim()))}
                >
                  <Plus size={14} /> {t("Create")}
                </button>
              </span>
            </label>
            <label className="am-field">
              <span>{t("Create with AI")}</span>
              <span className="am-field-row">
                <input
                  value={prompt}
                  placeholder={t("e.g. Sunday morning soul and gospel")}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                <button
                  type="button"
                  className="am-btn is-primary"
                  disabled={!prompt.trim() || !!working}
                  onClick={() =>
                    void run(t("The AI is building your playlist…"), () =>
                      onCreateAi(prompt.trim()),
                    )
                  }
                >
                  <Sparkles size={14} /> {t("Build")}
                </button>
              </span>
            </label>
          </div>
        )}
        {working && (
          <p className="am-busy" role="status">
            <Loader2 size={14} className="animate-spin" /> {working}
          </p>
        )}
        {error && <p className="am-error">{error}</p>}
        <div className="am-sheet-lists">
          {!sorted ? (
            <p className="am-muted">{t("Loading…")}</p>
          ) : (
            sorted.map((l) => {
              const pinned = pins.includes(l.id);
              return (
                <div key={l.id} className="am-pick-list">
                  <button type="button" className="am-pick-main" onClick={() => onPick(l)}>
                    <span className="am-row-art">
                      {l.image ? <img src={l.image} alt="" /> : null}
                    </span>
                    <span className="am-pick-text">
                      <strong>{l.name}</strong>
                      <span>
                        {l.count} {t("songs")}
                        {!l.mine ? ` · ${t("Following")}` : ""}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="am-icon"
                    data-on={pinned}
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
        </div>
      </div>
    </div>
  );
}
