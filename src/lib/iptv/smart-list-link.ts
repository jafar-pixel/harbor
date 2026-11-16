import { useSyncExternalStore } from "react";

/**
 * The viewer's JL Smart List link (server/smart-list.ts), saved once and kept on every device
 * signed in to their JL account, so a TV adds it with one button instead of typing a long link.
 * It syncs as an "own:" account secret: family members never receive it.
 */

const KEY = "jl.iptv.smartList.v1";
const SMART = /^(https:\/\/[^/\s]+\/smart\/[a-f0-9]{32,})(?:\/[a-z.]*)?\/?$/i;

const subs = new Set<() => void>();
let cache = read();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

/** The playlist and guide addresses of a Smart List link (any of its three links), or null. */
export function smartListUrls(link: string): { playlist: string; epg: string } | null {
  const m = SMART.exec(link.trim());
  if (!m) return null;
  return { playlist: `${m[1]}/playlist.m3u`, epg: `${m[1]}/epg.xml` };
}

export function readSmartListLink(): string {
  cache = read();
  return cache;
}

/** Saves the link ("" removes it). Only a real Smart List link is kept. */
export function writeSmartListLink(link: string): boolean {
  const urls = link.trim() ? smartListUrls(link) : null;
  if (link.trim() && !urls) return false;
  const value = urls?.playlist ?? "";
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    return false;
  }
  cache = value;
  for (const fn of subs) fn();
  return true;
}

function subscribe(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function useSmartListLink(): string {
  return useSyncExternalStore(
    subscribe,
    () => cache,
    () => cache,
  );
}
