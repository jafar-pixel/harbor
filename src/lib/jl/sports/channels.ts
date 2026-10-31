import type { EpgIndex, IptvChannel } from "../../iptv/types.ts";
import type { SportsGame, SportsSide } from "../../sports/espn.ts";
import { parseEventChannel, teamKey, type ParsedEvent } from "./event-parse.ts";

/**
 * "Which of my channels has this game?" against the customer's own playlist, on the device:
 *  1. provider event channels ("NCAAF 03: #1 Texas vs. #14 Tennessee @ 26 Sep 12:00 PM ET"),
 *  2. the broadcast network's channel ("ESPN" → "US: ESPN HD"),
 *  3. guide listings that name both teams, or the league's generic listing in the home city.
 */

export type GameChannelSource = "event" | "network" | "guide";

export type GameChannel = { channel: IptvChannel; via: GameChannelSource; alternate: boolean };

type GuideProgram = {
  tvgId: string;
  title: string;
  description: string;
  startMs: number;
  endMs: number;
};

export type SportsChannelIndex = {
  events: Array<{ channel: IptvChannel; event: ParsedEvent }>;
  named: Array<{ channel: IptvChannel; upper: string }>;
  byTvgId: Map<string, IptvChannel[]>;
  guide: GuideProgram[];
};

const MAX_CHANNELS = 6;
const SAME_GAME_MS = 20 * 60000;
const FOOTBALL_SPORT: Record<string, "nfl" | "cfb"> = { NFL: "nfl", NCAAF: "cfb" };
const PRO_LEAGUES = new Set(["NFL", "NBA", "NHL", "MLB"]);

const GENERIC_LISTINGS: Record<string, RegExp> = {
  MLB: /^(MLB Baseball|Major League Baseball)/i,
  NBA: /^NBA\b/i,
  NHL: /^NHL\b/i,
  NFL: /^NFL\b/i,
};

/** Builds the lookup once per playlist/guide refresh; game lookups then stay cheap. */
export function buildSportsChannelIndex(
  channels: IptvChannel[],
  epg: EpgIndex | null,
  now: Date,
): SportsChannelIndex {
  const events: SportsChannelIndex["events"] = [];
  const named: SportsChannelIndex["named"] = [];
  const byTvgId = new Map<string, IptvChannel[]>();
  for (const channel of channels) {
    const event = parseEventChannel(channel.name, channel.group ?? "", now);
    if (event) {
      events.push({ channel, event });
      continue;
    }
    named.push({ channel, upper: channel.name.toUpperCase() });
    if (channel.tvgId) {
      const list = byTvgId.get(channel.tvgId);
      if (list) list.push(channel);
      else byTvgId.set(channel.tvgId, [channel]);
    }
  }
  const guide: GuideProgram[] = [];
  if (epg) {
    const from = now.getTime() - 5 * 3600000;
    const to = now.getTime() + 18 * 3600000;
    for (const [tvgId, programs] of epg.byChannel) {
      if (!byTvgId.has(tvgId)) continue;
      for (const p of programs) {
        if (p.endMs <= from || p.startMs >= to) continue;
        guide.push({
          tvgId,
          title: teamKey(p.title),
          description: (p.description ?? "").toLowerCase(),
          startMs: p.startMs,
          endMs: p.endMs,
        });
      }
    }
  }
  return { events, named, byTvgId, guide };
}

function sideKeys(side: SportsSide): string[] {
  return [side.location, side.name]
    .filter((n): n is string => !!n)
    .map(teamKey)
    .filter((k) => k.length >= 2);
}

function keysMatch(a: string, b: string): boolean {
  return (
    a === b || (a.length > 4 && b.length > 4 && (a.startsWith(`${b} `) || b.startsWith(`${a} `)))
  );
}

function eventChannels(game: SportsGame, index: SportsChannelIndex): GameChannel[] {
  const sport = FOOTBALL_SPORT[game.league];
  if (!sport || !game.startMs) return [];
  const keys = [...sideKeys(game.away), ...sideKeys(game.home)];
  return index.events
    .filter(({ event }) => {
      if (event.sport !== sport) return false;
      if (Math.abs(event.start.getTime() - game.startMs) > SAME_GAME_MS) return false;
      return event.teams.some((t) => {
        const k = teamKey(t.name);
        return keys.some((j) => keysMatch(k, j));
      });
    })
    .map(({ channel, event }) => ({ channel, via: "event" as const, alternate: event.alternate }));
}

