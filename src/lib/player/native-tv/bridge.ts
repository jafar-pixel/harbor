import {
  emptySnapshot,
  type PlayerBridge,
  type PlayerSnapshot,
  type PlayerSource,
  type TrackInfo,
} from "../bridge";
import type { SubtitleLoadMetadata } from "@/lib/subtitles/types";
import { nativeTvPlayer as native, type NativeAudioTrack, type NativeTvOptions } from "./shell";
import { loadSubtitleVtt } from "./subtitles";

export { nativeTvAvailable } from "./shell";

/**
 * Plays through the Android TV app's native ExoPlayer (`window.JLNativePlayer`, see
 * android-tv/README.md) instead of the WebView's <video>. The native video is drawn over the
 * WebView: full screen in the full player, or inside the hero box when the player is docked.
 */

type NativeEvent = {
  type:
    | "ready"
    | "playing"
    | "paused"
    | "buffering"
    | "ended"
    | "error"
    | "stopped"
    | "position"
    | "exit-full"
    | "panel"
    | "tracks"
    // Handled by useEnglishDub, which listens for it itself.
    | "english-dub"
    // A bar button the page carries out (next or previous episode): TV_CONTROL_EVENT.
    | "control"
    // The viewer changed the timing in the TV app's menu: the snapshot follows, and the page
    // saves the subtitle timing for this title (TV_CONTROL_EVENT "sub-delay").
    | "sync"
    // A setting changed in the TV app's player menu (skip intros…): TV_SETTING_EVENT.
    | "setting";
  mode?: string;
  positionMs?: number;
  durationMs?: number;
  message?: string;
  audioTracks?: NativeAudioTrack[];
  id?: string;
  subDelaySec?: number;
  audioDelaySec?: number;
  key?: string;
  value?: unknown;
};

export function nativeAudioTrackInfo(tracks: unknown): TrackInfo[] {
  if (!Array.isArray(tracks)) return [];
  const out: TrackInfo[] = [];
  for (const raw of tracks as NativeAudioTrack[]) {
    if (!raw || typeof raw.id !== "string") continue;
    const lang = raw.language && raw.language !== "und" ? raw.language : undefined;
    out.push({
      id: raw.id,
      label: raw.label || (lang ? lang.toUpperCase() : `Audio ${out.length + 1}`),
      lang,
      title: raw.label || undefined,
      kind: "audio",
      selected: raw.selected === true,
      codec: raw.codec || undefined,
      channelCount: typeof raw.channels === "number" && raw.channels > 0 ? raw.channels : undefined,
    });
  }
  return out;
}

/** A setting changed in the TV app's player menu (detail: {key, value}); see player.tsx. */
export const TV_SETTING_EVENT = "harbor:tv-setting";

/** The settings the TV app's player menu may change. */
export const TV_MENU_SETTINGS = new Set([
  "autoSkipIntro",
  "autoSkipRecap",
  "autoSkipOutro",
  "showSkipButton",
]);

/** The TV app's bar asked the page for a control (detail: its id, e.g. "next-episode"). */
export const TV_CONTROL_EVENT = "harbor:tv-control";

/** Height of the web control bar kept under the native video in the hero. */
export const NATIVE_HERO_BAR_PX = 56;

/** The TV app's Change stream button: the player opens its channel list or stream switcher. */
export const TV_PANEL_EVENT = "harbor:tv-panel";
/** Set on <html> while that list is open: the video steps aside until it closes. */
const tvPanelOpen = () => document.documentElement.dataset.tvPanel === "1";

