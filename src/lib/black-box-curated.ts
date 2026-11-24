/**
 * The Black Box's hand-picked collections, beside its catalog of every Black-led title. Titles are
 * matched on TMDB by exact name (and, for films, year) on the device; one TMDB doesn't know drops
 * out instead of showing something else.
 *
 * 90s classics: the films the published round-ups agree on (Complex's "25 Best Black Movies of the
 * '90s", The Cinemaholic, The Root's "Black Cult Classics of the 1990s", the Defender's top 12,
 * ThatSister's 45) and other Black-led films of the decade.
 * 2000s: CinemaBlend's "Quintessential Black Movies of the 2000s", Ranker's 2000s list and the
 * Spokesman-Recorder's list by decade. 2010s: Essence's 20 best of the decade, Shadow and Act's top
 * 60, The Cinemaholic and Wikipedia's list of Black films of the 2010s. 2020s: a Letterboxd ranking
 * of 2020s Black films, The Root's best since 2000, BET Best Movie nominees and Digital Trends.
 * New in 2026: The Root's and MadameNoire's 2026 film watchlists, and The Root's and TheGrio's
 * 2026 Black TV round-ups.
 */

export type CuratedTitle = { title: string; year?: number };

export const CLASSICS_90S: readonly CuratedTitle[] = [
  { title: "Boyz n the Hood", year: 1991 },
  { title: "Friday", year: 1995 },
  { title: "Menace II Society", year: 1993 },
  { title: "Juice", year: 1992 },
  { title: "Malcolm X", year: 1992 },
  { title: "Set It Off", year: 1996 },
  { title: "Waiting to Exhale", year: 1995 },
  { title: "The Best Man", year: 1999 },
  { title: "Love Jones", year: 1997 },
  { title: "Soul Food", year: 1997 },
  { title: "Poetic Justice", year: 1993 },
  { title: "Boomerang", year: 1992 },
  { title: "New Jack City", year: 1991 },
  { title: "House Party", year: 1990 },
  { title: "Higher Learning", year: 1995 },
  { title: "White Men Can't Jump", year: 1992 },
  { title: "Hangin' with the Homeboys", year: 1991 },
  { title: "Eve's Bayou", year: 1997 },
  { title: "Belly", year: 1998 },
  { title: "The Players Club", year: 1998 },
  { title: "How Stella Got Her Groove Back", year: 1998 },
  { title: "Above the Rim", year: 1994 },
  { title: "Dead Presidents", year: 1995 },
  { title: "Bad Boys", year: 1995 },
  { title: "Jungle Fever", year: 1991 },
  { title: "Daughters of the Dust", year: 1991 },
  { title: "A Low Down Dirty Shame", year: 1994 },
  { title: "Life", year: 1999 },
  { title: "The Nutty Professor", year: 1996 },
  { title: "Booty Call", year: 1997 },
  { title: "Hoodlum", year: 1997 },
  { title: "Jason's Lyric", year: 1994 },
  { title: "Crooklyn", year: 1994 },
  { title: "Rosewood", year: 1997 },
  { title: "What's Love Got to Do with It", year: 1993 },
  { title: "Sister Act", year: 1992 },
  { title: "Don't Be a Menace to South Central While Drinking Your Juice in the Hood", year: 1996 },
  { title: "I Got the Hook Up", year: 1998 },
  { title: "The Wood", year: 1999 },
  { title: "Fresh", year: 1994 },
  { title: "Clockers", year: 1995 },
  { title: "He Got Game", year: 1998 },
  { title: "Get on the Bus", year: 1996 },
  { title: "A Thin Line Between Love and Hate", year: 1996 },
  { title: "The Five Heartbeats", year: 1991 },
  { title: "CB4", year: 1993 },
  { title: "Mo' Money", year: 1992 },
  { title: "Deep Cover", year: 1992 },
  { title: "Sugar Hill", year: 1993 },
  { title: "Tales from the Hood", year: 1995 },
  { title: "The Inkwell", year: 1994 },
  { title: "Panther", year: 1995 },
  { title: "Sprung", year: 1997 },
];