const ALIASES: Record<string, string[]> = {
  FS1: ["FS1", "FOX SPORTS 1"],
  FS2: ["FS2", "FOX SPORTS 2"],
  ESPNU: ["ESPNU"],
  ESPN2: ["ESPN2", "ESPN 2"],
  "NFL Net": ["NFL NETWORK"],
  "NFL Network": ["NFL NETWORK"],
  "MLB Net": ["MLB NETWORK"],
  "MLB Network": ["MLB NETWORK"],
  "NBA TV": ["NBA TV"],
  "NHL Net": ["NHL NETWORK"],
  "NHL Network": ["NHL NETWORK"],
  BTN: ["BIG TEN NETWORK", "BTN"],
  "Big Ten Network": ["BIG TEN NETWORK", "BTN"],
  "SEC Network": ["SEC NETWORK"],
  SECN: ["SEC NETWORK"],
  "ACC Network": ["ACC NETWORK"],
  ACCN: ["ACC NETWORK"],
  "CBS Sports Network": ["CBS SPORTS NETWORK", "CBSSN"],
  CBSSN: ["CBS SPORTS NETWORK", "CBSSN"],
  "USA Net": ["USA NETWORK"],
  "Golf Channel": ["GOLF CHANNEL", "GOLF"],
  "Tennis Channel": ["TENNIS CHANNEL"],
  "TNT Sports": ["TNT"],
  truTV: ["TRUTV"],
};

// Streaming-only services have no linear channel to match.
const STREAMING_ONLY =
  /^(ESPN\+|Peacock|Prime Video|Paramount\+|Max|Apple TV\+?|Netflix|DAZN|YouTube)$/i;
// Fallback picks skip spin-off feeds ("NBC NEWS NOW", "NBC CNBC", event PPV channels).
const SPIN_OFF = /\b(NEWS|NOW|LX|SN|CNBC|MSNBC|PPV|EVENT|PLUS)\b|\+/i;
const PREFIX = "^((US|USA)[:| ]*)?";
const QUALITY_SUFFIX =
  "( (HD|FHD|UHD|SD|EAST|4K|1080P?|720P?|HEVC|H265|HFR|(50|60) ?FPS))*( ?\\*)?";
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const RES_4K = /\b(8K|4K|UHD|2160P?)\b/;
const RES_1080 = /\b(FHD|1080[PI]?(50|60)?)\b/;
const RES_720 = /\b(HD|720P?(50|60)?)\b/;
const RES_SD = /\b(SD|480P?)\b/;
const HIGH_FRAME_RATE = /\b(50|60) ?FPS\b|\bHFR\b|\b(1080|720)P?(50|60)\b/;

/**
 * How good a channel's picture is likely to be, from the tags providers put in names: 4K/UHD,
 * then FHD/1080, then HD/720, then untagged, then SD; 50/60 fps is a step up within each, and
 * backup feeds drop below their main feed.
 */
export function channelQuality(name: string): number {
  // NFKC turns styled tags ("ᴴᴰ", "⁸ᴷ") into plain letters before matching.
  const n = name.normalize("NFKC").toUpperCase();
  let q = RES_4K.test(n)
    ? 40
    : RES_1080.test(n)
      ? 30
      : RES_720.test(n)
        ? 20
        : RES_SD.test(n)
          ? 0
          : 10;
  if (HIGH_FRAME_RATE.test(n)) q += 5;
  if (/BACK ?UP/.test(n)) q -= 15;
  return q;
}

/** A short badge for a channel's picture ("4K 60", "1080", "HD"); null when the name says nothing. */
export function qualityLabel(name: string): string | null {
  const n = name.toUpperCase();
  const base = RES_4K.test(n) ? "4K" : RES_1080.test(n) ? "1080" : RES_720.test(n) ? "HD" : null;
  if (!base) return null;
  return HIGH_FRAME_RATE.test(n) ? `${base} 60` : base;
}

/** Preferred broadcasters among sources already matched to this game. */
export function sportsBroadcasterPriority(name: string): number {
  const n = name.toUpperCase().replace(/^(?:US|USA)\s*[:|]\s*/, "");
  if (/\bESPN(?:\s*[2U])?\b/.test(n)) return 0;
  if (/\bABC\b/.test(n)) return 1;
  if (/\bCBS\b|\bCBSSN\b/.test(n)) return 2;
  if (/\bFOX\b|\bFS[12]\b/.test(n)) return 3;
  if (/\bNBC\b/.test(n)) return 4;
  return 5;
}

