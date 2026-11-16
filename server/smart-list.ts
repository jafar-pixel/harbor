/**
 * Smart List: the server reads a viewer's huge IPTV playlist and guide, keeps only the channels
 * they want (by country, sport and name rules) and serves the trimmed copy at a private link.
 * Devices load the small list instead of the whole provider list, so the Shield never holds tens
 * of thousands of channels and a full guide in memory.
 *
 * Stream addresses are copied unchanged: playback still goes straight to the provider (or through
 * the relay on the web), so picture quality, 4K and HDR are exactly as before.
 *
 * Lists are set up in a JSON file on the server (JL_SMART_LISTS), never committed:
 *
 *   { "lists": [ {
 *       "id": "owner",
 *       "token": "48 random hex characters (openssl rand -hex 24)",
 *       "source": { "m3u": "https://provider/get.php?...", "epg": "https://provider/xmltv.php?..." }
 *                 or { "xtream": { "server": "https://provider:8080", "username": "...", "password": "..." } },
 *       "refreshHours": 6,
 *       "guideHours": 36,
 *       "rules": { "keep": [...], "drop": [...], "liveOnly": true }   (optional, see DEFAULT_RULES)
 *   } ] }
 *
 * Each list is its own: one viewer's rules, provider and files never touch another's.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { timingSafeEqual } from "node:crypto";
import { iterateM3uChannels } from "../src/lib/iptv/m3u.ts";
import { detectCountry, detectCountryFromGroup } from "../src/lib/iptv/country-detect.ts";
import type { IptvChannel } from "../src/lib/iptv/types.ts";

// ---------------------------------------------------------------------------------------------
// Rules

export type KeepRule = {
  /** Shown in the list's status ("US channels"). */
  label: string;
  /** Country codes as the app detects them ("US", "GB"); "none" = no country in the name/group. */
  countries?: string[];
  /** Only sports channels (group or name says so). */
  sports?: boolean;
  /** Case-insensitive pattern tested on the group and the name. */
  match?: string;
};

export type SmartRules = {
  keep: KeepRule[];
  /** Case-insensitive patterns; a channel whose group or name matches one is always dropped. */
  drop?: string[];
  /** Drop provider movies and series (they come back as their own section later). */
  liveOnly?: boolean;
};

/** The owner's list: US channels (US sports included), UK sports, sports events and anime. */
export const DEFAULT_RULES: SmartRules = {
  keep: [
    { label: "US channels", countries: ["US"] },
    { label: "UK sports", countries: ["GB"], sports: true },
    { label: "Sports events", countries: ["none"], sports: true },
    { label: "Anime", match: "\\b(anime|crunchyroll|funimation|toonami|animax|aniplus)\\b" },
  ],
  drop: ["\\b(xxx|adults?|18\\+|porn)\\b"],
  liveOnly: true,
};

const SPORTS =
  /\b(SPORTS?|PPV|PAY ?PER ?VIEW|EVENTS?|NFL|NBA|WNBA|MLB|NHL|MLS|NCAA[FB]?|ESPN\w*|FS[12]|SKY SPORTS?|TNT SPORTS?|BT SPORTS?|DAZN|EUROSPORT\w*|PREMIER LEAGUE|EPL|EFL|UFC|WWE|AEW|BOXING|GOLF|TENNIS|F1|FORMULA ?1|NASCAR|INDYCAR|MOTOGP|RACING|CRICKET|RUGBY|BEIN\w*|SUPERSPORT|SEC NETWORK|ACC NETWORK|ACCN|BIG ?TEN|B1G|PAC-?12|NBC SPORTS|CBS SPORTS|FLO ?SPORTS|SUNDAY TICKET|LEAGUE PASS|CENTER ICE|GAME ?PASS|MATCH ?DAY|GAME ?DAY|REDZONE|RED ZONE|SPORTSNET|TSN|GOLAZO|FANATIZ|VICTORY)\b/i;
const VOD_PATH = /\/(movie|series)\//i;
const VOD_EXT = /\.(mkv|mp4|avi|m4v|mov|flv|wmv|mpg|mpeg|webm)(\?|$)/i;

