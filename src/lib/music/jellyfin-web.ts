import { useSyncExternalStore } from "react";

/**
 * Your Jellyfin server's music in the browser (web and TV; the desktop app has its own
 * connector). Sign in once with your Jellyfin user; the server address and token stay on this
 * device. The page is served over HTTPS, so the server must be reachable over HTTPS too (a
 * reverse proxy or Jellyfin's own certificate); Jellyfin allows cross-site requests by default.
 */

export type JellyfinSong = {
  id: string;
  title: string;
  artist: string;
  album: string;
  art: string | null;
  durationSec?: number;
};

type Session = { server: string; userId: string; token: string; name: string };
type State = { session: Session | null; error: string | null };

const KEY = "jl.jellyfin.web.v1";
const DEVICE_KEY = "jl.jellyfin.web.device.v1";

function read(): Session | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    return v && v.server && v.token && v.userId ? v : null;
  } catch {
    return null;
  }
}

let state: State = { session: read(), error: null };
const listeners = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export function useJellyfin(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
    () => state,
  );
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "jl-web";
  }
}

function authHeader(token?: string): string {
  const parts = [
    'Client="JL Media Vision"',
    'Device="Web"',
    `DeviceId="${deviceId()}"`,
    'Version="1.0"',
    ...(token ? [`Token="${token}"`] : []),
  ];
  return `MediaBrowser ${parts.join(", ")}`;
}

/** "jellyfin.example.com" or "https://…/jellyfin/" into a clean base URL. */
export function normalizeServer(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export async function connectJellyfin(server: string, user: string, password: string) {
  const base = normalizeServer(server);
  if (location.protocol === "https:" && base.startsWith("http:"))
    throw new Error(
      "This page is secure (HTTPS), so it can only reach your Jellyfin server over HTTPS.",
    );
  let res: Response;
  try {
    res = await fetch(`${base}/Users/AuthenticateByName`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader() },
      body: JSON.stringify({ Username: user, Pw: password }),
    });
  } catch {
    throw new Error(
      "Couldn't reach that server. Check the address, and that it's reachable over HTTPS.",
    );
  }
  if (res.status === 401) throw new Error("Jellyfin didn't accept that username or password.");
  if (!res.ok) throw new Error(`Jellyfin sign in failed (${res.status}).`);
  const out = (await res.json()) as { AccessToken?: string; User?: { Id?: string; Name?: string } };
  if (!out.AccessToken || !out.User?.Id) throw new Error("Jellyfin sign in failed.");
  const session = {
    server: base,
    userId: out.User.Id,
    token: out.AccessToken,
    name: out.User.Name ?? user,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* storage blocked: lasts this session */
  }
  set({ session, error: null });
}

export function disconnectJellyfin() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  set({ session: null });
}

type Item = {
  Id: string;
  Name?: string;
  Album?: string;
  AlbumArtist?: string;
  Artists?: string[];
  AlbumId?: string;
  ImageTags?: Record<string, string>;
  AlbumPrimaryImageTag?: string;
  RunTimeTicks?: number;
};

async function items(params: Record<string, string>): Promise<JellyfinSong[]> {
  const s = state.session;
  if (!s) throw new Error("Connect your Jellyfin server first.");
  const q = new URLSearchParams({
    userId: s.userId,
    IncludeItemTypes: "Audio",
    Recursive: "true",
    Fields: "Artists,AlbumArtist,Album",
    Limit: "100",
    ...params,
  });
  const res = await fetch(`${s.server}/Items?${q}`, {
    headers: { Authorization: authHeader(s.token) },
  });
  if (res.status === 401) {
    disconnectJellyfin();
    throw new Error("Jellyfin signed you out. Connect again.");
  }
  if (!res.ok) throw new Error(`Jellyfin couldn't list your music (${res.status}).`);
  const out = (await res.json()) as { Items?: Item[] };
  return (out.Items ?? []).map((i) => {
    const tag = i.ImageTags?.Primary;
    const art = tag
      ? `${s.server}/Items/${i.Id}/Images/Primary?tag=${tag}&maxWidth=300`
      : i.AlbumId && i.AlbumPrimaryImageTag
        ? `${s.server}/Items/${i.AlbumId}/Images/Primary?tag=${i.AlbumPrimaryImageTag}&maxWidth=300`
        : null;
    return {
      id: i.Id,
      title: i.Name ?? "Untitled",
      artist: i.Artists?.join(", ") || i.AlbumArtist || "",
      album: i.Album ?? "",
      art,
      durationSec: i.RunTimeTicks ? Math.round(i.RunTimeTicks / 10_000_000) : undefined,
    };
  });
}

/** Recently added songs. */
export const jellyfinRecent = () => items({ SortBy: "DateCreated", SortOrder: "Descending" });

export const jellyfinSearch = (q: string) => items({ SearchTerm: q, SortBy: "SortName" });

/** A stream the browser can play and decode (MP3 when the original can't be). */
export function jellyfinStreamUrl(id: string): string {
  const s = state.session;
  if (!s) throw new Error("Connect your Jellyfin server first.");
  const q = new URLSearchParams({
    UserId: s.userId,
    DeviceId: deviceId(),
    api_key: s.token,
    Container: "mp3,aac,m4a|aac,flac,wav,ogg",
    TranscodingContainer: "mp3",
    TranscodingProtocol: "http",
    AudioCodec: "mp3",
    MaxStreamingBitrate: "320000",
  });
  return `${s.server}/Audio/${encodeURIComponent(id)}/universal?${q}`;
}