/**
 * A channel's quality from its name, raised to 4K when its group is a 4K/8K one ("US| NBA PASS
 * PPV ⁸ᴷ"): event slots rarely tag themselves, their group does.
 */
export function channelQualityOf(channel: IptvChannel): number {
  const own = channelQuality(channel.name);
  const group = (channel.group ?? "").normalize("NFKC").toUpperCase();
  return RES_4K.test(group) ? Math.max(own, 40 + (own % 10)) : own;
}

const byQuality = (a: IptvChannel, b: IptvChannel) => channelQualityOf(b) - channelQualityOf(a);

/** A standard-definition feed (SD/480p in the name). */
export function isSdChannel(name: string): boolean {
  return RES_SD.test(name.toUpperCase());
}

// Another country's feed of the game ("UK: Sky Sports Main Event", a "CA Sports" group): its
// own commentary and ad breaks, and providers often carry it at a lower quality.
const FOREIGN =
  /^(?:UK|GB|CA|CAN|AU|IE|FR|DE|ES|IT|NL|PT|BR|MX|AR|LATAM|NZ|ARAB|AFR)\b|\bSKY ?SPORTS?\b|\bTSN\b|\bSPORTSNET\b|\bBT SPORT\b|\bTNT SPORTS UK\b/i;

/** 1 for another country's feed, 0 for a US or unprefixed one. */
export function foreignFeed(channel: IptvChannel): number {
  const name = channel.name.trim();
  if (/^(?:US|USA)\b/i.test(name)) return 0;
  return FOREIGN.test(name) || FOREIGN.test((channel.group ?? "").trim()) ? 1 : 0;
}

/** A streaming-only service (ESPN+, Peacock, Prime Video…): watched in its own app, not on a channel. */
export function isStreamingOnly(network: string): boolean {
  return STREAMING_ONLY.test(network.trim());
}

function searchTerms(network: string): string[] {
  return (
    ALIASES[network] ?? [
      network
        .replace(/^The /i, "")
        .replace(/ (Network|Channel)$/i, "")
        .toUpperCase(),
    ]
  );
}

export function networkChannel(network: string, index: SportsChannelIndex): IptvChannel | null {
  return networkChannels(network, index)[0] ?? null;
}

/** The network's channels in the playlist (its quality versions), best picture first. */
// A provider's list runs to tens of thousands of channels, and every game on a network asks for
// the same scan, so results are kept per index (a new index, from new channels or a new guide
// window, starts empty).
const networkCache = new WeakMap<SportsChannelIndex, Map<string, IptvChannel[]>>();
const gameCache = new WeakMap<SportsChannelIndex, Map<string, GameChannel[]>>();
const LIVE_GUIDE_BUCKET_MS = 5 * 60000;

function cacheFor<T>(
  cache: WeakMap<SportsChannelIndex, Map<string, T>>,
  index: SportsChannelIndex,
) {
  let map = cache.get(index);
  if (!map) {
    map = new Map();
    cache.set(index, map);
  }
  return map;
}

export function networkChannels(network: string, index: SportsChannelIndex): IptvChannel[] {
  const cache = cacheFor(networkCache, index);
  let found = cache.get(network);
  if (!found) {
    found = scanNetworkChannels(network, index);
    cache.set(network, found);
  }
  return found;
}

function scanNetworkChannels(network: string, index: SportsChannelIndex): IptvChannel[] {
  if (isStreamingOnly(network)) return [];
  for (const term of searchTerms(network)) {
    const word = escapeRegex(term.trim());
    if (word.length < 2) continue;
    const any = new RegExp(`${PREFIX}${word}( |\\*|$)`, "i");
    const list = index.named.filter((n) => any.test(n.upper));
    if (!list.length) continue;
    const plain = new RegExp(`${PREFIX}${word}${QUALITY_SUFFIX}$`, "i");
    const rest = (name: string) => name.replace(new RegExp(`${PREFIX}${word}`, "i"), "");
    const plainOnes = list.filter((n) => plain.test(n.upper));
    const picks = plainOnes.length ? plainOnes : list.filter((n) => !SPIN_OFF.test(rest(n.upper)));
    if (picks.length)
      return picks
        .sort((a, b) => byQuality(a.channel, b.channel) || a.upper.length - b.upper.length)
        .map((n) => n.channel);
  }
  return [];
}

