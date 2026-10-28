import { currentTrack, playerState } from "./player/store";
import { useEffect, useSyncExternalStore } from "react";
import { jlAccountContext, jlRest, subscribeJlSession } from "@/lib/jl/account/client";
import { osClass } from "@/lib/platform";
import { readPlayhead } from "./dj/playhead";
import { getMusicState } from "./player";

/**
 * What every one of the listener's devices is playing (media.now_playing, 0008). This device
 * writes its row while music plays (the AI DJ or the music player), and reads the others so the
 * Music Hub can say "Listening on Desktop: Award Tour · Play here".
 */

export type DeviceKind = "desktop" | "web" | "android";
export type DevicePlaying = {
  device_id: string;
  device_name: string;
  device_kind: DeviceKind;
  title: string;
  artist: string;
  art: string | null;
  video_id: string | null;
  source: string;
  position_s: number;
  duration_s: number | null;
  paused: boolean;
  updated_at: string;
};

const DEVICE_KEY = "jl.device.id.v1";
const WRITE_MS = 5000;
const REFRESH_MS = 20_000;
/** Rows older than this are a device that stopped or closed. */
const STALE_MS = 3 * 60_000;

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "session" + Math.random().toString(36).slice(2, 12);
  }
}

export function deviceKind(): DeviceKind {
  const os = osClass();
  return os === "web" ? "web" : os === "android" ? "android" : "desktop";
}

function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
  if (/Firefox\//.test(ua)) return "Firefox";
  return "Browser";
}

function systemName(): string {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad/.test(ua)) return "iPhone";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux";
  return "";
}

export function deviceName(): string {
  const kind = deviceKind();
  if (kind === "android") return "TV app";
  if (kind === "desktop") return `Desktop app${systemName() ? ` · ${systemName()}` : ""}`;
  return `Web · ${browserName()}${systemName() ? ` on ${systemName()}` : ""}`;
}

type Snapshot = Omit<
  DevicePlaying,
  "device_id" | "device_name" | "device_kind" | "updated_at"
> | null;

/** What this device plays right now: the AI DJ when it's on, else the shared web player, else
 * the desktop music player. */
function snapshot(): Snapshot {
  const head = readPlayhead();
  if (head)
    return {
      title: head.title.slice(0, 160),
      artist: head.artist.slice(0, 120),
      art: `https://i.ytimg.com/vi/${head.videoId}/hqdefault.jpg`,
      video_id: head.videoId,
      source: "dj",
      position_s: Math.max(0, head.position),
      duration_s: null,
      paused: head.paused,
    };
  // The shared web player (Music Hub, Automix, Lounge requests).
  const shared = currentTrack();
  const player = playerState();
  if (shared && player.index >= 0 && (player.playing || player.position > 0)) {
    const sharedArt =
      shared.art && /^https?:/.test(shared.art)
        ? shared.art
        : shared.videoId
          ? `https://i.ytimg.com/vi/${shared.videoId}/hqdefault.jpg`
          : null;
    return {
      title: shared.title.slice(0, 160) || "Untitled",
      artist: shared.artist.slice(0, 120),
      art: sharedArt && sharedArt.length <= 600 ? sharedArt : null,
      video_id:
        shared.videoId && /^[A-Za-z0-9_-]{11}$/.test(shared.videoId) ? shared.videoId : null,
      source: "music",
      position_s: Math.max(0, player.position),
      duration_s: player.duration || null,
      paused: !player.playing,
    };
  }
  const music = getMusicState();
  const track = music.current;
  if (!track || (music.phase !== "playing" && music.phase !== "paused")) return null;
  const art = track.artwork && /^https?:/.test(track.artwork) ? track.artwork : null;
  return {
    title: track.title.slice(0, 160) || "Untitled",
    artist: (track.artist ?? "").slice(0, 120),
    art: art && art.length <= 600 ? art : null,
    video_id: null,
    source: "music",
    position_s: Math.max(0, music.currentTime || 0),
    duration_s: music.duration || null,
    paused: music.phase === "paused",
  };
}

let lastWritten = "";
let lastWriteAt = 0;
let wroteRow = false;

async function write(): Promise<void> {
  if (!jlAccountContext() || document.visibilityState === "hidden") return;
  const now = snapshot();
  const sig = now ? `${now.title}|${now.artist}|${now.paused}` : "";
  // Write on any change, and every 30s while playing so the position stays close.
  if (sig === lastWritten && (!now || now.paused || Date.now() - lastWriteAt < 30_000)) return;
  lastWritten = sig;
  lastWriteAt = Date.now();
  const id = encodeURIComponent(deviceId());
  try {
    if (!now) {
      if (wroteRow) await jlRest(`now_playing?device_id=eq.${id}`, { method: "DELETE" });
      wroteRow = false;
      return;
    }
    await jlRest("now_playing?on_conflict=user_id,device_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        device_id: deviceId(),
        device_name: deviceName(),
        device_kind: deviceKind(),
        ...now,
        updated_at: new Date().toISOString(),
      }),
    });
    wroteRow = true;
  } catch {
    lastWritten = "";
  }
}

let others: DevicePlaying[] = [];
const listeners = new Set<() => void>();
function setOthers(next: DevicePlaying[]) {
  others = next;
  for (const fn of listeners) fn();
}

export async function refreshOtherDevices(): Promise<void> {
  if (!jlAccountContext()) return setOthers([]);
  try {
    const since = new Date(Date.now() - STALE_MS).toISOString();
    const res = await jlRest(
      `now_playing?select=*&device_id=neq.${encodeURIComponent(deviceId())}&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.desc`,
    );
    if (res.ok) setOthers((await res.json()) as DevicePlaying[]);
  } catch {
    /* offline: keep what we had */
  }
}

let users = 0;
let writer = 0;
let reader = 0;

/** Mounted once for the app: keeps this device's row current. */
export function useNowPlayingReporter(): void {
  useEffect(() => {
    writer = window.setInterval(() => void write(), WRITE_MS);
    const unsubscribe = subscribeJlSession(() => {
      lastWritten = "";
      wroteRow = false;
    });
    return () => {
      window.clearInterval(writer);
      unsubscribe();
    };
  }, []);
}

/** The listener's other devices that are playing (or paused) right now. */
export function useOtherDevices(): DevicePlaying[] {
  useEffect(() => {
    users += 1;
    if (users === 1) {
      void refreshOtherDevices();
      reader = window.setInterval(() => {
        if (document.visibilityState === "visible") void refreshOtherDevices();
      }, REFRESH_MS);
    }
    return () => {
      users -= 1;
      if (users === 0) window.clearInterval(reader);
    };
  }, []);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => others,
    () => others,
  );
}
