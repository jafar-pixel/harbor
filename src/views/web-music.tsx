import { useEffect, useRef, useState } from "react";
import { Headphones, Music2, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { MUSIC_TAB_EVENT, takeMusicTabRequest, useSongInbox } from "@/lib/music/social/inbox";
import { MusicOtherDevices } from "@/components/music/music-other-devices";
import { MusicDj } from "./music/music-dj";
import { PlaylistEditor } from "./music/playlist-editor";
import { DjStudio } from "./music/studio/studio-view";
import { MusicFriends } from "./music/music-friends";
import { MusicLounge } from "./music/music-lounge";
import { MusicMoods } from "./music/music-moods";
import { MusicSpotify } from "./music/music-spotify";
import { MusicHub } from "./music/hub/music-hub";
import { MusicStyles } from "./music/music-styles";

type Track = { id: string; title: string; url: string; local: boolean };

type WebMusicTab =
  | "forYou"
  | "dj"
  | "studio"
  | "lounge"
  | "friends"
  | "spotify"
  | "playlists"
  | "moods"
  | "styles"
  | "files";

const WEB_TABS: { id: WebMusicTab; label: string }[] = [
  { id: "forYou", label: "Music Hub" },
  { id: "dj", label: "music.tab.dj" },
  { id: "studio", label: "DJ Studio" },
  { id: "lounge", label: "music.tab.lounge" },
  { id: "friends", label: "music.tab.friends" },
  { id: "spotify", label: "Spotify" },
  { id: "playlists", label: "Playlists" },
  { id: "moods", label: "music.tab.moods" },
  { id: "styles", label: "Your styles" },
  { id: "files", label: "Your files" },
];

/**
 * The Music Hub in the browser: the AI DJ, Listening Lounge, friends, moods and styles run on
 * YouTube embeds and the JL account; native sources stay in the desktop app.
 */
export function MusicView({ active }: { active: boolean; shellBackAvailable?: boolean }) {
  const t = useT();
  const [tab, setTab] = useState<WebMusicTab>("forYou");
  const inbox = useSongInbox();

  // A song toast or an invite can ask for a tab.
  useEffect(() => {
    const receive = () => {
      const wanted = takeMusicTabRequest();
      if (wanted === "library") setTab("files");
      else if (WEB_TABS.some((w) => w.id === wanted)) setTab(wanted as WebMusicTab);
    };
    receive();
    window.addEventListener(MUSIC_TAB_EVENT, receive);
    return () => window.removeEventListener(MUSIC_TAB_EVENT, receive);
  }, []);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-6 text-ink sm:px-8">
      <div
        className={`mx-auto flex w-full flex-col gap-6 ${tab === "studio" ? "max-w-[1800px]" : "max-w-6xl"}`}
      >
        <header className="flex items-center gap-3">
          <Headphones className="text-accent" size={28} />
          <h1 className="font-display text-3xl">{t("Music")}</h1>
        </header>
        <MusicOtherDevices />
        <div
          role="tablist"
          aria-label={t("Music")}
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
        >
          {WEB_TABS.map((w) => {
            const unread = w.id === "friends" ? inbox.unread : 0;
            return (
              <button
                key={w.id}
                type="button"
                role="tab"
                aria-selected={tab === w.id}
                onClick={() => setTab(w.id)}
                className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
                  tab === w.id
                    ? "border-ink bg-ink text-canvas"
                    : "border-edge-soft bg-elevated text-ink-muted"
                }`}
              >
                {t(w.label)}
                {unread > 0 && (
                  <span className="rounded-full bg-accent px-1.5 text-xs text-canvas">
                    {unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {tab === "forYou" && <MusicHub active={active} onStudio={() => setTab("studio")} />}
        <MusicDj visible={active && tab === "dj"} />
        {tab === "studio" && <DjStudio />}
        {tab === "playlists" && <PlaylistEditor />}
        <MusicLounge visible={active && tab === "lounge"} />
        {tab === "friends" && <MusicFriends active={active} />}
        {tab === "spotify" && <MusicSpotify active={active} />}
        {tab === "moods" && <MusicMoods />}
        {tab === "styles" && <MusicStyles onBack={() => setTab("dj")} />}
        {tab === "files" && <WebMusicFiles active={active} />}
      </div>
    </main>
  );
}

/** Browser playback of files and direct links, with the browser's audio engine. */
function WebMusicFiles({ active }: { active: boolean }) {
  const t = useT();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const objectUrls = useRef(new Set<string>());
  const track = tracks.find((item) => item.id === selected);

  useEffect(
    () => () => {
      for (const value of objectUrls.current) URL.revokeObjectURL(value);
    },
    [],
  );
  useEffect(() => {
    if (!active) audio.current?.pause();
  }, [active]);

  const add = (items: Track[]) => {
    setTracks((previous) => [...previous, ...items]);
    setSelected((current) => current ?? items[0]?.id ?? null);
    setError("");
  };
  const choose = (id: string) => {
    setSelected(id);
    setError("");
  };
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <header>
        <p className="text-sm leading-relaxed text-ink-muted">
          {t(
            "Listen to tracks from your device or a direct audio link. Files stay on this device; this queue lasts until you reload.",
          )}
        </p>
      </header>
      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 font-semibold text-canvas focus-within:ring-2 focus-within:ring-accent">
        <Plus size={20} />
        {t("Add audio files")}
        <input
          className="sr-only"
          type="file"
          accept="audio/*"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            add(
              files.map((file) => {
                const value = URL.createObjectURL(file);
                objectUrls.current.add(value);
                return { id: crypto.randomUUID(), title: file.name, url: value, local: true };
              }),
            );
            event.target.value = "";
          }}
        />
      </label>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const value = new URL(url.trim());
            if (!["https:", "http:"].includes(value.protocol) || value.username || value.password)
              throw new Error();
            add([
              {
                id: crypto.randomUUID(),
                title: decodeURIComponent(value.pathname.split("/").pop() || value.hostname),
                url: value.href,
                local: false,
              },
            ]);
            setUrl("");
          } catch {
            setError(t("Enter a valid HTTP or HTTPS audio URL without embedded credentials."));
          }
        }}
      >
        <label htmlFor="web-music-url" className="text-sm font-medium">
          {t("Direct audio link")}
        </label>
        <div className="flex gap-2">
          <input
            id="web-music-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/track.mp3"
            required
            className="min-w-0 flex-1 rounded-xl border border-edge bg-elevated px-3 py-3 text-sm"
          />
          <button
            type="submit"
            className="rounded-xl border border-edge px-4 text-sm font-semibold"
          >
            {t("Add")}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          {t(
            "Use a direct audio file or radio stream supported by your browser. Spotify and YouTube page links are not audio files. Desktop music sources and folder scanning require the desktop app.",
          )}
        </p>
      </form>
      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
          {error}
        </p>
      )}
      {track && (
        <section
          aria-label={t("Now playing")}
          className="rounded-2xl border border-edge-soft bg-elevated p-4"
        >
          <p className="text-xs uppercase tracking-widest text-accent">{t("Now playing")}</p>
          <h2 className="my-3 break-words font-semibold">{track.title}</h2>
          <button
            type="button"
            className="mb-3 flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 text-canvas"
            onClick={() => {
              if (!audio.current) return;
              if (audio.current.paused)
                void audio.current
                  .play()
                  .catch(() =>
                    setError(t("Playback could not start. Check the audio link and try again.")),
                  );
              else audio.current.pause();
            }}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
            {t(playing ? "Pause" : "Play")}
          </button>
          <audio
            ref={audio}
            key={track.id}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            controls
            preload="metadata"
            src={track.url}
            className="w-full"
            onError={() =>
              setError(
                t(
                  "This track could not play. Check the link and whether your browser supports its audio format.",
                ),
              )
            }
            onEnded={() => {
              const next = tracks[tracks.findIndex((item) => item.id === track.id) + 1];
              if (next) choose(next.id);
            }}
          />
        </section>
      )}
      <section aria-label={t("Queue")}>
        <h2 className="mb-3 text-lg font-semibold">
          {t("Queue")} <span className="text-sm text-ink-muted">{tracks.length}</span>
        </h2>
        {tracks.length ? (
          <ul className="flex flex-col gap-2">
            {tracks.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-xl border border-edge-soft bg-elevated/50 p-2"
              >
                <button
                  type="button"
                  aria-current={selected === item.id ? "true" : undefined}
                  onClick={() => choose(item.id)}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-2 text-start"
                >
                  <Music2
                    size={20}
                    className={
                      selected === item.id ? "shrink-0 text-accent" : "shrink-0 text-ink-muted"
                    }
                  />
                  <span className="min-w-0 break-words text-sm">{item.title}</span>
                </button>
                <button
                  type="button"
                  aria-label={t("Remove {title}", { title: item.title })}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted"
                  onClick={() => {
                    setTracks((previous) => previous.filter((other) => other.id !== item.id));
                    if (selected === item.id) setSelected(null);
                    if (item.local) {
                      URL.revokeObjectURL(item.url);
                      objectUrls.current.delete(item.url);
                    }
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-edge p-6 text-sm text-ink-muted">
            {t("Your queue is empty. Add audio to start listening.")}
          </p>
        )}
      </section>
    </div>
  );
}