export function isSports(ch: Pick<IptvChannel, "name" | "group">): boolean {
  return SPORTS.test(ch.group ?? "") || SPORTS.test(ch.name);
}

export function isVod(ch: Pick<IptvChannel, "url" | "attrs">): boolean {
  const declared = (ch.attrs["tvg-type"] || ch.attrs["type"] || "").toLowerCase();
  if (declared === "movie" || declared === "series") return true;
  const path = ch.url.split(/[?#]/)[0];
  return VOD_PATH.test(path) || VOD_EXT.test(path);
}

/** The country the channel is for, as the app's Live TV shows it ("US", "GB"), or null. */
export function countryOf(ch: IptvChannel): string | null {
  return detectCountry(ch)?.code ?? detectCountryFromGroup(ch.name)?.code ?? null;
}

type CompiledRules = {
  keep: { label: string; countries: Set<string> | null; sports: boolean; match: RegExp | null }[];
  drop: RegExp[];
  liveOnly: boolean;
};

export function compileRules(rules: SmartRules): CompiledRules {
  return {
    keep: rules.keep.map((r) => ({
      label: r.label,
      countries: r.countries?.length ? new Set(r.countries.map((c) => c.toUpperCase())) : null,
      sports: !!r.sports,
      match: r.match ? new RegExp(r.match, "i") : null,
    })),
    drop: (rules.drop ?? []).map((p) => new RegExp(p, "i")),
    liveOnly: rules.liveOnly !== false,
  };
}

/** Which keep rule takes this channel (its label), or null to drop it. */
export function ruleFor(ch: IptvChannel, rules: CompiledRules): string | null {
  const text = `${ch.group ?? ""}\n${ch.name}`;
  if (rules.drop.some((re) => re.test(text))) return null;
  if (rules.liveOnly && isVod(ch)) return null;
  let country: string | null | undefined;
  let sports: boolean | undefined;
  for (const rule of rules.keep) {
    if (rule.countries) {
      country ??= countryOf(ch);
      if (!rule.countries.has(country ?? "NONE")) continue;
    }
    if (rule.sports && !(sports ??= isSports(ch))) continue;
    if (rule.match && !rule.match.test(text)) continue;
    return rule.label;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Playlist

export type PlaylistStats = {
  total: number;
  kept: number;
  byRule: Record<string, number>;
  /** Kept groups by size, so the rules can be checked against the real list. */
  keptGroups: [string, number][];
  /** The biggest dropped groups, the place to look when something is missing. */
  droppedGroups: [string, number][];
};

/**
 * Filters an M3U given line by line. Kept entries are written exactly as the provider wrote them
 * (every #EXTINF, #EXTVLCOPT and #KODIPROP line), so the app reads them the way it always has.
 * Returns the kept channels' guide ids and names, for trimming the guide.
 */
export async function filterPlaylist(
  lines: AsyncIterable<string> | Iterable<string>,
  rules: CompiledRules,
  write: (text: string) => void | Promise<void>,
): Promise<{ stats: PlaylistStats; guideIds: Set<string>; names: Set<string> }> {
  const byRule: Record<string, number> = {};
  const kept = new Map<string, number>();
  const dropped = new Map<string, number>();
  const guideIds = new Set<string>();
  const names = new Set<string>();
  let total = 0;
  let block: string[] = [];
  let stickyGroup: string | null = null;
  await write("#EXTM3U\n");
  for await (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#EXTM3U")) continue;
    if (line.startsWith("#EXTGRP:")) stickyGroup = line.slice(8).trim() || null;
    if (line.startsWith("#EXTINF:")) block = [];
    block.push(line);
    if (line.startsWith("#")) continue;
    const entry = block;
    block = [];
    const ch = iterateM3uChannels(entry.join("\n"), "s").next().value;
    if (!ch) continue;
    if (!ch.group && stickyGroup) ch.group = stickyGroup;
    total += 1;
    const label = ruleFor(ch, rules);
    const group = ch.group ?? "(no group)";
    if (!label) {
      dropped.set(group, (dropped.get(group) ?? 0) + 1);
      continue;
    }
    byRule[label] = (byRule[label] ?? 0) + 1;
    kept.set(group, (kept.get(group) ?? 0) + 1);
    if (ch.tvgId) guideIds.add(ch.tvgId.toLowerCase());
    names.add(nameKey(ch.name));
    await write(entry.join("\n") + "\n");
  }
  const top = (m: Map<string, number>, n: number) =>
    [...m].sort((a, b) => b[1] - a[1]).slice(0, n) as [string, number][];
  const keptCount = Object.values(byRule).reduce((a, b) => a + b, 0);
  return {
    stats: {
      total,
      kept: keptCount,
      byRule,
      keptGroups: top(kept, 200),
      droppedGroups: top(dropped, 60),
    },
    guideIds,
    names,
  };
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// ---------------------------------------------------------------------------------------------
// Guide (XMLTV)

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  if (!m) return null;
  return (m[2] ?? m[3] ?? "").replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e]);
}

/** "20261115193000 +0000" (the offset is optional) as epoch ms, or NaN. */
export function xmltvTime(value: string | null): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-])?(\d{2})?(\d{2})?/.exec(
    value?.trim() ?? "",
  );
  if (!m) return Number.NaN;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (!m[7]) return utc;
  const offset = (+(m[8] ?? 0) * 60 + +(m[9] ?? 0)) * 60_000;
  return m[7] === "+" ? utc - offset : utc + offset;
}

