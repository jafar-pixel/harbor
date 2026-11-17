import { crossfade } from "../dj/vibes";
import { loadYouTube, youtubeFrame, YT_ENDED, YT_PLAYING, type YtPlayer } from "../dj/youtube";
import type { Playable } from "./types";
import { dbToGain, sameOriginMedia, type WebEqPlan } from "../web-eq";

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

/** A deck's media routed through the EQ: element -> filters -> preamp -> volume -> speakers. */
type SlotEq = {
  source: MediaElementAudioSourceNode;
  filters: BiquadFilterNode[];
  pre: GainNode;
  vol: GainNode;
};

type Slot = {
  root: HTMLDivElement;
  ytMount: HTMLDivElement;
  media: HTMLVideoElement;
  /** Set once the element feeds the EQ; an element can never be taken out of it again. */
  eq: SlotEq | null;
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
  private eqPlan: WebEqPlan | null = null;
  private audio: AudioContext | null = null;
  /** Sites that allow the page to process their sound, by origin. */
  private readonly corsOk = new Map<string, Promise<boolean>>();

  /*
   * A phone's browser (iOS above all) pauses a YouTube embed when the viewer switches apps or locks
   * the screen; a web page can't keep it playing there. The viewer never pressed pause, so when
   * they come back the music carries on by itself instead of sitting paused while the app still
   * shows it playing.
   */
  private readonly onVisible = () => {
    if (document.visibilityState !== "visible" || !this.wantPlaying || !this.slots) return;
    const slot = this.slots[this.live];
    if (this.times(this.live).playing) return;
    if (slot.kind === "youtube") slot.yt?.playVideo();
    if (slot.kind === "media") void slot.media.play().catch(() => undefined);
  };

  constructor(private readonly events: EngineEvents) {}

  /** Build both decks inside `host` (kept mounted for the app's life). */
  attach(host: HTMLElement): void {
    if (this.slots) return;
    const make = (): Slot => {
      const root = document.createElement("div");
      root.className = "wp-deck";
      const ytMount = document.createElement("div");
      ytMount.className = "wp-deck-yt";
      root.append(ytMount);
      host.append(root);
      return {
        root,
        ytMount,
        media: document.createElement("video"),
        eq: null,
        yt: null,
        ytReady: null,
        kind: null,
        loaded: null,
      };
    };
    this.slots = [make(), make()];
    this.slots.forEach((_, i) => this.freshMedia(i));
    this.show();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("pageshow", this.onVisible);
  }

  /** A new media element for deck `i` (also how a deck leaves the EQ: elements can't). */
  private freshMedia(i: number): void {
    const slot = this.slots![i];
    const old = slot.media;
    const media = document.createElement("video");
    media.className = "wp-deck-media";
    media.playsInline = true;
    media.preload = "auto";
    media.addEventListener("ended", () => {
      if (i === this.live && !this.fade && slot.media === media) this.events.ended();
    });
    media.addEventListener("error", () => {
      if (i === this.live && slot.kind === "media" && !this.fade && slot.media === media)
        this.events.failed();
    });
    if (old.isConnected) {
      old.pause();
      old.removeAttribute("src");
      old.load();
      old.replaceWith(media);
    } else slot.root.append(media);
    if (slot.eq) {
      slot.eq.source.disconnect();
      slot.eq.vol.disconnect();
      slot.eq = null;
    }
    slot.media = media;
  }

  /** Whether the page may process the sound at `url` (cached per site). */
  private canProcess(url: string): Promise<boolean> {
    const same = sameOriginMedia(url, location.origin);
    if (same !== null) return Promise.resolve(same);
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return Promise.resolve(false);
    }
    let check = this.corsOk.get(origin);
    if (!check) {
      const ac = new AbortController();
      const timer = window.setTimeout(() => ac.abort(), 4000);
      check = fetch(url, { mode: "cors", headers: { Range: "bytes=0-1" }, signal: ac.signal })
        .then((r) => {
          void r.body?.cancel().catch(() => undefined);
          return r.ok || r.status === 206;
        })
        .catch(() => false)
        .finally(() => window.clearTimeout(timer));
      this.corsOk.set(origin, check);
    }
    return check;
  }

  private context(): AudioContext | null {
    if (this.audio) return this.audio;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.audio = new Ctor();
    } catch {
      return null;
    }
    return this.audio;
  }

  /** Puts deck `i`'s element through the EQ (once; it stays there). */
  private routeEq(i: number): boolean {
    const slot = this.slots![i];
    if (slot.eq) return true;
    const ctx = this.context();
    if (!ctx) return false;
    try {
      const source = ctx.createMediaElementSource(slot.media);
      const pre = ctx.createGain();
      const vol = ctx.createGain();
      slot.eq = { source, filters: [], pre, vol };
      pre.connect(vol);
      vol.connect(ctx.destination);
      this.applyEq(slot.eq);
      return true;
    } catch {
      return false;
    }
  }

  private applyEq(eq: SlotEq): void {
    const ctx = this.audio!;
    eq.source.disconnect();
    for (const f of eq.filters) f.disconnect();
    const plan = this.eqPlan;
    eq.filters = (plan?.filters ?? []).map((f) => {
      const node = ctx.createBiquadFilter();
      node.type = f.type;
      node.frequency.value = f.frequency;
      node.gain.value = f.gain;
      node.Q.value = f.q;
      return node;
    });
    let at: AudioNode = eq.source;
    for (const node of eq.filters) {
      at.connect(node);
      at = node;
    }
    at.connect(eq.pre);
    eq.pre.gain.value = plan ? dbToGain(plan.preampDb) : 1;
  }

  /** The EQ to use from now on (null: off). Songs already playing change at once. */
  setEq(plan: WebEqPlan | null): void {
    this.eqPlan = plan;
    this.slots?.forEach((slot) => {
      if (slot.eq) this.applyEq(slot.eq);
    });
  }

  private resumeAudio(): void {
    if (this.audio?.state === "suspended") void this.audio.resume().catch(() => undefined);
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
      // Through the EQ when it is on and the song's site allows it. An element already in the EQ
      // can only play sound the page may process, so any other song gets a fresh element.
      const eqWanted = !!this.eqPlan || !!slot.eq;
      const processable = eqWanted ? await this.canProcess(p.url) : false;
      if (slot.loaded !== id) return;
      if (slot.eq && !processable) this.freshMedia(i);
      if (processable && (this.eqPlan || slot.eq)) {
        slot.media.crossOrigin = "anonymous";
        if (!this.routeEq(i)) slot.media.removeAttribute("crossorigin");
      }
      slot.media.src = p.url;
      this.setSlotVolume(i, volume);
      if (play) this.resumeAudio();
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
    if (slot.kind !== "media") return;
    const level = Math.max(0, Math.min(1, v / 100));
    // In the EQ the element plays at full level and the EQ sets the volume (some browsers ignore
    // an element's volume once the page processes its sound).
    if (slot.eq) {
      slot.media.volume = 1;
      slot.eq.vol.gain.value = level;
    } else slot.media.volume = level;
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
    this.resumeAudio();
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
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("pageshow", this.onVisible);
    this.each((slot) => {
      slot.yt?.destroy();
      slot.media.pause();
      slot.root.remove();
    });
    this.slots = null;
    void this.audio?.close().catch(() => undefined);
    this.audio = null;
  }
}
