import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  connectJellyfin,
  disconnectJellyfin,
  jellyfinRecent,
  jellyfinSearch,
  jellyfinStreamUrl,
  useJellyfin,
  type JellyfinSong,
} from "@/lib/music/jellyfin-web";
import type { StudioDeck } from "@/lib/music/studio/deck";
import { addUrl } from "@/lib/music/studio/library";
import { formatTime } from "./studio-controls";
import { startStudioDrag } from "@/lib/music/studio/drag";
import { DECK_NAMES } from "./studio-deck";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Your Jellyfin server's music for the audio decks. */
export function JellyfinSource({
  decks,
  onLoad,
  busyDeck,
}: {
  decks: StudioDeck[];
  onLoad: (deck: StudioDeck, id: string) => void;
  busyDeck: number | null;
}) {
  const t = useT();
  const jf = useJellyfin();
  const [form, setForm] = useState({ server: "", user: "", password: "" });
  const [songs, setSongs] = useState<JellyfinSong[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jf.session) return;
    setSongs(null);
    const q = query.trim();
    const id = window.setTimeout(
      () =>
        void (q ? jellyfinSearch(q) : jellyfinRecent()).then(setSongs).catch((e: unknown) => {
          setError(message(e));
          setSongs([]);
        }),
      q ? 350 : 0,
    );
    return () => window.clearTimeout(id);
  }, [jf.session, query]);

  if (!jf.session)
    return (
      <form
        className="sl-jellyfin"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          void connectJellyfin(form.server, form.user, form.password)
            .catch((err: unknown) => setError(message(err)))
            .finally(() => setBusy(false));
        }}
      >
        <strong>{t("Connect your Jellyfin server")}</strong>
        <p className="studio-empty">
          {t("Use its HTTPS address. Your sign in stays on this device.")}
        </p>
        <label>
          <span>{t("Server address")}</span>
          <input
            value={form.server}
            placeholder="https://jellyfin.example.com"
            onChange={(e) => setForm({ ...form, server: e.target.value })}
          />
        </label>
        <label>
          <span>{t("Username")}</span>
          <input
            value={form.user}
            autoComplete="username"
            onChange={(e) => setForm({ ...form, user: e.target.value })}
          />
        </label>
        <label>
          <span>{t("Password")}</span>
          <input
            type="password"
            value={form.password}
            autoComplete="current-password"
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        {error && <p className="studio-error">{error}</p>}
        <button type="submit" className="studio-btn" disabled={busy || !form.server || !form.user}>
          {busy ? t("Connecting…") : t("Connect")}
        </button>
      </form>
    );

  const add = (s: JellyfinSong) => addUrl(jellyfinStreamUrl(s.id), s.title, s.artist, s.art);

  return (
    <>
      <div className="sl-bar">
        <strong>{t("Jellyfin")}</strong>
        <span className="sl-count">{jf.session.name}</span>
        <input
          className="studio-search"
          type="search"
          placeholder={t("Search your Jellyfin music")}
          aria-label={t("Search Jellyfin")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="studio-btn studio-mini" onClick={disconnectJellyfin}>
          {t("Disconnect")}
        </button>
      </div>
      {error && <p className="studio-error">{error}</p>}
      {!songs ? (
        <p className="studio-empty">{t("Loading…")}</p>
      ) : songs.length === 0 ? (
        <p className="studio-empty">{t("No songs found.")}</p>
      ) : (
        <div className="sl-table" role="table" aria-label={t("Jellyfin")}>
          {songs.map((s) => (
            <div
              key={s.id}
              role="row"
              className="sl-tr"
              draggable
              title={t("Drag onto a deck, or use its deck buttons")}
              onDragStart={(e) =>
                startStudioDrag(e, {
                  kind: "url",
                  url: jellyfinStreamUrl(s.id),
                  title: s.title,
                  artist: s.artist,
                  art: s.art,
                })
              }
            >
              <span
                className="sl-art"
                style={s.art ? { backgroundImage: `url("${s.art}")` } : undefined}
              />
              <span className="sl-title">{s.title}</span>
              <span className="sl-dim">{s.artist || "—"}</span>
              <span className="sl-dim" />
              <span className="sl-key" />
              <span className="sl-dim">{s.durationSec ? formatTime(s.durationSec) : ""}</span>
              <span className="sl-actions">
                {decks.map((deck) => (
                  <button
                    key={deck.index}
                    type="button"
                    className="studio-btn studio-mini"
                    data-deck={deck.index}
                    disabled={busyDeck === deck.index}
                    onClick={() => onLoad(deck, add(s).id)}
                    title={t("Load on deck {name}", { name: DECK_NAMES[deck.index] })}
                  >
                    {DECK_NAMES[deck.index]}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