/** `options` goes to the app before every play; app builds without `setOptions` ignore it. */
export function createNativeTvBridge(options?: () => NativeTvOptions): PlayerBridge {
  const listeners = new Set<(s: PlayerSnapshot) => void>();
  let snap: PlayerSnapshot = { ...emptySnapshot };
  let host: HTMLElement | null = null;
  let source: PlayerSource | null = null;
  /** Subtitles offered for this stream (addons, then ones the page added) and what each one is. */
  let subs: (TrackInfo & { meta?: SubtitleLoadMetadata })[] = [];
  const loaded = new Set<string>();
  const publishSubs = () => set({ subtitleTracks: subs.map(({ meta: _meta, ...t }) => t) });
  let destroyed = false;
  let ro: ResizeObserver | null = null;
  let mo: MutationObserver | null = null;
  let panelObserver: MutationObserver | null = null;
  let frame = 0;

  const set = (patch: Partial<PlayerSnapshot>) => {
    snap = { ...snap, ...patch };
    for (const l of listeners) l(snap);
  };

  const docked = () => !!host?.closest("[data-hero-docked]");

  // Full player: the native view fills the screen. Docked: it takes the hero box above the
  // web control bar.
  const place = () => {
    frame = 0;
    const p = native();
    if (!p || !host || destroyed) return;
    if (tvPanelOpen()) {
      // Sound carries on; the picture comes back when the list closes.
      p.setMode("hidden");
      return;
    }
    if (docked()) {
      const r = host.getBoundingClientRect();
      p.setRect(r.left, r.top, r.width, Math.max(0, r.height - NATIVE_HERO_BAR_PX));
      p.setMode("hero");
    } else {
      // On the TV, Back from full screen moves the video into the hub hero, so the native side
      // needs a hero box to drop into; the docked player sends the real one a frame later.
      p.setRect(0, 80, window.innerWidth, Math.round(window.innerHeight * 0.4));
      p.setMode("full");
    }
  };
  const schedulePlace = () => {
    if (!frame) frame = window.requestAnimationFrame(place);
  };

  const onNative = (e: Event) => {
    const d = (e as CustomEvent<NativeEvent>).detail;
    if (!d || destroyed) return;
    const timing: Partial<PlayerSnapshot> = {};
    if (typeof d.positionMs === "number") timing.positionSec = d.positionMs / 1000;
    if (typeof d.durationMs === "number" && !source?.isLive)
      timing.durationSec = d.durationMs / 1000;
    switch (d.type) {
      case "ready":
        set({ ...timing, status: "ready", buffering: false, errorCode: null, errorMessage: null });
        break;
      case "playing":
        set({ ...timing, status: "playing", buffering: false, firstFrameReady: true });
        break;
      case "paused":
        set({ ...timing, status: "paused" });
        break;
      case "buffering":
        set({ ...timing, buffering: true });
        break;
      case "position":
        set({ ...timing, bufferedSec: timing.positionSec ?? snap.bufferedSec });
        break;
      case "ended":
        set({ ...timing, status: "ended", buffering: false });
        break;
      case "error":
        set({
          status: "error",
          buffering: false,
          errorCode: "source",
          errorMessage: d.message ?? "Playback failed",
        });
        break;
      case "panel":
        window.dispatchEvent(new Event(TV_PANEL_EVENT));
        break;
      case "exit-full":
        // The remote's Back left full screen: let the player decide (back to the hero, or close).
        window.dispatchEvent(new CustomEvent("harbor:local-back", { cancelable: true }));
        break;
      case "stopped":
        if (d.message === "background") set({ status: "paused" });
        break;
      case "tracks":
        set({ audioTracks: nativeAudioTrackInfo(d.audioTracks) });
        break;
      case "control":
        if (typeof d.id === "string")
          window.dispatchEvent(new CustomEvent(TV_CONTROL_EVENT, { detail: d.id }));
        break;
      case "setting":
        if (
          typeof d.key === "string" &&
          TV_MENU_SETTINGS.has(d.key) &&
          typeof d.value === "boolean"
        )
          window.dispatchEvent(
            new CustomEvent(TV_SETTING_EVENT, { detail: { key: d.key, value: d.value } }),
          );
        break;
      case "sync": {
        const sub = typeof d.subDelaySec === "number" ? d.subDelaySec : 0;
        const changed = sub !== snap.subDelaySec;
        set({
          subDelaySec: sub,
          audioDelaySec: typeof d.audioDelaySec === "number" ? d.audioDelaySec : 0,
        });
        if (changed)
          window.dispatchEvent(new CustomEvent(TV_CONTROL_EVENT, { detail: "sub-delay" }));
        break;
      }
    }
  };

  // While a video plays, the TV app's crash report learns what the page underneath is doing:
  // how much memory its code holds, and any video or embedded player it is running.
  let pageNote = 0;
  const notePage = () => {
    const p = native();
    if (!p?.notePage) return;
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const videos = Array.from(document.querySelectorAll("video"));
    const playing = videos.filter((v) => !v.paused).length;
    const frames = document.querySelectorAll("iframe").length;
    p.notePage(
      [
        heap ? `heap ${Math.round(heap.usedJSHeapSize / 1048576)} MB` : null,
        `${videos.length} video (${playing} playing)`,
        `${frames} frames`,
        `${document.getElementsByTagName("*").length} elements`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
  };

  const detach = () => {
    window.clearInterval(pageNote);
    pageNote = 0;
    window.removeEventListener("jl-native-player", onNative);
    window.removeEventListener("resize", schedulePlace);
    window.removeEventListener("harbor:mpv-refresh-geom", schedulePlace);
    ro?.disconnect();
    mo?.disconnect();
    panelObserver?.disconnect();
    ro = null;
    mo = null;
    panelObserver = null;
    host = null;
  };

  const bridge: PlayerBridge = {
    attach(el) {
      host = el;
      window.clearInterval(pageNote);
      pageNote = window.setInterval(notePage, 5000);
      window.addEventListener("jl-native-player", onNative);
      window.addEventListener("resize", schedulePlace);
      window.addEventListener("harbor:mpv-refresh-geom", schedulePlace);
      ro = new ResizeObserver(schedulePlace);
      ro.observe(el);
      panelObserver = new MutationObserver(schedulePlace);
      panelObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-tv-panel"],
      });
      const stage = el.closest("[data-harbor-player]");
      if (stage) {
        mo = new MutationObserver(schedulePlace);
        mo.observe(stage, {
          attributes: true,
          attributeFilter: ["data-hero-docked", "style", "class"],
        });
      }
      schedulePlace();
    },
    detach,
    async load(src) {
      source = src;
      const p = native();
      if (!p) {
        set({
          status: "error",
          errorCode: "unknown",
          errorMessage: "The TV player isn't available.",
        });
        return;
      }
      set({ ...emptySnapshot, status: "loading", buffering: true });
      loaded.clear();
      // The stream's addon subtitles, offered like the desktop player's external tracks so the
      // page's menu lists them and its preferred-language choice can pick one.
      subs = (src.subtitles ?? [])
        .filter((sub) => /^https?:/i.test(sub.url))
        .map((sub, i) => ({
          id: sub.id ?? `addon-${i}`,
          label: sub.lang ?? `Subtitles ${i + 1}`,
          lang: sub.lang,
          kind: "subtitle" as const,
          selected: false,
          external: true,
          autoSelectionEligible: true,
          url: sub.url,
        }));
      publishSubs();
      place();
      if (options && typeof p.setOptions === "function") {
        try {
          p.setOptions(JSON.stringify(options()));
        } catch {
          /* An app build that cannot take the options plays with its defaults. */
        }
      }
      const startMs = Math.max(0, Math.round((src.startAtSec ?? 0) * 1000));
      const ok = p.play(src.url, JSON.stringify(src.headers ?? {}), "", startMs);
      if (!ok)
        set({
          status: "error",
          buffering: false,
          errorCode: "source",
          errorMessage: "This stream can't be played.",
        });
    },
    async play() {
      native()?.resume();
    },
    pause() {
      native()?.pause();
    },
    seek(sec) {
      native()?.seek(Math.max(0, Math.round(sec * 1000)));
      set({ positionSec: sec });
    },
    // The page's volume and mute drive the TV app's player (absent from older app builds).
    setVolume(v) {
      set({ volume: v });
      native()?.setVolume?.(snap.muted ? 0 : v);
    },
    setMuted(m) {
      set({ muted: m });
      native()?.setVolume?.(m ? 0 : snap.volume);
    },
    setRate() {},
    // The app chooses audio by language, so of two tracks in one language it plays its own pick.
    setAudioTrack(id) {
      const p = native();
      const track = snap.audioTracks.find((t) => t.id === id);
      if (
        !p ||
        !track?.lang ||
        track.selected ||
        typeof p.setPreferredAudioLanguage !== "function"
      ) {
        return;
      }
      p.setPreferredAudioLanguage(track.lang);
    },
    // Off turns the TV app's subtitles off. A track it doesn't have yet is downloaded and added
    // (addSubtitle); one it has is turned back on.
    setSubtitleTrack(id) {
      const p = native();
      if (id === null) {
        p?.setSubtitlesEnabled?.(false);
        subs = subs.map((t) => ({ ...t, selected: false }));
        publishSubs();
        return;
      }
      const track = subs.find((t) => t.id === id);
      if (!track) {
        p?.setSubtitlesEnabled?.(true);
        return;
      }
      subs = subs.map((t) => ({ ...t, selected: t.id === id }));
      publishSubs();
      if (track.url && !loaded.has(track.url))
        void bridge.addSubtitle(track.url, track.lang, track.label, true, track.meta);
      else p?.setSubtitlesEnabled?.(true);
    },
    setSecondarySubtitleTrack() {},
    setSubVisible(on) {
      native()?.setSubtitlesEnabled?.(on);
    },
    setSubDelay(sec) {
      native()?.setSubtitleDelay?.(sec);
      set({ subDelaySec: sec });
    },
    setAudioDelay(sec) {
      native()?.setAudioDelay?.(sec);
      set({ audioDelaySec: sec });
    },
    setPanscan() {},
    setVideoZoom() {},
    setAspectOverride() {},
    setStretch() {},
    setVideoEq() {},
    setAnime4kShaders() {},
    // The page downloads and reads the subtitle as on the desktop (addons, subtitle sites, their
    // logins, zips and encodings) and hands the TV app the text; older app builds can't take it.
    async addSubtitle(url, lang, title, select, metadata) {
      const p = native();
      if (!p || typeof p.addSubtitleText !== "function") return false;
      const vtt = await loadSubtitleVtt(url, lang, metadata).catch(() => null);
      if (!vtt || destroyed) return false;
      const ok = !!native()?.addSubtitleText?.(
        vtt,
        lang ?? "",
        title ?? lang ?? "",
        select === true,
      );
      if (!ok) return false;
      loaded.add(url);
      if (!subs.some((t) => t.url === url))
        subs.push({
          id: `added-${subs.length}`,
          label: title || lang || "Subtitles",
          lang,
          kind: "subtitle",
          selected: false,
          external: true,
          url,
          meta: metadata,
        });
      if (select) subs = subs.map((t) => ({ ...t, selected: t.url === url }));
      publishSubs();
      return true;
    },
    getSelectedTrackCues: () => null,
    getSelectedTrackUrl: () => null,
    setAudioNormalize() {},
    async screenshot() {
      return { ok: false, error: "Not available on the TV app" };
    },
    setAbLoop() {},
    async requestPiP() {},
    async exitPiP() {},
    async requestFullscreen() {},
    async exitFullscreen() {},
    capabilities: () => ({
      engine: "html5",
      pictureInPicture: false,
      airplay: false,
      chromecast: false,
      hdrPassthrough: true,
      hardwareDecode: true,
    }),
    subscribe(listener) {
      listeners.add(listener);
      listener(snap);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame) window.cancelAnimationFrame(frame);
      native()?.stop();
      detach();
      listeners.clear();
    },
  };
  return bridge;
}
