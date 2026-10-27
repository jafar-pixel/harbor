import { useEffect, useSyncExternalStore } from "react";
import { currentJlSession, jlStorage, jlStorageUrl } from "@/lib/jl/account/client";
import { encodeObjectPath } from "@/lib/jl/sports/custom-art";
import type { View } from "@/lib/view";
import { ENVIRONMENTS, environmentImage } from "@/lib/environments";

/**
 * A backdrop per page (Settings › Appearance › Interface): each page can show its own
 * Environment or art the listener uploaded. Choices live in settings (`pageBackdrops`, synced
 * with the profile); uploaded art lives in the account's private `media-art` folder under
 * `<owner>/backdrops/`, shown through signed links.
 */

export const BACKDROP_PAGES: { id: View; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "movies", label: "Movies" },
  { id: "shows", label: "Shows" },
  { id: "live", label: "Live TV" },
  { id: "sports", label: "Sports" },
  { id: "music", label: "Music" },
  { id: "anime", label: "Anime" },
  { id: "discover", label: "Discover" },
  { id: "catalogs", label: "Catalogs" },
  { id: "library", label: "My library" },
  { id: "settings", label: "Settings" },
];

/** A stored choice: "env:<environment id>" or "art:<storage path>". */
export type BackdropChoice = string;

const ART_BUCKET = "media-art";
const ART_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_SIDE = 3840;
const SIGN_SECONDS = 24 * 3600;

export const envChoice = (id: string): BackdropChoice => `env:${id}`;
export const artChoice = (path: string): BackdropChoice => `art:${path}`;

// ---- Signed links for uploaded art --------------------------------------------------------------

const signed = new Map<string, { url: string; until: number }>();
const listeners = new Set<() => void>();
const pending = new Set<string>();
const emit = () => listeners.forEach((fn) => fn());

async function sign(paths: string[]): Promise<void> {
  const wanted = paths.filter((p) => !pending.has(p));
  if (!wanted.length || !currentJlSession()) return;
  wanted.forEach((p) => pending.add(p));
  try {
    const res = await jlStorage(`object/sign/${ART_BUCKET}`, {
      method: "POST",
      body: JSON.stringify({ expiresIn: SIGN_SECONDS, paths: wanted }),
    });
    if (!res.ok) return;
    const list = (await res.json().catch(() => [])) as {
      path?: string;
      signedURL?: string | null;
    }[];
    for (const item of Array.isArray(list) ? list : [])
      if (item.path && item.signedURL)
        signed.set(item.path, {
          url: encodeURI(jlStorageUrl(item.signedURL)),
          until: Date.now() + (SIGN_SECONDS - 3600) * 1000,
        });
    emit();
  } catch {
    /* offline: the page keeps its default backdrop */
  } finally {
    wanted.forEach((p) => pending.delete(p));
  }
}

function artUrl(path: string): string | null {
  const hit = signed.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  void sign([path]);
  return hit?.url ?? null;
}

function useSignedTick(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => signed.size,
    () => 0,
  );
}

/** The image a choice shows, or null to use the theme's own backdrop. */
export function backdropImage(choice: BackdropChoice | undefined | null): string | null {
  if (!choice) return null;
  if (choice.startsWith("env:")) {
    const env = ENVIRONMENTS.find((e) => e.id === choice.slice(4));
    return env ? environmentImage(env) : null;
  }
  if (choice.startsWith("art:")) return artUrl(choice.slice(4));
  return null;
}

/** The page's chosen image, updating once uploaded art's link is ready. */
export function usePageBackdrop(choice: BackdropChoice | undefined | null): string | null {
  useSignedTick();
  return backdropImage(choice);
}

/** Links for a list of uploads (the settings gallery). */
export function useArtUrls(paths: string[]): Map<string, string> {
  useSignedTick();
  const key = paths.join("|");
  useEffect(() => {
    const stale = paths.filter((p) => {
      const hit = signed.get(p);
      return !hit || hit.until <= Date.now();
    });
    if (stale.length) void sign(stale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const out = new Map<string, string>();
  for (const p of paths) {
    const hit = signed.get(p);
    if (hit) out.set(p, hit.url);
  }
  return out;
}

// ---- Uploads -----------------------------------------------------------------------------------

function owner(): string {
  const id = currentJlSession()?.userId;
  if (!id) throw new Error("Sign in to your JL Media Vision account to upload backdrop art.");
  return id;
}

/** Big photos are scaled to 4K so pages load quickly. */
async function prepare(file: File): Promise<Blob> {
  if (!ART_TYPES.has(file.type)) throw new Error("Use a PNG, JPEG or WebP image.");
  if (file.size > MAX_BYTES) throw new Error("That image is larger than 15 MB.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Couldn't read that image. Try a different file.");
  const ratio = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (ratio === 1 && file.size < 6 * 1024 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  if (!blob) throw new Error("Couldn't prepare that image. Try a different file.");
  return blob;
}

/** Upload art to the account and return its storage path. */
export async function uploadBackdropArt(file: File): Promise<string> {
  const blob = await prepare(file);
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${owner()}/backdrops/${Date.now().toString(36)}.${ext}`;
  const res = await jlStorage(`object/${ART_BUCKET}/${encodeObjectPath(path)}`, {
    method: "POST",
    headers: { "Content-Type": blob.type, "x-upsert": "true", "Cache-Control": "3600" },
    body: blob,
  });
  if (!res.ok) throw new Error("The picture couldn't be uploaded. Try again.");
  return path;
}

/** The account's uploaded backdrop art, newest first. */
export async function listBackdropArt(): Promise<string[]> {
  const prefix = `${owner()}/backdrops/`;
  const res = await jlStorage(`object/list/${ART_BUCKET}`, {
    method: "POST",
    body: JSON.stringify({
      prefix,
      limit: 100,
      offset: 0,
      sortBy: { column: "created_at", order: "desc" },
    }),
  });
  if (!res.ok) throw new Error("Your backdrop art couldn't be listed.");
  const list = (await res.json().catch(() => [])) as { name?: string; id?: string | null }[];
  return (Array.isArray(list) ? list : [])
    .filter((o) => o.name && o.id)
    .map((o) => `${prefix}${o.name}`);
}

export async function deleteBackdropArt(path: string): Promise<void> {
  const res = await jlStorage(`object/${ART_BUCKET}`, {
    method: "DELETE",
    body: JSON.stringify({ prefixes: [path] }),
  });
  if (!res.ok) throw new Error("That picture couldn't be removed.");
  signed.delete(path);
  emit();
}
