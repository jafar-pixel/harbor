import { useSyncExternalStore } from "react";
import { searchVideos } from "../dj/api";
import { pauseDj } from "../dj/playhead";
import { pickVideo } from "../dj/vibes";
import { PlayerEngine } from "./engine";
import { trackKey, type Playable, type PlayerTrack, type RepeatMode } from "./types";

/**
 * The shared web player: one queue for the whole Music Hub (playlists, search, Automix, the
 * Lounge and DJ Studio all add to it), shuffle and repeat, crossfade, a sleep timer and the
 * system media controls. The engine (./engine) plays; this store decides what.
 */

export type PlayerView = "mini" | "full";
export type PlayerState = {
  queue: PlayerTrack[];
  /** The playing entry, or -1 when nothing was started. */
  index: number;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Seconds of crossfade between songs (0: none). */
  crossfade: number;
  /** Automix: each transition lasts a musical phrase (16 beats) at the song's tempo. */
  automix: boolean;
  /** When the sleep timer stops the music (ms since epoch), or at the end of this song. */
  sleepAt: number | null;
  sleepAfterSong: boolean;
  view: PlayerView;
  queueOpen: boolean;
  /** Where the queue came from ("Spotify · Liked songs"). */
  context: string | null;
  error: string | null;
};

const STORE_KEY = "jl.music.player.v1";

type Saved = Pick<
  PlayerState,
  "queue" | "index" | "volume" | "shuffle" | "repeat" | "crossfade" | "automix" | "context"
>;

function readSaved(): Partial<Saved> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null") as Partial<Saved> | null;
    if (!v || !Array.isArray(v.queue)) return {};
    return v;
  } catch {
    return {};
  }
}

const saved = readSaved();
let state: PlayerState = {
  queue: saved.queue ?? [],
  index: Math.min(saved.index ?? -1, (saved.queue?.length ?? 0) - 1),
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  volume: saved.volume ?? 80,
  muted: false,
  shuffle: saved.shuffle ?? false,
  repeat: saved.repeat ?? "off",
  crossfade: saved.crossfade ?? 6,
  automix: saved.automix ?? false,
  sleepAt: null,
  sleepAfterSong: false,
  view: "mini",
  queueOpen: false,
  context: saved.context ?? null,
  error: null,
};
/** The order before shuffle, to put back when it's turned off. */
let unshuffled: PlayerTrack[] | null = null;

const listeners = new Set<() => void>();
let saveTimer: number | null = null;

function set(next: Partial<PlayerState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
  if (
    "queue" in next ||
    "index" in next ||
    "volume" in next ||
    "shuffle" in next ||
    "repeat" in next ||
    "crossfade" in next ||
    "automix" in next
  ) {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(save, 400);
  }
}

function save() {
  // Files picked from this computer only play in this page; don't keep them.
  const queue = state.queue.filter((t) => t.source !== "file");
  const current = state.queue[state.index];
  const index = current ? queue.indexOf(current) : -1;
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        queue: queue.slice(0, 500),
        index,
        volume: state.volume,
        shuffle: state.shuffle,
        repeat: state.repeat,
        crossfade: state.crossfade,
        automix: state.automix,
        context: state.context,
      } satisfies Saved),
    );
  } catch {
    /* storage full or blocked */
  }
}

export const playerState = () => state;
export function subscribePlayer(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribePlayer, playerState, playerState);
}

export const currentTrack = (): PlayerTrack | null => state.queue[state.index] ?? null;

/** What the shared player plays as a YouTube video (what a Lounge can share), or null. */
export function playerPlayhead(): {
  videoId: string;
  artist: string;
  title: string;
  position: number;
  paused: boolean;
} | null {
  const track = currentTrack();
  if (!track?.videoId || state.loading || state.duration === 0) return null;
  return {
    videoId: track.videoId,
    artist: track.artist,
    title: track.title,
    position: state.position,
    paused: !state.playing,
  };
}

// ---- Finding something playable --------------------------------------------------------------

const matched = new Map<string, string | null>();

