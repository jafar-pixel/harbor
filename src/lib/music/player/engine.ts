import { crossfade } from "../dj/vibes";
import { loadYouTube, youtubeFrame, YT_ENDED, YT_PLAYING, type YtPlayer } from "../dj/youtube";
import type { Playable } from "./types";

/**
 * The shared web player's two decks. Each deck plays a YouTube video (an embed) or a media URL
 * (a <video> element, which also plays audio files). Near the end of a song the next one starts
 * on the other deck and both picture and sound crossfade. The store (./store) decides what plays;
 * the engine reports time and tells it when a song finished or failed.
 */

export type EngineEvents = {
  /** The song on the live deck ended without a crossfade. */
  ended: () => void;
  /** The live deck can't play its song. */
  failed: () => void;
  /** A crossfade finished: the next song is now live. */
  advanced: () => void;
  /** Called every tick with the live deck's time. */
  time: (position: number, duration: number, playing: boolean) => void;
};

const TICK_MS = 250;

type Slot = {
  root: HTMLDivElement;
  ytMount: HTMLDivElement;
  media: HTMLVideoElement;
  yt: YtPlayer | null;
  ytReady: Promise<YtPlayer> | null;
  kind: Playable["kind"] | null;
  loaded: string | null;
};

export class PlayerEngine {
  private slots: [Slot, Slot] | null = null;
  private live = 0;
  private next: Playable | null = null;
  private fade: { start: number; ms: number } | null = null;
  private volume = 80;
  private wantPlaying = false;
  private fadeSecs = 6;
  private timer: number | null = null;

  constructor(private readonly events: EngineEvents) {}

  /** Build both decks inside `host` (kept mounted for the app's life). */
  attach(host: HTMLElement): void {
    if (this.slots) return;
    const make = (): Slot => {
      const root = document.createElement("div");
      root.className = "wp-deck";
      const ytMount = document.createElement("div");
      ytMount.className = "wp-deck-yt";
      const media = document.createElement("video");
      media.className = "wp-deck-media";
      media.playsInline = true;
      media.preload = "auto";
      root.append(ytMount, media);
      host.append(root);
      return { root, ytMount, media, yt: null, ytReady: null, kind: null, loaded: null };
    };
    this.slots = [make(), make()];
    this.slots.forEach((slot, i) => {
      slot.media.addEventListener("ended", () => {
        if (i === this.live && !this.fade) this.events.ended();
      });
      slot.media.addEventListener("error", () => {
        if (i === this.live && slot.kind === "media" && !this.fade) this.events.failed();
      });
    });
    this.show();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }

  private youtube(i: number): Promise<YtPlayer> {
    const slot = this.slots![i];
    slot.ytReady ??= loadYouTube().then(
      (api) =>
        new Promise<YtPlayer>((resolve) => {
          const frame = youtubeFrame(slot.ytMount, {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
          });
          const player: YtPlayer = new api.Player(frame, {
            events: {
              onReady: () => resolve(player),
              onStateChange: ({ data }: { data: number }) => {
                if (data === YT_ENDED && i === this.live && !this.fade) this.events.ended();
              },
              onError: () => {
                if (i === this.live && slot.kind === "youtube" && !this.fade) this.events.failed();
              },
            },
          });
          slot.yt = player;
        }),
    );
    slot.ytReady.catch(() => {
      slot.ytReady = null;
    });
    return slot.ytReady;
  }

  private async loadInto(i: number, p: Playable, at: number, play: boolean, volume: number) {
    const slot = this.slots![i];
    const id = p.kind === "youtube" ? p.videoId : p.url;
    if (slot.kind === "youtube" && p.kind !== "youtube") slot.yt?.stopVideo();
    if (slot.kind === "media" && p.kind !== "media") {
      slot.media.pause();
      slot.media.removeAttribute("src");
    }
    slot.kind = p.kind;
    slot.loaded = id;
    slot.root.dataset.kind = p.kind;
    if (p.kind === "youtube") {
      const yt = await this.youtube(i);
      if (slot.loaded !== id) return;
      yt.setVolume(volume);
      if (play) yt.loadVideoById(p.videoId);
      else yt.cueVideoById(p.videoId);
      if (at > 0) yt.seekTo(at, true);
    } else {
      slot.media.src = p.url;
      slot.media.volume = volume / 100;
      if (at > 0) slot.media.currentTime = at;
      if (play) await slot.media.play().catch(() => this.events.failed());
    }
  }

  private stopSlot(i: number) {
    const slot = this.slots![i];
    if (slot.kind === "youtube") slot.yt?.stopVideo();
    if (slot.kind === "media") {
      slot.media.pause();
      slot.media.removeAttribute("src");
      slot.media.load();
    }
    slot.kind = null;
    slot.loaded = null;
  }

