import { useSyncExternalStore } from "react";
import { pauseDj } from "../dj/playhead";
import { loadYouTube, youtubeFrame, YT_ENDED, YT_PLAYING, type YtPlayer } from "../dj/youtube";
import { pausePlayer } from "../player/store";
import { xfadeGains, type XfadeCurve } from "./engine";

/**
 * DJ Studio's video decks: two YouTube players (your YouTube Music songs, music videos) mixed
 * with a crossfader that blends both picture and sound. YouTube plays inside its own embed,
 * so these decks control volume, tempo (YouTube's speed steps), cue and position; waveform,
 * EQ and beat sync stay with the audio decks.
 */

export type VideoSong = {
  videoId: string;
  title: string;
  artist: string;
  art: string | null;
  bpm?: number;
  key?: string;
};

export type VideoDeck = {
  song: VideoSong | null;
  playing: boolean;
  position: number;
  duration: number;
  rate: number;
  rates: number[];
  volume: number;
};

type State = {
  decks: [VideoDeck, VideoDeck];
  crossfader: number;
  curve: XfadeCurve;
  /** An automatic blend from one side to the other is running. */
  blending: boolean;
  error: string | null;
};

const empty = (): VideoDeck => ({
  song: null,
  playing: false,
  position: 0,
  duration: 0,
  rate: 1,
  rates: [1],
  volume: 90,
});

let state: State = {
  decks: [empty(), empty()],
  crossfader: -1,
  curve: "smooth",
  blending: false,
  error: null,
};
const listeners = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}
function patchDeck(i: 0 | 1, patch: Partial<VideoDeck>) {
  const decks = [...state.decks] as [VideoDeck, VideoDeck];
  decks[i] = { ...decks[i], ...patch };
  set({ decks });
}

export const videoDecksState = () => state;
export function useVideoDecks(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    videoDecksState,
    videoDecksState,
  );
}

const players: [YtPlayer | null, YtPlayer | null] = [null, null];
let ready: Promise<void> | null = null;
let mounts: [HTMLElement, HTMLElement] | null = null;
let timer = 0;

/** The two players live in the screen's slots; created once per screen. */
export function attachVideoDecks(a: HTMLElement, b: HTMLElement): () => void {
  mounts = [a, b];
  ready = loadYouTube()
    .then((api) =>
      Promise.all(
        ([0, 1] as const).map(
          (i) =>
            new Promise<void>((resolve) => {
              const frame = youtubeFrame(mounts![i], {
                autoplay: 0,
                controls: 0,
                disablekb: 1,
                playsinline: 1,
                rel: 0,
                iv_load_policy: 3,
              });
              const p: YtPlayer = new api.Player(frame, {
                events: {
                  onReady: () => resolve(),
                  onStateChange: ({ data }: { data: number }) => {
                    if (data === YT_ENDED) patchDeck(i, { playing: false });
                  },
                  onError: () =>
                    set({ error: "That video can't be played here. Try another song." }),
                },
              });
              players[i] = p;
            }),
        ),
      ).then(() => undefined),
    )
    .catch((e: unknown) => {
      set({ error: e instanceof Error ? e.message : String(e) });
    });
  timer = window.setInterval(tick, 250);
  return () => {
    window.clearInterval(timer);
    for (const i of [0, 1] as const) {
      players[i]?.destroy();
      players[i] = null;
    }
    mounts = null;
    ready = null;
    set({
      decks: [
        { ...state.decks[0], playing: false },
        { ...state.decks[1], playing: false },
      ],
    });
  };
}

function tick() {
  for (const i of [0, 1] as const) {
    const p = players[i];
    if (!p || !state.decks[i].song) continue;
    try {
      const position = p.getCurrentTime() || 0;
      const duration = p.getDuration() || 0;
      const playing = p.getPlayerState() === YT_PLAYING;
      const d = state.decks[i];
      if (Math.abs(position - d.position) > 0.2 || duration !== d.duration || playing !== d.playing)
        patchDeck(i, { position, duration, playing });
    } catch {
      /* the player is still loading */
    }
  }
}

