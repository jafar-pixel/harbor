import { jlAccountContext, jlFunction } from "@/lib/jl/account/client";
import type { DjSong, VideoResult } from "./vibes";

/**
 * The AI DJ's server side on the JL Vision project: music-dj (OpenAI picks the set) and
 * music-search (YouTube videos, cached for every user). Both need a signed-in JL account.
 */

export type DjSet = {
  intro: string;
  tracks: DjSong[];
  discover: DjSong[];
  scene: string;
  colors: [string, string] | null;
  sounds: string[];
};

export type DjAsk = {
  vibe?: string;
  request?: string;
  styles?: string[];
  seeds?: string[];
  recent?: string[];
  avoid?: string[];
  count?: number;
};

export async function call<T>(name: string, body: unknown): Promise<T> {
  if (!jlAccountContext())
    throw new Error("Sign in to your JL Media Vision account to use the AI DJ.");
  const res = await jlFunction(name, { method: "POST", body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error || `The DJ couldn't answer (${res.status}).`);
  return data;
}

export function askDj(ask: DjAsk): Promise<DjSet> {
  return call<DjSet>("music-dj", ask);
}

const searches = new Map<string, Promise<VideoResult[]>>();

/** YouTube videos for a query; one request per query per session. */
export function searchVideos(q: string, kind: "music" | "any" = "music"): Promise<VideoResult[]> {
  const key = `${kind}:${q.toLowerCase().trim()}`;
  const hit = searches.get(key);
  if (hit) return hit;
  const run = call<{ results: VideoResult[] }>("music-search", { q, kind, max: 6 })
    .then((r) => r.results ?? [])
    .catch((error: unknown) => {
      searches.delete(key);
      throw error;
    });
  searches.set(key, run);
  return run;
}

const aspectCache = new Map<string, number>();
const aspectAsked = new Set<string>();

/**
 * Each video's real shape (width / height), so the decks can zoom past YouTube's black bars.
 * Unknown videos are looked up once per session; failures leave the video unzoomed.
 */
export async function videoAspects(ids: string[]): Promise<Map<string, number>> {
  const wanted = [...new Set(ids)].filter((id) => !aspectCache.has(id) && !aspectAsked.has(id));
  if (wanted.length) {
    for (const id of wanted) aspectAsked.add(id);
    try {
      const { aspects } = await call<{ aspects: Record<string, number> }>("music-search", {
        aspects: wanted.slice(0, 50),
      });
      for (const [id, ratio] of Object.entries(aspects ?? {}))
        if (Number.isFinite(ratio) && ratio > 0) aspectCache.set(id, ratio);
    } catch {
      for (const id of wanted) aspectAsked.delete(id);
    }
  }
  return aspectCache;
}
