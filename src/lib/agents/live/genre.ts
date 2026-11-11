/**
 * The Live TV agent's rules: what kind of channel each of the viewer's channels is, from its name
 * and the provider's group. Clear names are sorted here for free; the rest go to Claude
 * (ai-sort.ts). Plain module, no I/O.
 */

export const LIVE_GENRES = [
  "news",
  "kids",
  "movies",
  "entertainment",
  "documentary",
  "lifestyle",
  "music",
  "spanish",
  "faith",
  "local",
  "sports",
  "adult",
  "other",
] as const;

export type LiveGenre = (typeof LIVE_GENRES)[number];

export type LiveLabel = {
  genre: LiveGenre;
  /** The channel's brand without the provider's tags ("HGTV", "CNN"), when known. */
  brand?: string;
  by: "rules" | "ai";
};

/** The genres Live TV Home shows as rows, in order. */
export const HOME_GENRES: LiveGenre[] = [
  "news",
  "kids",
  "movies",
  "entertainment",
  "documentary",
  "lifestyle",
  "music",
  "spanish",
  "faith",
];

const RULES: Array<[LiveGenre, RegExp]> = [
  // "Adult Swim" and "Pop Adult" / "Adult Contemporary" music aren't adult channels.
  [
    "adult",
    /\b(xxx|18\+|playboy|hustler|brazzers|vivid|for adults|adults only)\b|(?<!pop |soft )\badults?\b(?! swim| contemporary| alternative| hits| standards)/i,
  ],
  [
    "spanish",
    /\b(latino|latin|espa[ñn]ol|spanish|telemundo|univision|unimas|galavision|azteca|televisa|estrella)\b|^(?:es|mx|ar|co)\s*[|:-]/i,
  ],
  [
    "sports",
    /\b(sports?|espn|nfl|nba|nhl|mlb|mls|ncaa[fb]?|ufc|wwe|golf|tennis|racing|f1|nascar|soccer|football|dazn|bein|tsn|sportsnet|fanduel|bally|ppv|nba pass)\b/i,
  ],
  [
    "news",
    /\b(news|cnn|msnbc|cnbc|bloomberg|newsmax|newsnation|cspan|c-span|bbc world|sky news|al jazeera|euronews|france 24|dw|weather|the weather channel|accuweather|fox business|abc news live|cbs news|nbc news now)\b/i,
  ],
  [
    "kids",
    /\b(kids?|cartoons?|disney ?(?:jr|junior|channel|xd)|nick(?:elodeon)?|nick ?jr|nicktoons|teen ?nick|boomerang|baby ?tv|babyfirst|pbs kids|universal kids|duck ?tv|cbeebies|cbbc|toon|anime)\b/i,
  ],
  [
    "movies",
    /\b(movies?|cinema|cine|films?|hbo|showtime|starz|encore|cinemax|tcm|turner classic|epix|mgm\+?|flix|sundance|ifc|hallmark movies|lifetime movies|lmn|fxm|reelz|sony movies)\b/i,
  ],
  [
    "documentary",
    /\b(discovery|nat ?geo|national geographic|history|h2|documentar(?:y|ies)|animal planet|smithsonian|science|investigation discovery|id|military|crime ?\+ ?investigation|nature)\b/i,
  ],
  [
    "music",
    /\b(music|mtv|vh1|cmt|bet jams|bet soul|vevo|revolt|stingray|radio|hits|country music)\b/i,
  ],
  [
    "faith",
    /\b(tbn|daystar|god ?tv|gospel|church|christian|ewtn|catholic|byu|inspiration|hope channel|islam|quran|jewish|3abn|word network)\b/i,
  ],
  [
    "lifestyle",
    /\b(hgtv|food network|cooking|tlc|travel|bravo|e!|lifestyle|own|oprah|magnolia|diy|tastemade|home ?& ?garden|fashion|style|lifetime|we tv|oxygen)\b/i,
  ],
  [
    "local",
    /\b(?:abc|cbs|fox|nbc|cw|pbs|my ?tv|ion)\s?\d{1,2}\b|\b[KW][A-Z]{2,3}(?:-?(?:TV|DT|CD|LD))?\b|^[A-Z]{2}\s*\|\s*[^|]+\|\s*(?:abc|cbs|fox|nbc|cw|pbs)|\b(?:abc|cbs|fox|nbc|cw)\s?net(?:work)?\b|^(?:pbs|cw|my\s?\d{1,2})\b|\blocal(?: channels?| stations?)?\b|\b(?:abc|cbs|fox|nbc|cw)\s+(?:new york|los angeles|chicago|miami|boston|atlanta|dallas|houston|philadelphia|seattle|portland|denver|detroit|phoenix)\b/i,
  ],
  [
    "entertainment",
    /\b(adult swim|tbs|tnt|usa network|fx|fxx|syfy|comedy central|comedy|paramount|amc|bet|a&e|ae|freeform|ion|tv ?land|nick at nite|pop|cozi|metv|antenna|grit|charge|court ?tv|game show|gsn|buzzr|e! entertainment|entertainment|series|sitcom|drama)\b/i,
  ],
];

/** Provider tags that say nothing about the channel ("USA |", "UK:", "[HD]"). */
const TAGS =
  /^(?:\s*(?:usa?|uk|ca|can|au|ie|nz)(?:\s*[|:-]|\s+(?!network\b))\s*)+|\s*[[(]?\b(?:uhd|fhd|hd|sd|4k|hevc|h265|backup|east|west|\d{3,4}p)\b[\])]?/gi;

/** The channel's name without the provider's tags, for display and as the brand fallback. */
export function cleanChannelName(name: string): string {
  return name.replace(TAGS, " ").replace(/\s+/g, " ").trim() || name.trim();
}

/** The genre the rules give a channel, or null when the name and group don't say. */
export function genreByRules(name: string, group?: string | null): LiveLabel | null {
  const clean = cleanChannelName(name);
  // The name decides first: a "USA Entertainment" group holds news channels too.
  for (const [genre, re] of RULES) if (re.test(clean)) return { genre, by: "rules" };
  const g = group?.trim();
  if (g) for (const [genre, re] of RULES) if (re.test(g)) return { genre, by: "rules" };
  return null;
}
