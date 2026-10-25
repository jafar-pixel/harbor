/**
 * "What type of ___ do you listen to?": the styles a listener picks per genre, each with a few
 * key artists that seed the AI DJ and vibes. Plain data, no I/O. Picks are saved as
 * "<genre>/<style>" ids in the `musicStyles` setting (synced with the JL profile).
 */

export type MusicStyle = { id: string; name: string; artists: readonly string[] };
export type StyleGenre = {
  id: string;
  name: string;
  question: string;
  styles: readonly MusicStyle[];
};

export const STYLE_GENRES: readonly StyleGenre[] = [
  {
    id: "hip-hop",
    name: "Hip-Hop",
    question: "What type of Hip-Hop do you listen to?",
    styles: [
      {
        id: "boom-bap",
        name: "Boom Bap / 90s East Coast",
        artists: ["Nas", "The Notorious B.I.G.", "Wu-Tang Clan", "Mobb Deep", "Gang Starr"],
      },
      {
        id: "west-coast",
        name: "West Coast / G-Funk",
        artists: ["Dr. Dre", "Snoop Dogg", "2Pac", "Ice Cube", "Warren G"],
      },
      {
        id: "southern",
        name: "Southern / Dirty South",
        artists: ["OutKast", "UGK", "T.I.", "Ludacris", "Goodie Mob"],
      },
      {
        id: "trap",
        name: "Trap",
        artists: ["Future", "Young Thug", "Migos", "21 Savage", "Gucci Mane"],
      },
      {
        id: "drill",
        name: "Drill",
        artists: ["Chief Keef", "Pop Smoke", "King Von", "Lil Durk", "Central Cee"],
      },
      {
        id: "conscious",
        name: "Conscious / Lyrical",
        artists: ["Kendrick Lamar", "J. Cole", "Common", "Mos Def", "Talib Kweli"],
      },
      {
        id: "jazz-rap",
        name: "Jazz Rap",
        artists: ["A Tribe Called Quest", "De La Soul", "Digable Planets", "Guru", "The Roots"],
      },
      {
        id: "alternative",
        name: "Alternative",
        artists: ["Tyler, the Creator", "Childish Gambino", "Kid Cudi", "N.E.R.D", "Danny Brown"],
      },
      {
        id: "underground",
        name: "Underground",
        artists: ["MF DOOM", "Madlib", "Aesop Rock", "Atmosphere", "Freddie Gibbs"],
      },
      {
        id: "old-school",
        name: "Old School",
        artists: ["Run-DMC", "LL Cool J", "Grandmaster Flash", "Eric B. & Rakim", "Big Daddy Kane"],
      },
      {
        id: "rnb-hip-hop",
        name: "R&B / Hip-Hop",
        artists: ["Mary J. Blige", "Missy Elliott", "Lauryn Hill", "Bryson Tiller", "Drake"],
      },
      {
        id: "afro-crossover",
        name: "Afrobeats crossover",
        artists: ["Burna Boy", "Wizkid", "Davido", "Rema", "Tems"],
      },
      {
        id: "gospel-rap",
        name: "Gospel Rap",
        artists: ["Lecrae", "NF", "Andy Mineo", "KB", "Trip Lee"],
      },
    ],
  },
  {
    id: "jazz",
    name: "Jazz",
    question: "What type of Jazz do you listen to?",
    styles: [
      {
        id: "smooth",
        name: "Smooth Jazz",
        artists: ["Kenny G", "George Benson", "Grover Washington Jr.", "Dave Koz", "Boney James"],
      },
      {
        id: "bebop",
        name: "Bebop",
        artists: [
          "Charlie Parker",
          "Dizzy Gillespie",
          "Thelonious Monk",
          "Bud Powell",
          "Max Roach",
        ],
      },
      {
        id: "cool",
        name: "Cool Jazz",
        artists: ["Miles Davis", "Chet Baker", "Dave Brubeck", "Stan Getz", "Gerry Mulligan"],
      },
      {
        id: "hard-bop",
        name: "Hard Bop",
        artists: [
          "Art Blakey",
          "Horace Silver",
          "Lee Morgan",
          "Cannonball Adderley",
          "Clifford Brown",
        ],
      },
      {
        id: "fusion",
        name: "Jazz Fusion",
        artists: [
          "Weather Report",
          "Herbie Hancock",
          "Return to Forever",
          "Mahavishnu Orchestra",
          "Pat Metheny",
        ],
      },
      {
        id: "latin",
        name: "Latin Jazz",
        artists: [
          "Tito Puente",
          "Poncho Sanchez",
          "Arturo Sandoval",
          "Mongo Santamaría",
          "Chucho Valdés",
        ],
      },
      {
        id: "big-band",
        name: "Big Band / Swing",
        artists: ["Duke Ellington", "Count Basie", "Benny Goodman", "Glenn Miller", "Cab Calloway"],
      },
      {
        id: "vocal",
        name: "Vocal Jazz",
        artists: [
          "Ella Fitzgerald",
          "Billie Holiday",
          "Sarah Vaughan",
          "Nat King Cole",
          "Diana Krall",
        ],
      },
      {
        id: "soul-jazz",
        name: "Soul Jazz",
        artists: ["Jimmy Smith", "Lou Donaldson", "Ramsey Lewis", "Les McCann", "Grant Green"],
      },
      {
        id: "contemporary",
        name: "Contemporary / Nu Jazz",
        artists: [
          "Kamasi Washington",
          "Robert Glasper",
          "Esperanza Spalding",
          "Snarky Puppy",
          "BADBADNOTGOOD",
        ],
      },
      {
        id: "acid",
        name: "Acid Jazz",
        artists: ["Jamiroquai", "Brand New Heavies", "Incognito", "US3", "Galliano"],
      },
      {
        id: "jazz-funk",
        name: "Jazz-Funk",
        artists: [
          "Roy Ayers",
          "Donald Byrd",
          "The Crusaders",
          "Lonnie Liston Smith",
          "Ronnie Laws",
        ],
      },
    ],
  },
  {
    id: "rock",
    name: "Rock",
    question: "What type of Rock do you listen to?",
    styles: [
      {
        id: "classic",
        name: "Classic Rock",
        artists: ["Led Zeppelin", "The Rolling Stones", "The Who", "Queen", "Jimi Hendrix"],
      },
      {
        id: "hard",
        name: "Hard Rock",
        artists: ["AC/DC", "Guns N' Roses", "Aerosmith", "Van Halen", "Deep Purple"],
      },
      {
        id: "southern",
        name: "Southern Rock",
        artists: [
          "Lynyrd Skynyrd",
          "The Allman Brothers Band",
          "ZZ Top",
          "Molly Hatchet",
          "The Marshall Tucker Band",
        ],
      },
      {
        id: "alternative",
        name: "Alternative",
        artists: [
          "R.E.M.",
          "Red Hot Chili Peppers",
          "Foo Fighters",
          "Radiohead",
          "The Smashing Pumpkins",
        ],
      },
      {
        id: "grunge",
        name: "Grunge",
        artists: ["Nirvana", "Pearl Jam", "Soundgarden", "Alice in Chains", "Stone Temple Pilots"],
      },
      {
        id: "indie",
        name: "Indie Rock",
        artists: ["Arctic Monkeys", "The Strokes", "Vampire Weekend", "The Killers", "Arcade Fire"],
      },
      {
        id: "punk",
        name: "Punk",
        artists: ["Ramones", "The Clash", "Green Day", "Sex Pistols", "Bad Brains"],
      },
      {
        id: "metal",
        name: "Metal",
        artists: ["Metallica", "Black Sabbath", "Iron Maiden", "Slayer", "Living Colour"],
      },
      {
        id: "prog",
        name: "Prog Rock",
        artists: ["Pink Floyd", "Rush", "Yes", "Genesis", "King Crimson"],
      },
      {
        id: "blues-rock",
        name: "Blues Rock",
        artists: [
          "Stevie Ray Vaughan",
          "Eric Clapton",
          "The Black Keys",
          "Gary Clark Jr.",
          "Cream",
        ],
      },
      {
        id: "soft",
        name: "Soft Rock",
        artists: ["Fleetwood Mac", "Eagles", "Steely Dan", "Toto", "Hall & Oates"],
      },
      {
        id: "rock-n-roll",
        name: "Rock 'n' Roll (50s–60s)",
        artists: ["Chuck Berry", "Little Richard", "Elvis Presley", "Fats Domino", "Bo Diddley"],
      },
    ],
  },
  {
    id: "gospel",
    name: "Gospel",
    question: "What type of Gospel do you listen to?",
    styles: [
      {
        id: "traditional",
        name: "Traditional Gospel",
        artists: [
          "Mahalia Jackson",
          "Shirley Caesar",
          "James Cleveland",
          "Albertina Walker",
          "The Clark Sisters",
        ],
      },
      {
        id: "contemporary",
        name: "Contemporary Gospel",
        artists: [
          "Kirk Franklin",
          "Marvin Sapp",
          "Yolanda Adams",
          "Fred Hammond",
          "Tasha Cobbs Leonard",
        ],
      },
      {
        id: "praise-worship",
        name: "Praise & Worship",
        artists: [
          "Israel Houghton",
          "William McDowell",
          "Maverick City Music",
          "Travis Greene",
          "Elevation Worship",
        ],
      },
      {
        id: "choir",
        name: "Gospel Choir",
        artists: [
          "Hezekiah Walker",
          "The Brooklyn Tabernacle Choir",
          "Mississippi Mass Choir",
          "Ricky Dillard",
          "Walter Hawkins",
        ],
      },
      {
        id: "southern",
        name: "Southern Gospel",
        artists: [
          "The Gaither Vocal Band",
          "The Isaacs",
          "The Booth Brothers",
          "Ernie Haase & Signature Sound",
          "The Hoppers",
        ],
      },
      {
        id: "quartet",
        name: "Quartet",
        artists: [
          "The Mighty Clouds of Joy",
          "The Canton Spirituals",
          "The Williams Brothers",
          "The Blind Boys of Alabama",
          "The Pilgrim Jubilees",
        ],
      },
      {
        id: "christian-hip-hop",
        name: "Christian Hip-Hop / Gospel Rap",
        artists: ["Lecrae", "Andy Mineo", "KB", "Tedashii", "Social Club Misfits"],
      },
      {
        id: "gospel-jazz",
        name: "Gospel Jazz",
        artists: ["Ben Tankard", "Kirk Whalum", "Norman Brown", "Najee", "Angella Christie"],
      },
      {
        id: "urban-contemporary",
        name: "Urban Contemporary",
        artists: ["Mary Mary", "Tamela Mann", "Jonathan McReynolds", "Tye Tribbett", "CeCe Winans"],
      },
      {
        id: "holy-hip-hop",
        name: "Holy Hip-Hop",
        artists: ["Cross Movement", "Da' T.R.U.T.H.", "Flame", "Trip Lee", "Canton Jones"],
      },
    ],
  },
  {
    id: "reggae",
    name: "Reggae",
    question: "What type of Reggae do you listen to?",
    styles: [
      {
        id: "roots",
        name: "Roots Reggae",
        artists: [
          "Bob Marley & The Wailers",
          "Burning Spear",
          "Steel Pulse",
          "Peter Tosh",
          "Culture",
        ],
      },
      {
        id: "lovers-rock",
        name: "Lovers Rock",
        artists: ["Gregory Isaacs", "Beres Hammond", "Dennis Brown", "Janet Kay", "Maxi Priest"],
      },
      {
        id: "dancehall",
        name: "Dancehall",
        artists: ["Shabba Ranks", "Beenie Man", "Vybz Kartel", "Popcaan", "Shenseea"],
      },
      {
        id: "dub",
        name: "Dub",
        artists: [
          "King Tubby",
          'Lee "Scratch" Perry',
          "Scientist",
          "Augustus Pablo",
          "Mad Professor",
        ],
      },
      {
        id: "ska",
        name: "Ska",
        artists: [
          "The Skatalites",
          "Desmond Dekker",
          "Prince Buster",
          "Toots and the Maytals",
          "The Specials",
        ],
      },
      {
        id: "rocksteady",
        name: "Rocksteady",
        artists: ["Alton Ellis", "The Paragons", "Ken Boothe", "The Techniques", "Phyllis Dillon"],
      },
      {
        id: "fusion",
        name: "Reggae Fusion",
        artists: ["Shaggy", "Sean Paul", "Damian Marley", "UB40", "Rebelution"],
      },
      {
        id: "island",
        name: "Island Reggae / Hawaiian Reggae",
        artists: ["J Boog", "Common Kings", "Fiji", "Katchafire", "Kolohe Kai"],
      },
      {
        id: "conscious",
        name: "Conscious Reggae",
        artists: ["Chronixx", "Protoje", "Sizzla", "Luciano", "Jah Cure"],
      },
      {
        id: "reggaeton",
        name: "Reggaeton",
        artists: ["Daddy Yankee", "Bad Bunny", "J Balvin", "Don Omar", "Karol G"],
      },
    ],
  },
  {
    id: "international",
    name: "International",
    question: "What type of international music do you listen to?",
    styles: [
      {
        id: "afrobeats",
        name: "Afrobeats",
        artists: ["Burna Boy", "Wizkid", "Davido", "Asake", "Tems"],
      },
      {
        id: "amapiano",
        name: "Amapiano",
        artists: ["Kabza De Small", "DJ Maphorisa", "Uncle Waffles", "Focalistic", "Tyler ICU"],
      },
      {
        id: "highlife",
        name: "Highlife",
        artists: ["Fela Kuti", "Osibisa", "E.T. Mensah", "Prince Nico Mbarga", "Amakye Dede"],
      },
      {
        id: "latin-pop",
        name: "Latin Pop",
        artists: ["Shakira", "Ricky Martin", "Marc Anthony", "Rosalía", "Juanes"],
      },
      {
        id: "salsa-bachata",
        name: "Salsa / Bachata",
        artists: ["Celia Cruz", "Héctor Lavoe", "Romeo Santos", "Aventura", "Prince Royce"],
      },
      {
        id: "bossa-nova",
        name: "Bossa Nova / MPB",
        artists: [
          "João Gilberto",
          "Antônio Carlos Jobim",
          "Astrud Gilberto",
          "Caetano Veloso",
          "Gilberto Gil",
        ],
      },
      {
        id: "k-pop",
        name: "K-Pop",
        artists: ["BTS", "BLACKPINK", "Stray Kids", "TWICE", "NewJeans"],
      },
      {
        id: "j-pop",
        name: "J-Pop",
        artists: ["Hikaru Utada", "YOASOBI", "Kenshi Yonezu", "Ado", "Perfume"],
      },
      {
        id: "bollywood",
        name: "Bollywood",
        artists: [
          "Arijit Singh",
          "A. R. Rahman",
          "Shreya Ghoshal",
          "Lata Mangeshkar",
          "Kishore Kumar",
        ],
      },
      {
        id: "arabic-pop",
        name: "Arabic Pop",
        artists: ["Amr Diab", "Nancy Ajram", "Fairuz", "Elissa", "Mohamed Hamaki"],
      },
      {
        id: "french-pop",
        name: "French Pop",
        artists: ["Stromae", "Édith Piaf", "Aya Nakamura", "Indila", "Christine and the Queens"],
      },
      {
        id: "soca",
        name: "Caribbean Soca",
        artists: ["Machel Montano", "Bunji Garlin", "Destra Garcia", "Kes", "Patrice Roberts"],
      },
      {
        id: "hawaiian",
        name: "Hawaiian",
        artists: ["Israel Kamakawiwoʻole", "Keali'i Reichel", "Gabby Pahinui", "Hapa", "Makana"],
      },
    ],
  },
];

