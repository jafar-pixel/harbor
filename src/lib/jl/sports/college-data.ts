import { allowWebProxyHost, safeFetch } from "@/lib/safe-fetch";
import { allsportsGet } from "./allsports";
import { NCAA_DIRECTORY_URL, isCollege, parseNcaaDirectory, type College } from "./colleges";
import snapshot from "./data/colleges.json";
import {
  calendarUrl,
  eventsForSport,
  homeUrl,
  newsUrl,
  parsePlayerBio,
  parseCalendar,
  parseNews,
  parseBoxScore,
  parseOpponentHistory,
  parseRoster,
  parseScheduleLinks,
  parseSchoolSports,
  parseStory,
  rosterUrl,
  scheduleUrl,
  validSlug,
  type BoxScore,
  type OpponentHistory,
  type PlayerBio,
  type RosterPlayer,
  type ScheduleLinks,
  type StorySummary,
  type SchoolEvent,
  type SchoolStory,
} from "./sidearm";
import {
  asSportFor,
  mergeSeason,
  pickTeam,
  schoolKey,
  teamGamesPath,
  teamSearchPath,
} from "./student-fallback";

/**
 * College Sports data on the device: the school list (bundled snapshot, else the NCAA's public
 * directory, cached locally) and each school's own SIDEARM site (calendar, sports, rosters, bios,
 * news). Desktop fetches natively; the web build can only reach hosts that allow it.
 */

const DIRECTORY_CACHE_KEY = "jl.sports.colleges.v1";
const DIRECTORY_TTL_MS = 7 * 86_400_000;
const MIN_DIRECTORY = 500;
const TIMEOUT_MS = 15_000;
const MAX_TEXT = 8_000_000;

