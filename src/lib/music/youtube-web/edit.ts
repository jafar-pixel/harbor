import { youtubeWebToken } from "./auth";
import type { YouTubePlaylist } from "./api";

/**
 * Changes to the listener's own YouTube (and YouTube Music) playlists: create, rename, delete,
 * add, remove and reorder videos. Needs the YouTube edit permission (connectYouTubeWeb(true)).
 */

type Json = Record<string, unknown>;
const API = "https://www.googleapis.com/youtube/v3";

async function send(method: string, path: string, body?: unknown): Promise<Json> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await youtubeWebToken()}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401)
    throw new Error("Your YouTube sign in ran out. Reconnect to keep editing.");
  if (res.status === 403)
    throw new Error(
      "YouTube didn't allow that change. Reconnect with editing turned on, or try again tomorrow if the daily limit was reached.",
    );
  if (!res.ok) throw new Error(`YouTube couldn't save that change (${res.status}).`);
  const text = await res.text();
  return text ? (JSON.parse(text) as Json) : {};
}

export async function createYouTubePlaylist(name: string): Promise<YouTubePlaylist> {
  const p = await send("POST", "/playlists?part=snippet,status", {
    snippet: { title: name, description: "Made in JL Media Vision" },
    status: { privacyStatus: "private" },
  });
  return { id: String(p.id ?? ""), name, count: 0, image: null };
}

export const renameYouTubePlaylist = (id: string, name: string) =>
  send("PUT", "/playlists?part=snippet", { id, snippet: { title: name } });

export const deleteYouTubePlaylist = (id: string) =>
  send("DELETE", `/playlists?id=${encodeURIComponent(id)}`);

export const addYouTubeVideo = (playlistId: string, videoId: string) =>
  send("POST", "/playlistItems?part=snippet", {
    snippet: { playlistId, resourceId: { kind: "youtube#video", videoId } },
  });

export const removeYouTubeItem = (itemId: string) =>
  send("DELETE", `/playlistItems?id=${encodeURIComponent(itemId)}`);

export const moveYouTubeItem = (
  playlistId: string,
  itemId: string,
  videoId: string,
  position: number,
) =>
  send("PUT", "/playlistItems?part=snippet", {
    id: itemId,
    snippet: { playlistId, resourceId: { kind: "youtube#video", videoId }, position },
  });
