import { isWeb } from "@/lib/platform";
import { addAudio, crateItem } from "./library";

/**
 * YouTube Music songs as music on the audio decks, in the desktop app. The app's own YouTube
 * Music connector finds the song's audio stream (the one its player and downloads use), the
 * stream is saved to the app's cache, and the file joins the crate like any music file, so the
 * decks get their waveform, beat grid, key, EQ and effects. A web page can't do this: YouTube's
 * sound stays inside its own player there, so the website mixes YouTube on the video decks.
 */

export type MixSong = { videoId: string; title: string; artist: string; art: string | null };

/** Whether YouTube Music songs can go on the audio decks here (the desktop app). */
export const youtubeOnAudioDecks = (): boolean => !isWeb();

const CACHE_DIR = "dj-studio";
/** Songs kept in the cache; older ones are removed as new ones arrive. */
const KEEP_FILES = 60;
const pending = new Map<string, Promise<string>>();

export const youtubeCrateId = (videoId: string) => `yt:${videoId}`;

/** The crate id of the song's audio, fetching it first when needed. */
export function youtubeAudio(song: MixSong): Promise<string> {
  const id = youtubeCrateId(song.videoId);
  if (crateItem(id)) return Promise.resolve(id);
  let job = pending.get(id);
  if (!job) {
    job = fetchAudio(song, id).finally(() => pending.delete(id));
    pending.set(id, job);
  }
  return job;
}

async function fetchAudio(song: MixSong, id: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(song.videoId)) throw new Error("That song has no YouTube video.");
  const [{ invoke }, path, fs, { startDownload }, { audioContainer }, { directDownloadError }] =
    await Promise.all([
      import("@tauri-apps/api/core"),
      import("@tauri-apps/api/path"),
      import("@tauri-apps/plugin-fs"),
      import("@/lib/download/video-download"),
      import("@/lib/music/downloads"),
      import("@/lib/download/offline-policy"),
    ]);
  const stream = await invoke<{
    url: string;
    mimeType?: string;
    httpHeaders?: Record<string, string>;
  }>("music_resolve_stream", {
    track: {
      id: song.videoId,
      connectorId: "youtube",
      sourceId: song.videoId,
      mediaKind: "audio",
      title: song.title,
      artist: song.artist,
      artwork: song.art ?? "",
      durationSeconds: 0,
      durationLabel: "",
    },
  });
  if (
    directDownloadError(stream.url) ||
    /(?:mpegurl|dash\+xml)/i.test(stream.mimeType ?? "") ||
    /\.m3u8(?:[?#]|$)/i.test(stream.url)
  )
    throw new Error("YouTube Music only offered this song as a live stream. Try another song.");
  const folder = await path.join(await path.appCacheDir(), CACHE_DIR);
  await fs.mkdir(folder, { recursive: true });
  const ext = audioContainer(stream.mimeType, stream.url);
  const file = await path.join(folder, `${song.videoId}.${ext}`);
  if (!(await fs.exists(file))) {
    await startDownload(
      `studio:${song.videoId}`,
      stream.url,
      file,
      () => {},
      stream.httpHeaders,
      "audio",
    ).promise;
    void prune(folder, fs, path).catch(() => undefined);
  }
  const bytes = await fs.readFile(file);
  const blob = new File([bytes], `${song.artist} - ${song.title}.${ext}`, {
    type: stream.mimeType?.split(";")[0] || "",
  });
  addAudio(id, blob, { title: song.title, artist: song.artist, art: song.art });
  return id;
}

/** Keeps the newest songs in the studio cache. */
async function prune(
  folder: string,
  fs: typeof import("@tauri-apps/plugin-fs"),
  path: typeof import("@tauri-apps/api/path"),
): Promise<void> {
  const entries = (await fs.readDir(folder)).filter((e) => e.isFile);
  if (entries.length <= KEEP_FILES) return;
  const dated = await Promise.all(
    entries.map(async (e) => {
      const full = await path.join(folder, e.name);
      const info = await fs.stat(full);
      return { full, at: info.mtime?.getTime() ?? 0 };
    }),
  );
  dated.sort((a, b) => b.at - a.at);
  for (const old of dated.slice(KEEP_FILES)) await fs.remove(old.full);
}