/** A song's deck source: its own video or stream, else its YouTube match. */
export async function resolvePlayable(track: PlayerTrack): Promise<Playable | null> {
  if (track.videoId) return { kind: "youtube", videoId: track.videoId };
  if (track.url) return { kind: "media", url: track.url };
  const key = `${track.artist} - ${track.title}`.toLowerCase();
  if (!matched.has(key)) {
    const results = await searchVideos(`${track.artist} - ${track.title}`);
    const best = pickVideo({ artist: track.artist, title: track.title, why: "" }, results);
    matched.set(key, best?.id ?? results[0]?.id ?? null);
  }
  const id = matched.get(key);
  if (!id) return null;
  track.videoId = id;
  return { kind: "youtube", videoId: id };
}

// ---- The engine -------------------------------------------------------------------------------

let engine: PlayerEngine | null = null;
let run = 0;
let failures = 0;

/** The player host mounts the decks once (see components/music/web-player). */
export function attachPlayer(host: HTMLElement): () => void {
  if (!engine) {
    engine = new PlayerEngine({
      ended: () => afterSong(),
      failed: () => {
        failures += 1;
        if (failures > 3) {
          set({ playing: false, error: "These songs won't play here. Try another playlist." });
          return;
        }
        afterSong(true);
      },
      advanced: () => {
        failures = 0;
        if (state.sleepAfterSong) {
          engine?.pause();
          set({ sleepAfterSong: false, playing: false });
        }
        const i = nextIndex();
        if (i >= 0) set({ index: i, position: 0 });
        void prepareNext();
        announce();
      },
      time: (position, duration, playing) => {
        if (state.sleepAt && Date.now() >= state.sleepAt) {
          engine?.pause();
          set({ sleepAt: null, playing: false });
          return;
        }
        if (
          Math.abs(position - state.position) >= 0.2 ||
          duration !== state.duration ||
          (playing && !state.playing && !state.loading)
        )
          set({ position, duration, ...(playing && !state.loading ? { playing: true } : {}) });
      },
    });
    engine.setVolume(state.muted ? 0 : state.volume);
    engine.setCrossfade(state.crossfade);
  }
  engine.attach(host);
  return () => undefined;
}

function nextIndex(): number {
  if (!state.queue.length) return -1;
  if (state.repeat === "one") return state.index;
  const i = state.index + 1;
  if (i < state.queue.length) return i;
  return state.repeat === "all" ? 0 : -1;
}

/** A 16-beat phrase at this tempo, kept between 5 and 12 seconds. */
export function phraseSeconds(bpm: number | undefined): number | null {
  if (!bpm || bpm < 50) return null;
  return Math.max(5, Math.min(12, Math.round(((16 * 60) / bpm) * 10) / 10));
}

function fadeFor(current: PlayerTrack | null, upcoming: PlayerTrack | null): number {
  if (!state.automix) return state.crossfade;
  return phraseSeconds(current?.bpm ?? upcoming?.bpm) ?? Math.max(state.crossfade, 8);
}

async function prepareNext() {
  const i = nextIndex();
  engine?.setCrossfade(fadeFor(currentTrack(), i >= 0 ? (state.queue[i] ?? null) : null));
  const track = i >= 0 && i !== state.index ? state.queue[i] : null;
  if (!track) {
    engine?.setNext(state.repeat === "one" && currentTrack() ? await safe(currentTrack()!) : null);
    return;
  }
  engine?.setNext(await safe(track));
}

async function safe(track: PlayerTrack): Promise<Playable | null> {
  try {
    return await resolvePlayable(track);
  } catch {
    return null;
  }
}

function afterSong(skipFailed = false) {
  if (state.sleepAfterSong && !skipFailed) {
    set({ sleepAfterSong: false, playing: false });
    return;
  }
  const i = nextIndex();
  if (i < 0) {
    engine?.stop();
    set({ playing: false, position: 0 });
    return;
  }
  void startAt(i);
}