export type GuideStats = { channels: number; programmes: number };

/**
 * Trims a guide given as text chunks: keeps the <channel> entries of kept channels (by guide id,
 * or by display name for lists without ids) and their <programme> entries from `fromMs` to
 * `toMs`. Reads one element at a time, so a guide of any size fits.
 */
export async function trimGuide(
  chunks: AsyncIterable<string>,
  keep: { guideIds: Set<string>; names: Set<string> },
  window: { fromMs: number; toMs: number },
  write: (text: string) => void | Promise<void>,
): Promise<GuideStats> {
  const ids = new Set(keep.guideIds);
  const stats: GuideStats = { channels: 0, programmes: 0 };
  let buf = "";
  await write('<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="JL Smart List">\n');
  const take = async (el: string, kind: "channel" | "programme") => {
    const open = el.slice(0, el.indexOf(">") + 1);
    if (kind === "channel") {
      const id = attr(open, "id");
      if (!id) return;
      let keepIt = ids.has(id.toLowerCase());
      if (!keepIt) {
        for (const m of el.matchAll(/<display-name[^>]*>([^<]*)<\/display-name>/g)) {
          if (
            keep.names.has(
              nameKey(m[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTITIES[e])),
            )
          ) {
            keepIt = true;
            break;
          }
        }
        if (keepIt) ids.add(id.toLowerCase());
      }
      if (!keepIt) return;
      stats.channels += 1;
      await write(el + "\n");
      return;
    }
    const channel = attr(open, "channel");
    if (!channel || !ids.has(channel.toLowerCase())) return;
    const start = xmltvTime(attr(open, "start"));
    const stop = xmltvTime(attr(open, "stop"));
    if (start > window.toMs || (Number.isFinite(stop) ? stop : start) < window.fromMs) return;
    stats.programmes += 1;
    await write(el + "\n");
  };
  for await (const chunk of chunks) {
    buf += chunk;
    for (;;) {
      const c = buf.indexOf("<channel");
      const p = buf.indexOf("<programme");
      const at = c < 0 ? p : p < 0 ? c : Math.min(c, p);
      if (at < 0) {
        buf = buf.slice(-16);
        break;
      }
      const kind = at === c ? "channel" : "programme";
      const after = buf[at + kind.length + 1];
      if (after === undefined) {
        buf = buf.slice(at);
        break;
      }
      if (!/[\s>/]/.test(after)) {
        // "<channels" or similar: not an element this reads.
        buf = buf.slice(at + 1);
        continue;
      }
      const gt = buf.indexOf(">", at);
      if (gt < 0) {
        buf = buf.slice(at);
        break;
      }
      let end: number;
      if (buf[gt - 1] === "/") end = gt + 1;
      else {
        const close = buf.indexOf(`</${kind}>`, gt);
        if (close < 0) {
          buf = buf.slice(at);
          break;
        }
        end = close + kind.length + 3;
      }
      await take(buf.slice(at, end), kind);
      buf = buf.slice(end);
    }
  }
  await write("</tv>\n");
  return stats;
}