/** Volume each deck plays at: its fader times its side of the crossfader. */
function apply() {
  const [ga, gb] = xfadeGains(state.crossfader, state.curve);
  const gains = [ga, gb];
  for (const i of [0, 1] as const)
    players[i]?.setVolume(Math.round(state.decks[i].volume * gains[i]));
}

/** How visible each deck is on the screen (the same curve as the sound). */
export function screenMix(x = state.crossfader): [number, number] {
  const t = (Math.max(-1, Math.min(1, x)) + 1) / 2;
  return [1 - t, t];
}

export async function loadVideoDeck(i: 0 | 1, song: VideoSong): Promise<void> {
  await ready;
  const p = players[i];
  if (!p) return;
  p.cueVideoById(song.videoId);
  patchDeck(i, { song, playing: false, position: 0, duration: 0, rate: 1 });
  // Speed steps show up once the video has loaded.
  window.setTimeout(() => {
    const rates = players[i]?.getAvailablePlaybackRates?.() ?? [1];
    patchDeck(i, { rates: rates.length ? rates : [1] });
  }, 1500);
  apply();
}

export function toggleVideoDeck(i: 0 | 1) {
  const p = players[i];
  if (!p || !state.decks[i].song) return;
  if (state.decks[i].playing) p.pauseVideo();
  else {
    pausePlayer();
    pauseDj();
    apply();
    p.playVideo();
  }
}

export function cueVideoDeck(i: 0 | 1) {
  players[i]?.seekTo(0, true);
  players[i]?.pauseVideo();
}

export function seekVideoDeck(i: 0 | 1, seconds: number) {
  players[i]?.seekTo(Math.max(0, seconds), true);
}

/** Step the deck's speed up or down through YouTube's allowed speeds. */
export function nudgeRate(i: 0 | 1, dir: 1 | -1) {
  const d = state.decks[i];
  const rates = [...d.rates].sort((a, b) => a - b);
  const at = rates.indexOf(d.rate);
  const next =
    rates[Math.max(0, Math.min(rates.length - 1, (at < 0 ? rates.indexOf(1) : at) + dir))];
  if (next === undefined) return;
  players[i]?.setPlaybackRate?.(next);
  patchDeck(i, { rate: next });
}

export function setVideoVolume(i: 0 | 1, volume: number) {
  patchDeck(i, { volume: Math.max(0, Math.min(100, volume)) });
  apply();
}

export function setVideoCrossfader(x: number) {
  set({ crossfader: Math.max(-1, Math.min(1, x)) });
  apply();
}

export function setVideoCurve(curve: XfadeCurve) {
  set({ curve });
  apply();
}

/**
 * Blend to the other deck over `seconds` (a musical phrase at the playing deck's tempo when
 * known), starting the incoming deck first.
 */
export function autoBlend(seconds?: number) {
  if (state.blending) return;
  const to: 0 | 1 = state.crossfader <= 0 ? 1 : 0;
  if (!state.decks[to].song) return;
  const from = state.decks[1 - to];
  const bpm = from.song?.bpm;
  const ms = (seconds ?? (bpm ? Math.max(6, Math.min(16, (32 * 60) / bpm)) : 10)) * 1000;
  if (!state.decks[to].playing) toggleVideoDeck(to);
  const start = performance.now();
  const startX = state.crossfader;
  const endX = to === 1 ? 1 : -1;
  set({ blending: true });
  const step = () => {
    const p = Math.min(1, (performance.now() - start) / ms);
    setVideoCrossfader(startX + (endX - startX) * p);
    if (p < 1) requestAnimationFrame(step);
    else {
      set({ blending: false });
      // The outgoing deck stops once it's out of the mix.
      players[(1 - to) as 0 | 1]?.pauseVideo();
    }
  };
  requestAnimationFrame(step);
}

export function clearVideoError() {
  set({ error: null });
}