type Entry<T> = { at: number; value: T };
const cache = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** One load per key at a time, kept for `ttl`; a failed reload keeps the last good value. */
function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = load()
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .catch((error: unknown) => {
      if (hit) return hit.value;
      throw error;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

async function getText(url: string, init?: RequestInit): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await safeFetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    const body = await res.text();
    return body.length <= MAX_TEXT ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---- School list -------------------------------------------------------------------------

function readDirectoryCache(): { at: number; list: College[] } | null {
  try {
    const raw = localStorage.getItem(DIRECTORY_CACHE_KEY);
    const v = raw ? (JSON.parse(raw) as { at?: unknown; list?: unknown }) : null;
    if (!v || typeof v.at !== "number" || !Array.isArray(v.list)) return null;
    const list = v.list.filter(isCollege);
    return list.length >= MIN_DIRECTORY ? { at: v.at, list } : null;
  } catch {
    return null;
  }
}

function writeDirectoryCache(list: College[]) {
  try {
    localStorage.setItem(DIRECTORY_CACHE_KEY, JSON.stringify({ at: Date.now(), list }));
  } catch {
    /* storage full or unavailable: the list is fetched again next time */
  }
}

const bundled: College[] = (snapshot as unknown[]).filter(isCollege);
// School sites send no CORS headers; the web build reaches them through its proxy, which allows
// exactly these hosts (api/proxy.ts reads the same snapshot).
for (const c of bundled) if (c.site) allowWebProxyHost(c.site);

/** Every NCAA school: the bundled snapshot when present, else the directory (cached a week). */
export function loadColleges(): Promise<College[]> {
  if (bundled.length >= MIN_DIRECTORY) return Promise.resolve(bundled);
  return cached("directory", DIRECTORY_TTL_MS, async () => {
    const stored = readDirectoryCache();
    if (stored && Date.now() - stored.at < DIRECTORY_TTL_MS) return stored.list;
    const body = await getText(NCAA_DIRECTORY_URL, { headers: { Accept: "application/json" } });
    let list: College[] = [];
    try {
      list = body ? parseNcaaDirectory(JSON.parse(body)) : [];
    } catch {
      list = [];
    }
    if (list.length >= MIN_DIRECTORY) {
      writeDirectoryCache(list);
      return list;
    }
    if (stored) return stored.list;
    throw new Error("college directory unavailable");
  });
}

/**
 * The school behind a followed team saved with the account ("ncaa-245", see collegeTeamId), from
 * the bundled directory; null for an ESPN team.
 */
/** The bundled school directory, available without waiting on the network. */
export const bundledColleges = (): readonly College[] => bundled;

export function collegeOfTeamId(teamId: string): College | null {
  const m = /^ncaa-(\d+)$/.exec(teamId);
  return m ? (bundled.find((c) => c.id === `ncaa:${m[1]}`) ?? null) : null;
}

export async function findCollege(id: string): Promise<College | null> {
  return (await loadColleges()).find((c) => c.id === id) ?? null;
}

export async function findCollegeBySite(site: string): Promise<College | null> {
  return (await loadColleges().catch(() => [] as College[])).find((c) => c.site === site) ?? null;
}

// ---- A school's SIDEARM site --------------------------------------------------------------

export type SchoolCalendar = { school: string; events: SchoolEvent[] };

/** The school's whole calendar; null when the site doesn't publish one we can read. */
export function fetchCalendar(site: string): Promise<SchoolCalendar | null> {
  return cached(`cal:${site}`, 15 * 60_000, async () => {
    const ics = await getText(calendarUrl(site));
    return ics ? parseCalendar(ics) : null;
  });
}

export function fetchSchoolSports(site: string): Promise<{ slug: string; name: string }[]> {
  return cached(`sports:${site}`, 86_400_000, async () => {
    const html = await getText(homeUrl(site));
    return html ? parseSchoolSports(html) : [];
  });
}

/** A sport's roster; null when the site didn't answer, [] when it has no SIDEARM roster. */
export function fetchRoster(site: string, slug: string): Promise<RosterPlayer[] | null> {
  if (!validSlug(slug)) return Promise.resolve(null);
  return cached(`roster:${site}:${slug}`, 6 * 3_600_000, async () => {
    const html = await getText(rosterUrl(site, slug));
    return html === null ? null : parseRoster(html, site);
  });
}

export function fetchPlayerBio(profileUrl: string): Promise<PlayerBio | null> {
  return cached(`bio:${profileUrl}`, 6 * 3_600_000, async () => {
    const html = await getText(profileUrl);
    return html ? parsePlayerBio(html) : null;
  });
}

/** A sport's schedule page: each game's opponent logo, box score, recap, photos and history. */
export function fetchScheduleLinks(
  site: string,
  slug: string,
): Promise<Map<string, ScheduleLinks>> {
  if (!validSlug(slug)) return Promise.resolve(new Map());
  return cached(`schedule:${site}:${slug}`, 15 * 60_000, async () => {
    const html = await getText(scheduleUrl(site, slug));
    return html ? parseScheduleLinks(html, site) : new Map<string, ScheduleLinks>();
  });
}

/** Only pages on the school's own site are read; other links open in the browser. */
function onSite(url: string, site: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === site;
  } catch {
    return false;
  }
}

export function fetchBoxScore(site: string, url: string): Promise<BoxScore | null> {
  if (!onSite(url, site)) return Promise.resolve(null);
  return cached(`box:${url}`, 10 * 60_000, async () => {
    const html = await getText(url);
    return html ? parseBoxScore(html) : null;
  });
}

export function fetchOpponentHistory(site: string, url: string): Promise<OpponentHistory | null> {
  if (!onSite(url, site)) return Promise.resolve(null);
  return cached(`history:${url}`, 6 * 3_600_000, async () => {
    const html = await getText(url);
    return html ? parseOpponentHistory(html) : null;
  });
}

export function fetchStory(site: string, url: string): Promise<StorySummary | null> {
  if (!onSite(url, site)) return Promise.resolve(null);
  return cached(`story:${url}`, 6 * 3_600_000, async () => {
    const html = await getText(url);
    return html ? parseStory(html) : null;
  });
}

export function fetchNews(site: string): Promise<SchoolStory[]> {
  return cached(`news:${site}`, 30 * 60_000, async () => {
    const xml = await getText(newsUrl(site), {
      headers: { Accept: "application/rss+xml, text/xml" },
    });
    return xml ? parseNews(xml) : [];
  });
}

/** A sport's season from the school's own calendar. */
export async function fetchSportSchedule(
  site: string,
  slug: string,
): Promise<SchoolCalendar | null> {
  const cal = await fetchCalendar(site);
  return cal ? { school: cal.school, events: eventsForSport(cal.events, slug) } : null;
}

// ---- AllSports fallback (only with the viewer's own key) ----------------------------------

function allsports(key: string, path: string): Promise<unknown> {
  return allsportsGet(key, path, 15 * 60_000).catch(() => null);
}

/** The team's season from AllSports, when the school's site has none; null when not found. */
export function fetchAllSportsSeason(
  key: string,
  school: string,
  slug: string,
): Promise<SchoolEvent[] | null> {
  const sport = asSportFor(slug);
  const name = schoolKey(school);
  if (!key || !sport || name.length < 3) return Promise.resolve(null);
  return cached(`as:${school}:${slug}`, 15 * 60_000, async () => {
    const team = pickTeam(
      await allsports(key, teamSearchPath(sport.base, name)),
      name,
      sport.gender,
    );
    if (!team) return null;
    const [prev, next] = await Promise.all([
      allsports(key, teamGamesPath(sport.base, team.id, "previous")),
      allsports(key, teamGamesPath(sport.base, team.id, "next")),
    ]);
    return mergeSeason([prev, next], team.id);
  });
}