// ---------------------------------------------------------------------------------------------
// Lists on this server

type Source =
  | { m3u: string; epg?: string }
  | { xtream: { server: string; username: string; password: string } };

export type SmartListConfig = {
  id: string;
  token: string;
  source: Source;
  refreshHours?: number;
  guideHours?: number;
  rules?: SmartRules;
};

export type SmartListStatus = {
  id: string;
  refreshedAt: number | null;
  playlist: PlaylistStats | null;
  guide: (GuideStats & { hours: number }) | null;
  /** The last refresh's problem (never a provider address), or null. */
  error: string | null;
};

const UA = "VLC/3.0.20 LibVLC/3.0.20";
const ID = /^[a-z0-9][a-z0-9_-]{0,40}$/i;

function sourceUrls(source: Source): { m3u: string; epg: string | null } {
  if ("xtream" in source) {
    const { server, username, password } = source.xtream;
    const base = server.replace(/\/+$/, "");
    const q = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    return {
      m3u: `${base}/get.php?${q}&type=m3u_plus&output=ts`,
      epg: `${base}/xmltv.php?${q}`,
    };
  }
  return { m3u: source.m3u, epg: source.epg ?? null };
}

function validList(v: unknown): v is SmartListConfig {
  if (!v || typeof v !== "object") return false;
  const l = v as SmartListConfig;
  return (
    typeof l.id === "string" &&
    ID.test(l.id) &&
    typeof l.token === "string" &&
    /^[a-f0-9]{32,}$/i.test(l.token) &&
    !!l.source &&
    typeof l.source === "object"
  );
}

/** A problem message without addresses or credentials. */
function safeError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "(address)").slice(0, 200);
}