export const STYLE_ID = /^[a-z0-9-]{1,40}\/(?:x-)?[a-z0-9-]{1,48}$/;

export const styleKey = (genre: string, style: string) => `${genre}/${style}`;

/** A custom style typed under "Something else…": "Jazz" + "Gypsy jazz" → "jazz/x-gypsy-jazz". */
export function customStyleKey(genre: string, text: string): string | null {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 46);
  return slug && STYLE_GENRES.some((g) => g.id === genre) ? `${genre}/x-${slug}` : null;
}

export type ResolvedStyle = {
  key: string;
  genre: StyleGenre;
  /** Null for a style the listener typed themselves. */
  style: MusicStyle | null;
  name: string;
};

/** The listener's saved style ids, resolved; unknown ids are dropped. */
export function resolveStyles(keys: readonly string[]): ResolvedStyle[] {
  const out: ResolvedStyle[] = [];
  for (const key of keys) {
    if (!STYLE_ID.test(key)) continue;
    const [genreId, styleId] = key.split("/");
    const genre = STYLE_GENRES.find((g) => g.id === genreId);
    if (!genre) continue;
    if (styleId.startsWith("x-")) {
      const name = styleId.slice(2).replace(/-/g, " ");
      out.push({ key, genre, style: null, name: name.replace(/\b\w/g, (c) => c.toUpperCase()) });
      continue;
    }
    const style = genre.styles.find((s) => s.id === styleId);
    if (style) out.push({ key, genre, style, name: style.name });
  }
  return out;
}

/**
 * Seed artists for the AI DJ: the first artists of each picked style, interleaved across
 * styles so one style doesn't take every slot.
 */
export function seedArtists(keys: readonly string[], max = 30): string[] {
  const lists = resolveStyles(keys)
    .map((r) => r.style?.artists ?? [])
    .filter((l) => l.length);
  const out: string[] = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const name = list[i];
      if (name && !out.includes(name)) out.push(name);
      if (out.length >= max) break;
    }
  }
  return out;
}