  private setSlotVolume(i: number, v: number) {
    const slot = this.slots![i];
    if (slot.kind === "youtube") slot.yt?.setVolume(v);
    if (slot.kind === "media") slot.media.volume = Math.max(0, Math.min(1, v / 100));
  }

  private show(opacity: [number, number] = this.live === 0 ? [1, 0] : [0, 1]) {
    this.slots?.forEach((slot, i) => {
      slot.root.style.opacity = String(opacity[i]);
      slot.root.style.zIndex = i === this.live ? "1" : "2";
    });
  }

  /** Start a song on the live deck now (a pick, a skip or a retry). */
  async start(p: Playable, at = 0, play = true): Promise<void> {
    if (!this.slots) return;
    if (this.fade) this.finishFade(false);
    this.wantPlaying = play;
    this.stopSlot(1 - this.live);
    this.show();
    await this.loadInto(this.live, p, at, play, this.volume);
  }

  /** The song after this one, for the crossfade (null: none, stop at the end). */
  setNext(p: Playable | null): void {
    this.next = p;
  }

  setCrossfade(seconds: number): void {
    this.fadeSecs = Math.max(0, Math.min(12, seconds));
  }

  play(): void {
    this.wantPlaying = true;
    this.each((slot, i) => {
      if (i !== this.live && !this.fade) return;
      if (slot.kind === "youtube") slot.yt?.playVideo();
      if (slot.kind === "media") void slot.media.play().catch(() => undefined);
    });
  }

  pause(): void {
    this.wantPlaying = false;
    this.each((slot) => {
      if (slot.kind === "youtube") slot.yt?.pauseVideo();
      if (slot.kind === "media") slot.media.pause();
    });
  }

  stop(): void {
    this.wantPlaying = false;
    if (this.fade) this.fade = null;
    if (this.slots) [0, 1].forEach((i) => this.stopSlot(i));
    this.show();
  }

  seek(seconds: number): void {
    if (this.fade) this.finishFade(true);
    const slot = this.slots?.[this.live];
    if (slot?.kind === "youtube") slot.yt?.seekTo(seconds, true);
    if (slot?.kind === "media") slot.media.currentTime = seconds;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (!this.fade && this.slots) this.setSlotVolume(this.live, v);
  }

  private each(fn: (slot: Slot, i: number) => void) {
    this.slots?.forEach(fn);
  }

  private times(i: number): { position: number; duration: number; playing: boolean } {
    const slot = this.slots![i];
    if (slot.kind === "youtube" && slot.yt) {
      try {
        return {
          position: slot.yt.getCurrentTime() || 0,
          duration: slot.yt.getDuration() || 0,
          playing: slot.yt.getPlayerState() === YT_PLAYING,
        };
      } catch {
        return { position: 0, duration: 0, playing: false };
      }
    }
    if (slot.kind === "media")
      return {
        position: slot.media.currentTime || 0,
        duration: Number.isFinite(slot.media.duration) ? slot.media.duration : 0,
        playing: !slot.media.paused,
      };
    return { position: 0, duration: 0, playing: false };
  }

  private finishFade(advance: boolean) {
    const from = this.live;
    this.stopSlot(from);
    this.live = 1 - from;
    this.fade = null;
    this.setSlotVolume(this.live, this.volume);
    this.show();
    if (advance) this.events.advanced();
  }

  private tick() {
    if (!this.slots) return;
    const now = this.times(this.live);
    this.events.time(now.position, now.duration, now.playing || !!this.fade);
    if (!this.wantPlaying) return;
    const f = this.fade;
    if (f) {
      const p = (Date.now() - f.start) / f.ms;
      const [out, inn] = crossfade(p);
      this.setSlotVolume(this.live, out * this.volume);
      this.setSlotVolume(1 - this.live, inn * this.volume);
      this.show(this.live === 0 ? [out, inn] : [inn, out]);
      if (p >= 1) this.finishFade(true);
      return;
    }
    const left = now.duration - now.position;
    if (
      this.next &&
      this.fadeSecs > 0 &&
      now.playing &&
      now.duration > 30 &&
      left > 0 &&
      left <= this.fadeSecs
    ) {
      const incoming = this.next;
      this.next = null;
      const ms = Math.max(1000, (left - 0.3) * 1000);
      this.fade = { start: Date.now(), ms };
      this.loadInto(1 - this.live, incoming, 0, true, 0).catch(() => {
        // The next song can't load: finish this one and let the store move on.
        this.fade = null;
        this.setSlotVolume(this.live, this.volume);
        this.show();
      });
    }
  }

  destroy(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.each((slot) => {
      slot.yt?.destroy();
      slot.media.pause();
      slot.root.remove();
    });
    this.slots = null;
  }
}
