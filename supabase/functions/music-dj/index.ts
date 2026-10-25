// Music Hub AI DJ: turns a vibe ("smooth jazz on a Hawaii beach"), the listener's styles and
// what they've been playing into a set of real songs, a few new artists to try, the scene for
// the background video, colours and background sounds. Uses OpenAI; the app then finds each
// song with music-search (web) or its own search (desktop). Callers must be signed in to JL.

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SOUNDS = [
  "delta",
  "theta",
  "alpha",
  "beta",
  "gamma",
  "white",
  "pink",
  "brown",
  "green",
  "blue",
  "violet",
  "rain",
  "ocean",
  "wind",
  "river",
  "fire",
  "thunder",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown, max: number, len: number) =>
  Array.isArray(v)
    ? v
        .map((x) => text(x, len))
        .filter(Boolean)
        .slice(0, max)
    : [];

const SYSTEM = `You are the JL Media Vision AI DJ. You build listening sessions from real, released songs that are on YouTube.
Rules:
- Only suggest songs that really exist, by the artist who recorded them. Never invent titles.
- Keep the vibe; flow from one song to the next (energy, tempo, key, era) like a DJ set.
- Mix in artists the listener knows with similar ones they may not, across one genre or blending genres when the vibe calls for it.
- No repeats, and skip anything in "avoid".
- "discover" is 3 artists new to this listener that fit, each with one song to start on.
- "scene" describes a background video for the vibe (a place or mood, e.g. "Hawaii beach sunset waves 4k"), with no people or brands.
- "colors" are two hex colours for the vibe.
- "sounds" are 0-2 background sounds from this list that suit the vibe, or none for a party: ${SOUNDS.join(", ")}.
- "intro" is one or two short, warm DJ lines (under 200 characters).
Reply with JSON only: {"intro":"","tracks":[{"artist":"","title":"","why":""}],"discover":[{"artist":"","title":"","why":""}],"scene":"","colors":["#000000","#000000"],"sounds":[]}`;

/** The platform has verified the token's signature; only signed-in JL accounts may use quota. */
function signedIn(req: Request): boolean {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
    return claims.role === "authenticated" && typeof claims.sub === "string";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!signedIn(req)) return json({ error: "Sign in to your JL Media Vision account." }, 401);
  if (!OPENAI_API_KEY) return json({ error: "The AI DJ isn't set up yet." }, 503);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const vibe = text(body.vibe, 200);
  const request = text(body.request, 200);
  const styles = list(body.styles, 20, 60);
  const seeds = list(body.seeds, 30, 60);
  const recent = list(body.recent, 30, 120);
  const avoid = list(body.avoid, 60, 120);
  const count = Math.min(20, Math.max(5, Number(body.count) || 12));
  if (!vibe && !request && !styles.length && !seeds.length)
    return json({ error: "Tell the DJ a vibe or pick some styles first." }, 400);

  const user = [
    vibe && `Vibe: ${vibe}`,
    request && `Request: ${request}`,
    styles.length && `Styles they listen to: ${styles.join("; ")}`,
    seeds.length && `Artists they like: ${seeds.join("; ")}`,
    recent.length && `Recently played: ${recent.join("; ")}`,
    avoid.length && `Avoid (already played): ${avoid.join("; ")}`,
    `Number of tracks: ${count}`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const status = res.status === 429 ? 429 : 502;
    return json(
      {
        error:
          status === 429 ? "The DJ is busy. Try again in a minute." : "The DJ couldn't answer.",
      },
      status,
    );
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return json({ error: "The DJ's answer couldn't be read." }, 502);
  }
  const song = (v: unknown) => {
    const o = (v ?? {}) as Record<string, unknown>;
    const artist = text(o.artist, 80);
    const title = text(o.title, 120);
    return artist && title ? { artist, title, why: text(o.why, 160) } : null;
  };
  const seen = new Set(avoid.map((a) => a.toLowerCase()));
  const tracks = (Array.isArray(raw.tracks) ? raw.tracks : [])
    .map(song)
    .filter((t): t is NonNullable<ReturnType<typeof song>> => {
      if (!t) return false;
      const k = `${t.artist} - ${t.title}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, count);
  const discover = (Array.isArray(raw.discover) ? raw.discover : [])
    .map(song)
    .filter(Boolean)
    .slice(0, 5);
  const colors = list(raw.colors, 2, 7).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  const sounds = list(raw.sounds, 2, 12).filter((s) => SOUNDS.includes(s));
  return json({
    intro: text(raw.intro, 240),
    tracks,
    discover,
    scene: text(raw.scene, 120),
    colors: colors.length === 2 ? colors : null,
    sounds,
  });
});