async function download(url: string, to: string, signal: AbortSignal): Promise<void> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    redirect: "follow",
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Provider answered HTTP ${res.status}`);
  await pipeline(
    Readable.fromWeb(res.body as import("node:stream/web").ReadableStream),
    createWriteStream(to),
  );
}

/** A downloaded file as text, gunzipped when it is gzip. */
async function openText(path: string): Promise<Readable> {
  const head = Buffer.alloc(2);
  const fh = await open(path, "r");
  try {
    await fh.read(head, 0, 2, 0);
  } finally {
    await fh.close();
  }
  const raw = createReadStream(path);
  const text = head[0] === 0x1f && head[1] === 0x8b ? raw.pipe(createGunzip()) : raw;
  text.setEncoding("utf8");
  return text;
}

function writer(stream: Writable): (text: string) => Promise<void> {
  return (text) =>
    new Promise((resolve, reject) => {
      if (stream.write(text)) resolve();
      else {
        stream.once("drain", resolve);
        stream.once("error", reject);
      }
    });
}

function finish(stream: Writable): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(resolve);
  });
}

export class SmartLists {
  private lists: SmartListConfig[] = [];
  private running = new Map<string, Promise<void>>();
  private timer: ReturnType<typeof setInterval> | undefined;

  private configPath: string;
  private dataDir: string;

  constructor(configPath: string, dataDir: string) {
    this.configPath = configPath;
    this.dataDir = dataDir;
  }

  /** Reads the lists file again (edits apply without a restart). */
  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.configPath, "utf8")) as { lists?: unknown };
      this.lists = Array.isArray(parsed.lists) ? parsed.lists.filter(validList) : [];
    } catch {
      this.lists = [];
    }
  }

  get count(): number {
    return this.lists.length;
  }

  start(): void {
    const tick = () => {
      void this.load().then(() => {
        for (const list of this.lists) void this.refreshIfDue(list);
      });
    };
    tick();
    this.timer = setInterval(tick, 10 * 60_000);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
  }

  private dir(id: string): string {
    return join(this.dataDir, id);
  }

  async status(id: string): Promise<SmartListStatus> {
    try {
      return JSON.parse(await readFile(join(this.dir(id), "status.json"), "utf8"));
    } catch {
      return { id, refreshedAt: null, playlist: null, guide: null, error: null };
    }
  }

  private async refreshIfDue(list: SmartListConfig): Promise<void> {
    const status = await this.status(list.id);
    const every = Math.max(1, list.refreshHours ?? 6) * 3_600_000;
    const last = status.refreshedAt ?? 0;
    // A failed refresh is tried again after 30 minutes, not after the full interval.
    const due = status.error ? 30 * 60_000 : every;
    if (Date.now() - last >= due) await this.refresh(list.id);
  }

  /** Builds the list's files again. One refresh per list at a time; the last good copy stays served. */
  refresh(id: string): Promise<void> {
    const list = this.lists.find((l) => l.id === id);
    if (!list) return Promise.resolve();
    const running = this.running.get(id);
    if (running) return running;
    const job = this.build(list).finally(() => this.running.delete(id));
    this.running.set(id, job);
    return job;
  }

  private async build(list: SmartListConfig): Promise<void> {
    const dir = this.dir(list.id);
    await mkdir(dir, { recursive: true });
    const previous = await this.status(list.id);
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 15 * 60_000);
    const tmp = (name: string) => join(dir, `.${name}.tmp`);
    try {
      const urls = sourceUrls(list.source);
      const rules = compileRules(list.rules ?? DEFAULT_RULES);

      await download(urls.m3u, tmp("source.m3u"), ac.signal);
      const out = createWriteStream(tmp("playlist.m3u"));
      const lines = createInterface({
        input: await openText(tmp("source.m3u")),
        crlfDelay: Infinity,
      });
      const { stats, guideIds, names } = await filterPlaylist(lines, rules, writer(out));
      await finish(out);
      if (stats.total === 0) throw new Error("The provider's playlist had no channels");

      let guide: SmartListStatus["guide"] = previous.guide;
      if (urls.epg) {
        const hours = Math.min(168, Math.max(6, list.guideHours ?? 36));
        const now = Date.now();
        await download(urls.epg, tmp("source.xml"), ac.signal);
        const gz = createGzip();
        const file = createWriteStream(tmp("epg.xml.gz"));
        const done = pipeline(gz, file);
        const g = await trimGuide(
          await openText(tmp("source.xml")),
          { guideIds, names },
          { fromMs: now - 2 * 3_600_000, toMs: now + hours * 3_600_000 },
          writer(gz),
        );
        gz.end();
        await done;
        await rename(tmp("epg.xml.gz"), join(dir, "epg.xml.gz"));
        guide = { ...g, hours };
      }
      await rename(tmp("playlist.m3u"), join(dir, "playlist.m3u"));
      await this.writeStatus(list.id, {
        id: list.id,
        refreshedAt: Date.now(),
        playlist: stats,
        guide,
        error: null,
      });
      console.log(
        `[smart-list] ${list.id}: kept ${stats.kept} of ${stats.total} channels` +
          (guide ? `, ${guide.programmes} guide entries` : ""),
      );
    } catch (error) {
      const message = ac.signal.aborted ? "The provider took too long" : safeError(error);
      console.error(`[smart-list] ${list.id}: ${message}`);
      await this.writeStatus(list.id, { ...previous, refreshedAt: Date.now(), error: message });
    } finally {
      clearTimeout(timeout);
      for (const name of ["source.m3u", "source.xml", "playlist.m3u", "epg.xml.gz"])
        await rm(tmp(name), { force: true });
    }
  }

  private async writeStatus(id: string, status: SmartListStatus): Promise<void> {
    const path = join(this.dir(id), "status.json");
    await writeFile(path + ".tmp", JSON.stringify(status, null, 1));
    await rename(path + ".tmp", path);
  }

  /** The list a private link's token opens, or null. */
  byToken(token: string): SmartListConfig | null {
    const given = Buffer.from(token);
    for (const list of this.lists) {
      const want = Buffer.from(list.token);
      if (want.length === given.length && timingSafeEqual(want, given)) return list;
    }
    return null;
  }

  /** A built file of the list, or null while it has none yet. */
  async file(
    list: SmartListConfig,
    name: "playlist.m3u" | "epg.xml.gz",
  ): Promise<{ path: string; size: number; mtimeMs: number } | null> {
    const path = join(this.dir(list.id), name);
    try {
      const s = await stat(path);
      return { path, size: s.size, mtimeMs: s.mtimeMs };
    } catch {
      return null;
    }
  }
}
