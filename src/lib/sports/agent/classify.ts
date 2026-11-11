/**
 * The Sports agent's rules: what each of the viewer's channels is, from its name alone. Clear
 * names are sorted here for free; the ones these rules can't place go to Claude (ai-sort.ts).
 * Plain module, no I/O.
 */

export type AgentKind = "network" | "event" | "local" | "team" | "other";

export type AgentLabel = {
  kind: AgentKind;
  /** The network as the schedule names it ("ESPN", "NBC", "FanDuel SN Ohio"), when known. */
  network?: string;
  /** League tag for event slots and team channels ("NBA", "NFL", "NCAAF"). */
  league?: string;
  /** Two-letter state of a local station or team channel. */
  state?: string;
  /** City of a local station or team channel, lower case. */
  city?: string;
  /** Who decided: these rules, Claude, or the viewer. */
  by: "rules" | "ai" | "you";
};

export const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);

/** Over-the-air networks whose channels are local stations. */
const LOCAL_NET =
  /\b(ABC|CBS|FOX|NBC|CW|PBS|MY|MYTV|TELEMUNDO|UNIVISION|UNIMAS|ION)(?=\s?\d*\b)\s?\d*\b/i;
const CALLSIGN = /\(?\b[KW][A-Z]{2,3}(?:-?(?:TV|DT|CD|LD))?\b\)?/g;
const LEAGUE_SLOT =
  /^(?:US(?:A)?[:\s|-]+)?(NFL|NBA|WNBA|NHL|MLB|MILB|MLS|NCAAF|NCAAB|NCAAW ?B|CFB|CBB|UFC|PPV|NBA PASS(?: PPV)?|NHL PASS|MLB PASS)\b(?:\s*(?:LIVE|SUNDAY|PPV))?\s*[|:-]?\s*\d{1,3}\s*[:|-]/i;
/** Any other numbered event slot: "Tennis 01:", "Golf 03:", "DAZN CA 34: LIV Golf ...". */
const OTHER_SLOT = /^(?:USA?\s+)?[A-Za-z][A-Za-z+ ]{1,24}?\s\d{1,3}\s*:/;
const NFL_TEAM = /^NFL\s+(CBS|FOX|NBC|ABC)\s+(.+)$/i;

const NETWORK_NAMES: Array<[RegExp, string]> = [
  [/\bESPN\s?(?:1|HD|UHD|FHD|SD)?$|^ESPN$/i, "ESPN"],
  [/\bESPN\s?2\b/i, "ESPN2"],
  [/\bESPN\s?U\b/i, "ESPNU"],
  [/\bESPN\s?NEWS\b/i, "ESPNEWS"],
  [/\bSEC NETWORK\b|\bESPN SEC\b/i, "SEC Network"],
  [/\bACC ?(?:NETWORK|N)\b|\bESPN \(?ACCN\)?/i, "ACC Network"],
  [/\bBIG TEN NETWORK\b|\bBTN\b/i, "BTN"],
  [/\bFOX SPORTS 1\b|\bFS1\b/i, "FS1"],
  [/\bFOX SPORTS 2\b|\bFS2\b/i, "FS2"],
  [/\bCBS SPORTS(?: NETWORK| HD)?$|\bCBSSN\b/i, "CBSSN"],
  [/\bNFL NETWORK\b/i, "NFL Network"],
  [/\bNFL RED ?ZONE\b/i, "NFL RedZone"],
  [/\bNBA TV\b/i, "NBA TV"],
  [/\bNHL NETWORK\b/i, "NHL Network"],
  [/\bMLB NETWORK\b/i, "MLB Network"],
  [/\bTNT\b/i, "TNT"],
  [/\bTBS\b/i, "TBS"],
  [/\bTRU ?TV\b/i, "truTV"],
  [/\bGOLF CHANNEL\b|\bNBC GOLF\b/i, "Golf Channel"],
  [/\bTENNIS CHANNEL\b/i, "Tennis Channel"],
  [/\bUSA NETWORK\b/i, "USA Net"],
];