export const DECADE_2000S: readonly CuratedTitle[] = [
  { title: "Love & Basketball", year: 2000 },
  { title: "Antwone Fisher", year: 2002 },
  { title: "Drumline", year: 2002 },
  { title: "Barbershop", year: 2002 },
  { title: "Brown Sugar", year: 2002 },
  { title: "Training Day", year: 2001 },
  { title: "Ali", year: 2001 },
  { title: "Baby Boy", year: 2001 },
  { title: "Next Friday", year: 2000 },
  { title: "Friday After Next", year: 2002 },
  { title: "Save the Last Dance", year: 2001 },
  { title: "Two Can Play That Game", year: 2001 },
  { title: "Paid in Full", year: 2002 },
  { title: "Undercover Brother", year: 2002 },
  { title: "Bad Boys II", year: 2003 },
  { title: "Biker Boyz", year: 2003 },
  { title: "Deliver Us from Eva", year: 2003 },
  { title: "The Fighting Temptations", year: 2003 },
  { title: "Love Don't Cost a Thing", year: 2003 },
  { title: "Ray", year: 2004 },
  { title: "Hotel Rwanda", year: 2004 },
  { title: "Johnson Family Vacation", year: 2004 },
  { title: "You Got Served", year: 2004 },
  { title: "Hustle & Flow", year: 2005 },
  { title: "Diary of a Mad Black Woman", year: 2005 },
  { title: "Coach Carter", year: 2005 },
  { title: "Beauty Shop", year: 2005 },
  { title: "Akeelah and the Bee", year: 2006 },
  { title: "Dreamgirls", year: 2006 },
  { title: "ATL", year: 2006 },
  { title: "The Pursuit of Happyness", year: 2006 },
  { title: "Madea's Family Reunion", year: 2006 },
  { title: "Stomp the Yard", year: 2007 },
  { title: "The Great Debaters", year: 2007 },
  { title: "American Gangster", year: 2007 },
  { title: "Why Did I Get Married?", year: 2007 },
  { title: "This Christmas", year: 2007 },
  { title: "Talk to Me", year: 2007 },
  { title: "Pride", year: 2007 },
  { title: "Daddy's Little Girls", year: 2007 },
  { title: "Cadillac Records", year: 2008 },
  { title: "The Secret Life of Bees", year: 2008 },
  { title: "Precious", year: 2009 },
  { title: "Notorious", year: 2009 },
  { title: "Obsessed", year: 2009 },
];

export const DECADE_2010S: readonly CuratedTitle[] = [
  { title: "Get Out", year: 2017 },
  { title: "Moonlight", year: 2016 },
  { title: "Black Panther", year: 2018 },
  { title: "Pariah", year: 2011 },
  { title: "Mudbound", year: 2017 },
  { title: "If Beale Street Could Talk", year: 2018 },
  { title: "Beyond the Lights", year: 2014 },
  { title: "Selma", year: 2014 },
  { title: "Fruitvale Station", year: 2013 },
  { title: "12 Years a Slave", year: 2013 },
  { title: "Straight Outta Compton", year: 2015 },
  { title: "Creed", year: 2015 },
  { title: "Hidden Figures", year: 2016 },
  { title: "Fences", year: 2016 },
  { title: "Girls Trip", year: 2017 },
  { title: "Dope", year: 2015 },
  { title: "Dear White People", year: 2014 },
  { title: "Think Like a Man", year: 2012 },
  { title: "The Best Man Holiday", year: 2013 },
  { title: "Jumping the Broom", year: 2011 },
  { title: "The Hate U Give", year: 2018 },
  { title: "BlacKkKlansman", year: 2018 },
  { title: "Sorry to Bother You", year: 2018 },
  { title: "Us", year: 2019 },
  { title: "Harriet", year: 2019 },
  { title: "Just Mercy", year: 2019 },
  { title: "Queen & Slim", year: 2019 },
  { title: "Waves", year: 2019 },
  { title: "Dolemite Is My Name", year: 2019 },
  { title: "The Last Black Man in San Francisco", year: 2019 },
  { title: "Detroit", year: 2017 },
  { title: "Widows", year: 2018 },
  { title: "The Equalizer", year: 2014 },
  { title: "20 Feet from Stardom", year: 2013 },
  { title: "Sparkle", year: 2012 },
  { title: "Ride Along", year: 2014 },
  { title: "Barbershop: The Next Cut", year: 2016 },
  { title: "Night School", year: 2018 },
  { title: "Little", year: 2019 },
  { title: "Black Nativity", year: 2013 },
];