function guideTerm(side: SportsSide, league: string): string {
  const raw = PRO_LEAGUES.has(league) ? side.nickname || side.name : side.location || side.name;
  return teamKey(raw ?? "");
}

function guideChannels(game: SportsGame, index: SportsChannelIndex, now: Date): GameChannel[] {
  if (!index.guide.length) return [];
  const at = game.state === "in" ? now.getTime() : game.startMs || now.getTime();
  const near = index.guide.filter((p) => p.startMs <= at + 30 * 60000 && p.endMs > at - 60 * 60000);
  const a = guideTerm(game.away, game.league);
  const b = guideTerm(game.home, game.league);
  const has = (title: string, term: string) =>
    term.length >= 3 && ` ${title} `.includes(` ${term} `);
  let hits = near.filter((p) => has(p.title, a) && has(p.title, b));
  const city = game.home.location?.toLowerCase();
  const listing = GENERIC_LISTINGS[game.league];
  if (!hits.length && listing && city && city.length >= 3 && PRO_LEAGUES.has(game.league)) {
    hits = near.filter((p) => listing.test(p.title) && p.description.includes(` in ${city}`));
  }
  const tvgIds = [...new Set(hits.map((p) => p.tvgId))];
  const rank = (c: IptvChannel) =>
    /back ?up/i.test(c.name) ? 3 : /^(USA|US)[ :|]/i.test(c.name) ? 0 : 1;
  return tvgIds
    .flatMap((id) => index.byTvgId.get(id) ?? [])
    .sort((x, y) => rank(x) - rank(y) || byQuality(x, y))
    .map((channel) => ({ channel, via: "guide" as const, alternate: false }));
}

/**
 * Channels for one game, best first: main event feeds, then the network, guide matches, then
 * alternate feeds. Within each, the best picture leads (channelQuality), so the first channel is
 * the one to play straight away.
 */
export function channelsForGame(
  game: SportsGame,
  index: SportsChannelIndex,
  now: Date,
): GameChannel[] {
  // Only a live game's guide match depends on the time; it is re-read every five minutes.
  const key = [
    game.league,
    game.id,
    game.state,
    game.startMs,
    game.network ?? "",
    (game.broadcasts ?? []).join("|"),
    game.state === "in" ? Math.floor(now.getTime() / LIVE_GUIDE_BUCKET_MS) : "",
  ].join(":");
  const cache = cacheFor(gameCache, index);
  let found = cache.get(key);
  if (!found) {
    found = matchGameChannels(game, index, now);
    cache.set(key, found);
  }
  return found;
}

function matchGameChannels(game: SportsGame, index: SportsChannelIndex, now: Date): GameChannel[] {
  const events = eventChannels(game, index).sort((a, b) => byQuality(a.channel, b.channel));
  const networks = [
    ...new Set([game.network, ...(game.broadcasts ?? [])].filter((name): name is string => !!name)),
  ];
  const network = networks.flatMap((name) => networkChannels(name, index));
  // The game's own feeds (event channels and the network it airs on) lead; a guide match is
  // often another country's broadcast of it.
  const onAir = new Set([...events.map((c) => c.channel.id), ...network.map((c) => c.id)]);
  const ordered: GameChannel[] = [
    ...events.filter((c) => !c.alternate),
    ...network.map((channel) => ({ channel, via: "network" as const, alternate: false })),
    ...guideChannels(game, index, now),
    ...events.filter((c) => c.alternate),
  ];
  ordered.sort(
    (a, b) =>
      Number(a.alternate) - Number(b.alternate) ||
      Number(!onAir.has(a.channel.id)) - Number(!onAir.has(b.channel.id)) ||
      foreignFeed(a.channel) - foreignFeed(b.channel) ||
      byQuality(a.channel, b.channel) ||
      sportsBroadcasterPriority(a.channel.name) - sportsBroadcasterPriority(b.channel.name),
  );
  // SD feeds are only offered when the game has nothing better.
  const anyBetter = ordered.some((c) => !isSdChannel(c.channel.name));
  const seen = new Set<string>();
  const out: GameChannel[] = [];
  for (const c of ordered) {
    if (seen.has(c.channel.id) || (anyBetter && isSdChannel(c.channel.name))) continue;
    seen.add(c.channel.id);
    out.push(c);
    if (out.length >= MAX_CHANNELS) break;
  }
  return out;
}