async function startAt(i: number, at = 0) {
  const track = state.queue[i];
  if (!track || !engine) return;
  const mine = ++run;
  pauseDj();
  set({ index: i, loading: true, playing: true, position: at, duration: 0, error: null });
  announce();
  let p: Playable | null = null;
  try {
    p = await resolvePlayable(track);
  } catch (error) {
    if (mine !== run) return;
    set({
      loading: false,
      playing: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (mine !== run) return;
  if (!p) {
    set({ loading: false });
    afterSong(true);
    return;
  }
  try {
    await engine.start(p, at, true);
  } catch (error) {
    // The player itself didn't load (offline, or blocked by an extension).
    if (mine === run)
      set({
        loading: false,
        playing: false,
        error: error instanceof Error ? error.message : String(error),
      });
    return;
  }
  if (mine !== run) return;
  set({ loading: false });
  void prepareNext();
}

// ---- Actions ----------------------------------------------------------------------------------

/** Replace the queue and play from `start`. */
export function playTracks(
  tracks: Omit<PlayerTrack, "key">[],
  start = 0,
  context: string | null = null,
): void {
  if (!tracks.length) return;
  const queue = tracks.map((t) => ({ ...t, key: trackKey() }));
  unshuffled = null;
  let index = Math.max(0, Math.min(start, queue.length - 1));
  if (state.shuffle) {
    unshuffled = queue.slice();
    const first = queue[index];
    const rest = shuffled(queue.filter((t) => t !== first));
    queue.splice(0, queue.length, first, ...rest);
    index = 0;
  }
  failures = 0;
  set({ queue, index, context, view: state.view });
  void startAt(index);
}

/** Add to the end of the queue (starts playing when nothing was). */
export function addToQueue(tracks: Omit<PlayerTrack, "key">[]): void {
  if (!tracks.length) return;
  const added = tracks.map((t) => ({ ...t, key: trackKey() }));
  if (unshuffled) unshuffled.push(...added);
  const wasEmpty = state.index < 0 || !state.queue.length;
  set({ queue: [...state.queue, ...added] });
  if (wasEmpty) void startAt(state.queue.length - added.length);
  else void prepareNext();
}

/** Play these right after the current song. */
export function playNext(tracks: Omit<PlayerTrack, "key">[]): void {
  if (!tracks.length) return;
  if (state.index < 0) return addToQueue(tracks);
  const added = tracks.map((t) => ({ ...t, key: trackKey() }));
  const queue = state.queue.slice();
  queue.splice(state.index + 1, 0, ...added);
  if (unshuffled) unshuffled.push(...added);
  set({ queue });
  void prepareNext();
}

/** Play this song now, keeping the rest of the queue (previews and requests). */
export function playNow(track: Omit<PlayerTrack, "key">): void {
  const added = { ...track, key: trackKey() };
  if (state.index < 0) {
    playTracks([track]);
    return;
  }
  const queue = state.queue.slice();
  queue.splice(state.index + 1, 0, added);
  if (unshuffled) unshuffled.push(added);
  set({ queue });
  void startAt(state.index + 1);
}

/** Turn Automix on or off: phrase-long transitions timed to each song's tempo. */
export function setAutomix(on: boolean): void {
  set({ automix: on });
  void prepareNext();
}

export function jumpTo(i: number): void {
  if (i >= 0 && i < state.queue.length) void startAt(i);
}

export function removeAt(i: number): void {
  if (i < 0 || i >= state.queue.length) return;
  const queue = state.queue.slice();
  const [gone] = queue.splice(i, 1);
  if (unshuffled) unshuffled = unshuffled.filter((t) => t !== gone);
  if (i === state.index) {
    set({ queue, index: Math.min(i, queue.length - 1) });
    if (queue.length) void startAt(Math.min(i, queue.length - 1));
    else {
      engine?.stop();
      set({ index: -1, playing: false });
    }
    return;
  }
  set({ queue, index: i < state.index ? state.index - 1 : state.index });
  void prepareNext();
}

export function moveTrack(from: number, to: number): void {
  if (from === to || from < 0 || to < 0 || from >= state.queue.length || to >= state.queue.length)
    return;
  const queue = state.queue.slice();
  const [item] = queue.splice(from, 1);
  queue.splice(to, 0, item);
  const current = state.queue[state.index];
  set({ queue, index: current ? queue.indexOf(current) : state.index });
  void prepareNext();
}

/** Keep only the playing song. */
export function clearUpNext(): void {
  const current = currentTrack();
  unshuffled = null;
  set({ queue: current ? [current] : [], index: current ? 0 : -1 });
  void prepareNext();
}

export function togglePlay(): void {
  if (!engine) return;
  if (state.playing) {
    engine.pause();
    set({ playing: false });
    return;
  }
  if (state.index < 0) {
    if (state.queue.length) void startAt(0);
    return;
  }
  // A queue restored from last time has nothing loaded yet.
  if (state.duration === 0 && !state.loading) {
    void startAt(state.index, state.position);
    return;
  }
  pauseDj();
  engine.play();
  set({ playing: true });
}

export function pausePlayer(): void {
  if (!state.playing) return;
  engine?.pause();
  set({ playing: false });
}

export function next(): void {
  const i =
    state.index + 1 < state.queue.length ? state.index + 1 : state.repeat === "all" ? 0 : -1;
  if (i >= 0) void startAt(i);
}

/** Back to the start of the song, or the one before when it just started. */
export function previous(): void {
  if (state.position > 4 || state.index <= 0) {
    seek(0);
    return;
  }
  void startAt(state.index - 1);
}

export function seek(seconds: number): void {
  engine?.seek(Math.max(0, seconds));
  set({ position: Math.max(0, seconds) });
}

export function setVolume(volume: number): void {
  const v = Math.max(0, Math.min(100, Math.round(volume)));
  engine?.setVolume(v);
  set({ volume: v, muted: false });
}

export function toggleMute(): void {
  const muted = !state.muted;
  engine?.setVolume(muted ? 0 : state.volume);
  set({ muted });
}

function shuffled<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function toggleShuffle(): void {
  const current = currentTrack();
  if (!state.shuffle) {
    unshuffled = state.queue.slice();
    const before = state.queue.slice(0, state.index + 1);
    const after = shuffled(state.queue.slice(state.index + 1));
    set({ shuffle: true, queue: [...before, ...after] });
  } else {
    const queue = unshuffled ?? state.queue;
    unshuffled = null;
    set({ shuffle: false, queue, index: current ? queue.indexOf(current) : state.index });
  }
  void prepareNext();
}

export function cycleRepeat(): void {
  const order: RepeatMode[] = ["off", "all", "one"];
  set({ repeat: order[(order.indexOf(state.repeat) + 1) % order.length] });
  void prepareNext();
}

export function setCrossfade(seconds: number): void {
  const v = Math.max(0, Math.min(12, Math.round(seconds)));
  engine?.setCrossfade(v);
  set({ crossfade: v });
  void prepareNext();
}

/** Stop after `minutes`, at the end of this song ("song"), or turn the timer off (null). */
export function setSleepTimer(choice: number | "song" | null): void {
  if (choice === "song") set({ sleepAt: null, sleepAfterSong: true });
  else if (choice === null) set({ sleepAt: null, sleepAfterSong: false });
  else set({ sleepAt: Date.now() + choice * 60_000, sleepAfterSong: false });
}

export function setPlayerView(view: PlayerView): void {
  set({ view });
}

export function toggleQueue(open = !state.queue.length ? false : !state.queueOpen): void {
  set({ queueOpen: open });
}

/** Stop and empty the player. */
export function closePlayer(): void {
  run += 1;
  engine?.stop();
  unshuffled = null;
  set({ queue: [], index: -1, playing: false, position: 0, duration: 0, view: "mini" });
  releaseMediaKeys();
}

// ---- System media controls --------------------------------------------------------------------

function announce() {
  const track = currentTrack();
  claimMediaKeys();
  const session = typeof navigator !== "undefined" ? navigator.mediaSession : undefined;
  if (!session || !track || typeof MediaMetadata === "undefined") return;
  session.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album ?? "",
    artwork: track.art ? [{ src: track.art, sizes: "512x512" }] : [],
  });
}

// Media keys belong to the music only once it plays (movies use them too).
let handlersSet = false;
function claimMediaKeys() {
  if (handlersSet || typeof navigator === "undefined" || !navigator.mediaSession) return;
  handlersSet = true;
  const handlers: [MediaSessionAction, () => void][] = [
    ["play", () => !state.playing && togglePlay()],
    ["pause", () => state.playing && togglePlay()],
    ["nexttrack", next],
    ["previoustrack", previous],
  ];
  for (const [action, fn] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {
      /* not supported here */
    }
  }
}

function releaseMediaKeys() {
  if (!handlersSet || !navigator.mediaSession) return;
  handlersSet = false;
  for (const action of ["play", "pause", "nexttrack", "previoustrack"] as MediaSessionAction[]) {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch {
      /* not supported here */
    }
  }
}