export const DECADE_2020S: readonly CuratedTitle[] = [
  { title: "Sinners", year: 2025 },
  { title: "Judas and the Black Messiah", year: 2021 },
  { title: "American Fiction", year: 2023 },
  { title: "The Woman King", year: 2022 },
  { title: "Nope", year: 2022 },
  { title: "Black Panther: Wakanda Forever", year: 2022 },
  { title: "Da 5 Bloods", year: 2020 },
  { title: "Ma Rainey's Black Bottom", year: 2020 },
  { title: "King Richard", year: 2021 },
  { title: "They Cloned Tyrone", year: 2023 },
  { title: "One of Them Days", year: 2025 },
  { title: "The Six Triple Eight", year: 2024 },
  { title: "Rustin", year: 2023 },
  { title: "The Color Purple", year: 2023 },
  { title: "The Piano Lesson", year: 2024 },
  { title: "Bob Marley: One Love", year: 2024 },
  { title: "Creed III", year: 2023 },
  { title: "Till", year: 2022 },
  { title: "The Harder They Fall", year: 2021 },
  { title: "Candyman", year: 2021 },
  { title: "Respect", year: 2021 },
  { title: "Coming 2 America", year: 2021 },
  { title: "Nickel Boys", year: 2024 },
  { title: "Origin", year: 2023 },
  { title: "Bad Boys for Life", year: 2020 },
  { title: "Bad Boys: Ride or Die", year: 2024 },
  { title: "Soul", year: 2020 },
  { title: "Lovers Rock", year: 2020 },
  { title: "Zola", year: 2020 },
  { title: "Charm City Kings", year: 2020 },
  { title: "The Photograph", year: 2020 },
  { title: "The Book of Clarence", year: 2024 },
  { title: "Exhibiting Forgiveness", year: 2024 },
];

export const NEW_2026_MOVIES: readonly CuratedTitle[] = [
  { title: "Michael", year: 2026 },
  { title: "Your Mother, Your Mother, Your Mother", year: 2026 },
  { title: "Misty Green", year: 2026 },
  { title: "If I Go Will They Miss Me", year: 2026 },
  { title: "They Will Kill You", year: 2026 },
  { title: "Stop! That! Train!", year: 2026 },
  { title: "Don't Ever Wonder", year: 2026 },
  { title: "The Dutchman", year: 2026 },
  { title: "I Love Boosters", year: 2026 },
  { title: "Strung", year: 2026 },
];

/** Shows new or returning in 2026; matched by name only, since many began in earlier years. */
export const NEW_2026_SHOWS: readonly CuratedTitle[] = [
  { title: "A Different World" },
  { title: "His & Hers" },
  { title: "Beauty in Black" },
  { title: "Wonder Man" },
  { title: "Hijack" },
  { title: "Cross" },
  { title: "Paradise" },
  { title: "The 'Burbs" },
  { title: "The Boroughs" },
  { title: "Man on Fire" },
  { title: "Fightland" },
  { title: "S.W.A.T. Exiles" },
];

type Hit = {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  popularity?: number;
};

const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

/**
 * The TMDB search hit a curated title means: the same name, and for a title with a year, released
 * within a year of it (festival and wide release often fall in different years); the best known
 * when several remain. Null when none matches.
 */
export function pickCurated<T extends Hit>(want: CuratedTitle, hits: readonly T[]): T | null {
  const name = key(want.title);
  const same = hits.filter((h) => {
    if (key(h.title ?? h.name ?? "") !== name) return false;
    if (!want.year) return true;
    const year = Number((h.release_date ?? h.first_air_date ?? "").slice(0, 4));
    return Number.isFinite(year) && Math.abs(year - want.year) <= 1;
  });
  if (same.length === 0) return null;
  return [...same].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0];
}