/** A name without provider tags: "SP - ", a leading country, quality and feed tags. */
export function bareName(name: string): string {
  return name
    .replace(/^\s*(?:\|[A-Z]{2}\|\s*)?(?:SP|USA|US|UK|CA|NA)\s*[:|-]\s*/i, "")
    .replace(/^\s*(?:USA|US)\s+(?=\S)/i, "")
    .replace(/\((?:backup|east|west|alt)\)/gi, " ")
    .replace(/\b(?:UHD|FHD|HD|SD|LHD|LQ|4K|1080[PI]?|720P?|HEVC|BACKUP|ALT|EAST|WEST)\b|\*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localStation(name: string): AgentLabel | null {
  // "IA | Des Moines | NBC WHO"
  const piped = name.split("|").map((p) => p.trim());
  if (piped.length >= 3 && US_STATES.has(piped[0].toUpperCase())) {
    const net = LOCAL_NET.exec(piped[2]);
    if (net)
      return {
        kind: "local",
        network: canonicalLocal(net[1]),
        state: piped[0].toUpperCase(),
        city: piped[1].toLowerCase(),
        by: "rules",
      };
  }
  // "USA NBC 13 WVTM BIRMINGHAM (2)", "USA abc18 KWYB Butte", "USA FOX 10 (WALA) Alabama"
  if (!/^\s*USA?\b/i.test(name)) return null;
  const rest = name.replace(/^\s*USA?\s*[:|-]?\s*/i, "");
  const net = LOCAL_NET.exec(rest);
  if (!net || net.index > 0) return null;
  const tail = rest.slice(net[0].length);
  const hasCall = new RegExp(CALLSIGN.source).test(tail);
  if (!hasCall) return null;
  const city = tail
    .replace(CALLSIGN, " ")
    .replace(/\(\d\)|\b\d+\b|[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return { kind: "local", network: canonicalLocal(net[1]), city: city || undefined, by: "rules" };
}

function canonicalLocal(net: string): string {
  const up = net.toUpperCase();
  return up === "MYTV"
    ? "MY"
    : up === "TELEMUNDO" || up === "UNIVISION" || up === "UNIMAS"
      ? up[0] + up.slice(1).toLowerCase()
      : up;
}

/** What the rules can tell from a channel's name; null when they can't place it. */
export function classifyByRules(name: string): AgentLabel | null {
  const team = NFL_TEAM.exec(name.trim());
  if (team) {
    const words = team[2].trim().split(/\s+/);
    const last = words.at(-1)?.toUpperCase() ?? "";
    const state = US_STATES.has(last) ? last : undefined;
    return {
      kind: "team",
      league: "NFL",
      network: team[1].toUpperCase(),
      state,
      city: (state ? words.slice(1, -1) : words.slice(1)).join(" ").toLowerCase() || undefined,
      by: "rules",
    };
  }
  const slot = LEAGUE_SLOT.exec(name.trim());
  if (slot) {
    const league = slot[1].toUpperCase().replace(/\s+/g, " ").replace(/ PPV$/, "");
    return { kind: "event", league: league.startsWith("NBA PASS") ? "NBA" : league, by: "rules" };
  }
  if (/\bESPN\s?\+|\bESPN PLUS\b/i.test(name))
    return { kind: "event", network: "ESPN+", by: "rules" };
  if (OTHER_SLOT.test(name.trim())) return { kind: "event", by: "rules" };
  const local = localStation(name);
  if (local) return local;
  if (/\bESPN\s?\+|\bESPN PLUS\b/i.test(name))
    return { kind: "event", network: "ESPN+", by: "rules" };
  const bare = bareName(name);
  for (const [re, network] of NETWORK_NAMES)
    if (re.test(bare) && bare.length <= network.length + 14)
      return { kind: "network", network, by: "rules" };
  return null;
}

/** Whether a local station or team channel is in the viewer's area. 2 = city, 1 = state, 0 = no. */
export function areaFit(
  label: Pick<AgentLabel, "state" | "city">,
  area: { state: string; city: string },
): number {
  const state = area.state.trim().toUpperCase();
  const city = area.city.trim().toLowerCase();
  if (label.state && state && label.state !== state) return 0;
  if (city && label.city && (label.city.includes(city) || city.includes(label.city))) return 2;
  return label.state && state && label.state === state ? 1 : 0;
}
