import { readVisionSession } from "./vision-session";
import { useEffect, useState } from "react";
const ROOT = "https://ajbjyjfiglzodbdcdapr.supabase.co";
type Publication = { team_slug: string; slot: string; storage_path: string; approved_at: string };
function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
async function signedImage(path: string, jwt: string): Promise<string | null> {
  if (!path || path.startsWith("/") || path.split("/").includes("..")) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(ROOT + "/storage/v1/object/sign/media-art/" + encoded, {
    method: "POST",
    headers: { Authorization: "Bearer " + jwt, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 900 }),
  });
  if (!response.ok) return null;
  const result = await response.json() as { signedURL?: string; signedUrl?: string };
  const uri = result.signedURL || result.signedUrl;
  return uri ? new URL(uri, ROOT).href : null;
}
/** Only licensed, approved artwork from the server's publication feed. */
export function useApprovedSportsArtwork(): Record<string, string> {
  const [art, setArt] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const current = await readVisionSession();
      if (!current) return;
      const jwt = current.accessToken;
      const key = current.publishableKey;
      const response = await fetch(ROOT + "/functions/v1/jl-sports-fanart-source?resource=published", {
        headers: { Authorization: "Bearer " + jwt, apikey: key },
      });
      if (!response.ok) return;
      const payload = await response.json() as { items?: Publication[] };
      const selected = (payload.items || []).filter(x => x.slot === "card" || x.slot === "hero" || x.slot === "wallpaper");
      const entries = await Promise.all(selected.map(async x => [slug(x.team_slug) + ":" + x.slot, await signedImage(x.storage_path, jwt)] as const));
      const output: Record<string, string> = {};
      for (const [k, value] of entries) if (value && !output[k]) output[k] = value;
      if (!cancelled) setArt(output);
    };
    void run().catch(() => {});
    const timer = window.setInterval(() => void run().catch(() => {}), 600000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  return art;
}
export function cardArtworkFor(art: Record<string,string>, ...teams: string[]): string | undefined {
  for (const name of teams) {
    const key = slug(name);
    for (const slot of ["card", "hero", "wallpaper"]) if (art[key + ":" + slot]) return art[key + ":" + slot];
  }
  return undefined;
}
