import { safeFetch } from "../../safe-fetch";

/**
 * Hall of Fame legends for Teams & Players, by league, as Wikipedia article titles. Each card
 * reads its story (summary and photo) from Wikipedia's page summary.
 */
export const HALL_OF_FAME: Record<string, { hall: string; legends: string[] }> = {
  NFL: {
    hall: "Pro Football Hall of Fame",
    legends: [
      "Jerry Rice",
      "Jim Brown",
      "Walter Payton",
      "Joe Montana",
      "Lawrence Taylor",
      "Barry Sanders",
      "Peyton Manning",
      "Reggie White",
      "Johnny Unitas",
      "Deion Sanders",
    ],
  },
  NBA: {
    hall: "Naismith Basketball Hall of Fame",
    legends: [
      "Michael Jordan",
      "Kareem Abdul-Jabbar",
      "Magic Johnson",
      "Larry Bird",
      "Bill Russell",
      "Wilt Chamberlain",
      "Kobe Bryant",
      "Tim Duncan",
      "Shaquille O'Neal",
      "Hakeem Olajuwon",
    ],
  },
  NCAAF: {
    hall: "College Football Hall of Fame",
    legends: [
      "Archie Griffin",
      "Herschel Walker",
      "Doug Flutie",
      "Bo Jackson",
      "Tim Tebow",
      "Charles Woodson",
      "Tony Dorsett",
      "Earl Campbell",
    ],
  },
  NCAAB: {
    hall: "National Collegiate Basketball Hall of Fame",
    legends: [
      "John Wooden",
      "Pete Maravich",
      "Bill Walton",
      "Christian Laettner",
      "Mike Krzyzewski",
      "Dean Smith",
      "Oscar Robertson",
      "Jerry West",
    ],
  },
  MLB: {
    hall: "National Baseball Hall of Fame",
    legends: [
      "Babe Ruth",
      "Hank Aaron",
      "Willie Mays",
      "Jackie Robinson",
      "Ted Williams",
      "Lou Gehrig",
      "Roberto Clemente",
      "Ken Griffey Jr.",
      "Derek Jeter",
      "Mariano Rivera",
    ],
  },
  NHL: {
    hall: "Hockey Hall of Fame",
    legends: [
      "Wayne Gretzky",
      "Mario Lemieux",
      "Gordie Howe",
      "Bobby Orr",
      "Maurice Richard",
      "Jean Béliveau",
      "Mark Messier",
      "Patrick Roy",
      "Steve Yzerman",
      "Martin Brodeur",
    ],
  },
  soccer: {
    hall: "Soccer legends",
    legends: [
      "Pelé",
      "Diego Maradona",
      "Johan Cruyff",
      "Franz Beckenbauer",
      "Zinedine Zidane",
      "Ronaldo (Brazilian footballer)",
      "Mia Hamm",
      "Thierry Henry",
    ],
  },
};

export type LegendStory = {
  title: string;
  name: string;
  description: string | null;
  extract: string;
  image: string | null;
  url: string;
};

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Wikipedia's page summary as a legend's story; null when the page is missing or a stub. */
export function parseLegendSummary(title: string, doc: unknown): LegendStory | null {
  const d = rec(doc);
  const extract = str(d.extract);
  if (!extract || d.type === "disambiguation") return null;
  const image = str(rec(d.originalimage).source) ?? str(rec(d.thumbnail).source);
  return {
    title,
    name: str(d.title) ?? title,
    description: str(d.description),
    extract,
    image: image && image.startsWith("https://") ? image : null,
    url:
      str(rec(rec(d.content_urls).desktop).page) ??
      `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
  };
}

const stories = new Map<string, Promise<LegendStory | null>>();

export function fetchLegendStory(title: string): Promise<LegendStory | null> {
  let p = stories.get(title);
  if (!p) {
    p = safeFetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    )
      .then(async (res) => (res.ok ? parseLegendSummary(title, await res.json()) : null))
      .catch(() => null);
    stories.set(title, p);
  }
  return p;
}

/** The Hall of Fame list for a league key, with soccer leagues sharing one list. */
export function hallFor(leagueKey: string, group: string): (typeof HALL_OF_FAME)[string] | null {
  return HALL_OF_FAME[leagueKey] ?? (group === "soccer" ? HALL_OF_FAME.soccer : null);
}
