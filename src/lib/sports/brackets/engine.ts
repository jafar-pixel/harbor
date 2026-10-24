/**
 * Playoff brackets: every supported format as data, plus how picks and results move teams
 * through it. Entrants are keyed by region and seed ("AFC:1", "South:16a"), so a bracket is
 * defined before the field is known and a pool's field fills in the teams later. Plain module
 * so the formats and scoring are tested.
 */

export type TournamentKind = "cfp" | "nfl" | "nba" | "mlb" | "ncaam" | "ncaaw";

/** A team's place in the field: region (conference, league or March Madness region) and seed. */
export type EntrantKey = string;

export type Source =
  | { kind: "seed"; key: EntrantKey }
  | { kind: "winner"; of: string }
  /**
   * NFL divisional round: the conference's top seed plays the lowest remaining seed, the other
   * two wild-card winners play each other. `pos` 0/1 is that first game, 2/3 the second.
   */
  | { kind: "reseed"; region: string; bye: EntrantKey; from: string[]; pos: 0 | 1 | 2 | 3 };

export type Matchup = { id: string; round: number; region?: string; a: Source; b: Source };
export type Round = { name: string; points: number };

export type Tournament = {
  kind: TournamentKind;
  name: string;
  regions: string[];
  rounds: Round[];
  matchups: Matchup[];
  /** Every entrant key the field must fill (play-in pairs included). */
  entrants: EntrantKey[];
};

/** matchup id -> winning entrant key. Picks and real results share the shape. */
export type Winners = Record<string, EntrantKey>;

export const seedOf = (key: EntrantKey): number => Number(/:(\d+)/.exec(key)?.[1] ?? 99);
export const regionOf = (key: EntrantKey): string => key.split(":")[0];
const key = (region: string, seed: number, suffix = "") => `${region}:${seed}${suffix}`;
const seed = (k: EntrantKey): Source => ({ kind: "seed", key: k });
const win = (of: string): Source => ({ kind: "winner", of });

/** One region's single-elimination pairings, top seed against bottom ("1v8, 4v5, 3v6, 2v7"). */
const ORDER_8 = [
  [1, 8],
  [4, 5],
  [3, 6],
  [2, 7],
];
const ORDER_16 = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
];

/** Builds the rounds that pair winners of consecutive games until one remains. */
function knockout(
  first: string[],
  rounds: number[],
  prefix: string,
  region: string | undefined,
  out: Matchup[],
): string {
  let ids = first;
  for (const round of rounds) {
    const next: string[] = [];
    for (let i = 0; i < ids.length; i += 2) {
      const id = `${prefix}r${round}m${i / 2 + 1}`;
      out.push({ id, round, region, a: win(ids[i]), b: win(ids[i + 1]) });
      next.push(id);
    }
    ids = next;
  }
  return ids[0];
}

function cfp(): Tournament {
  const R = "CFP";
  const m: Matchup[] = [];
  // First round on campus: 5v12, 8v9, 6v11, 7v10; seeds 1-4 have byes into the quarterfinals.
  const first = [
    [5, 12],
    [8, 9],
    [6, 11],
    [7, 10],
  ];
  first.forEach(([a, b], i) =>
    m.push({ id: `r1m${i + 1}`, round: 1, a: seed(key(R, a)), b: seed(key(R, b)) }),
  );
  // Quarterfinals: 4 vs 5/12, 1 vs 8/9, 3 vs 6/11, 2 vs 7/10; semis pair them in order.
  const byes = [4, 1, 3, 2];
  byes.forEach((s, i) =>
    m.push({ id: `r2m${i + 1}`, round: 2, a: seed(key(R, s)), b: win(`r1m${i + 1}`) }),
  );
  knockout(["r2m1", "r2m2", "r2m3", "r2m4"], [3, 4], "", undefined, m);
  return {
    kind: "cfp",
    name: "College Football Playoff",
    regions: [R],
    rounds: [
      { name: "First Round", points: 10 },
      { name: "Quarterfinals", points: 20 },
      { name: "Semifinals", points: 40 },
      { name: "National Championship", points: 80 },
    ],
    matchups: m,
    entrants: Array.from({ length: 12 }, (_, i) => key(R, i + 1)),
  };
}

function nfl(): Tournament {
  const m: Matchup[] = [];
  const champs: string[] = [];
  for (const conf of ["AFC", "NFC"]) {
    const wc = [
      [2, 7],
      [3, 6],
      [4, 5],
    ].map(([a, b], i) => {
      const id = `${conf}-r1m${i + 1}`;
      m.push({ id, round: 1, region: conf, a: seed(key(conf, a)), b: seed(key(conf, b)) });
      return id;
    });
    const re = (pos: 0 | 1 | 2 | 3): Source => ({
      kind: "reseed",
      region: conf,
      bye: key(conf, 1),
      from: wc,
      pos,
    });
    m.push({ id: `${conf}-r2m1`, round: 2, region: conf, a: re(0), b: re(1) });
    m.push({ id: `${conf}-r2m2`, round: 2, region: conf, a: re(2), b: re(3) });
    const id = `${conf}-r3m1`;
    m.push({ id, round: 3, region: conf, a: win(`${conf}-r2m1`), b: win(`${conf}-r2m2`) });
    champs.push(id);
  }
  m.push({ id: "r4m1", round: 4, a: win(champs[0]), b: win(champs[1]) });
  return {
    kind: "nfl",
    name: "NFL Playoffs",
    regions: ["AFC", "NFC"],
    rounds: [
      { name: "Wild Card", points: 10 },
      { name: "Divisional", points: 20 },
      { name: "Conference Championships", points: 40 },
      { name: "Super Bowl", points: 80 },
    ],
    matchups: m,
    entrants: ["AFC", "NFC"].flatMap((c) => Array.from({ length: 7 }, (_, i) => key(c, i + 1))),
  };
}

function nba(): Tournament {
  const m: Matchup[] = [];
  const champs = ["East", "West"].map((conf) => {
    const first = ORDER_8.map(([a, b], i) => {
      const id = `${conf}-r1m${i + 1}`;
      m.push({ id, round: 1, region: conf, a: seed(key(conf, a)), b: seed(key(conf, b)) });
      return id;
    });
    return knockout(first, [2, 3], `${conf}-`, conf, m);
  });
  m.push({ id: "r4m1", round: 4, a: win(champs[0]), b: win(champs[1]) });
  return {
    kind: "nba",
    name: "NBA Playoffs",
    regions: ["East", "West"],
    rounds: [
      { name: "First Round", points: 10 },
      { name: "Conference Semifinals", points: 20 },
      { name: "Conference Finals", points: 40 },
      { name: "NBA Finals", points: 80 },
    ],
    matchups: m,
    entrants: ["East", "West"].flatMap((c) => Array.from({ length: 8 }, (_, i) => key(c, i + 1))),
  };
}

function mlb(): Tournament {
  const m: Matchup[] = [];
  const champs = ["AL", "NL"].map((lg) => {
    m.push({ id: `${lg}-r1m1`, round: 1, region: lg, a: seed(key(lg, 4)), b: seed(key(lg, 5)) });
    m.push({ id: `${lg}-r1m2`, round: 1, region: lg, a: seed(key(lg, 3)), b: seed(key(lg, 6)) });
    // Division Series: no reseeding since 2022; the 1 seed meets the 4/5 winner.
    m.push({ id: `${lg}-r2m1`, round: 2, region: lg, a: seed(key(lg, 1)), b: win(`${lg}-r1m1`) });
    m.push({ id: `${lg}-r2m2`, round: 2, region: lg, a: seed(key(lg, 2)), b: win(`${lg}-r1m2`) });
    const id = `${lg}-r3m1`;
    m.push({ id, round: 3, region: lg, a: win(`${lg}-r2m1`), b: win(`${lg}-r2m2`) });
    return id;
  });
  m.push({ id: "r4m1", round: 4, a: win(champs[0]), b: win(champs[1]) });
  return {
    kind: "mlb",
    name: "MLB Postseason",
    regions: ["AL", "NL"],
    rounds: [
      { name: "Wild Card Series", points: 10 },
      { name: "Division Series", points: 20 },
      { name: "League Championship Series", points: 40 },
      { name: "World Series", points: 80 },
    ],
    matchups: m,
    entrants: ["AL", "NL"].flatMap((c) => Array.from({ length: 6 }, (_, i) => key(c, i + 1))),
  };
}

export type MarchMadnessOptions = {
  /** The four regions in bracket order: the first two meet in one semifinal, the last two in the other. */
  regions: [string, string, string, string];
  /** The First Four: each listed region seed is a play-in between "<region>:<seed>a" and "...b". */
  playIns: Array<{ region: string; seed: number }>;
};

/** Region names and play-ins change every year; these are placeholders until the field is set. */
export const DEFAULT_MARCH_MADNESS: MarchMadnessOptions = {
  regions: ["East", "West", "South", "Midwest"],
  playIns: [
    { region: "East", seed: 16 },
    { region: "South", seed: 16 },
    { region: "West", seed: 11 },
    { region: "Midwest", seed: 11 },
  ],
};

function marchMadness(kind: "ncaam" | "ncaaw", opts: MarchMadnessOptions): Tournament {
  const m: Matchup[] = [];
  const entrants: EntrantKey[] = [];
  const isPlayIn = (region: string, s: number) =>
    opts.playIns.some((p) => p.region === region && p.seed === s);
  const slot = (region: string, s: number): Source => {
    if (!isPlayIn(region, s)) {
      entrants.push(key(region, s));
      return seed(key(region, s));
    }
    const id = `ff-${region}-${s}`;
    entrants.push(key(region, s, "a"), key(region, s, "b"));
    m.push({
      id,
      round: 0,
      region,
      a: seed(key(region, s, "a")),
      b: seed(key(region, s, "b")),
    });
    return win(id);
  };
  const champs = opts.regions.map((region) => {
    const first = ORDER_16.map(([a, b], i) => {
      const id = `${region}-r1m${i + 1}`;
      m.push({ id, round: 1, region, a: slot(region, a), b: slot(region, b) });
      return id;
    });
    return knockout(first, [2, 3, 4], `${region}-`, region, m);
  });
  knockout(champs, [5, 6], "", undefined, m);
  const sex = kind === "ncaam" ? "Men's" : "Women's";
  return {
    kind,
    name: `${sex} March Madness`,
    regions: [...opts.regions],
    rounds: [
      { name: "First Four", points: 0 },
      { name: "First Round", points: 10 },
      { name: "Second Round", points: 20 },
      { name: "Sweet 16", points: 40 },
      { name: "Elite Eight", points: 80 },
      { name: "Final Four", points: 160 },
      { name: "National Championship", points: 320 },
    ],
    matchups: m,
    entrants,
  };
}

export function buildTournament(
  kind: TournamentKind,
  march: MarchMadnessOptions = DEFAULT_MARCH_MADNESS,
): Tournament {
  switch (kind) {
    case "cfp":
      return cfp();
    case "nfl":
      return nfl();
    case "nba":
      return nba();
    case "mlb":
      return mlb();
    case "ncaam":
    case "ncaaw":
      return marchMadness(kind, march);
  }
}

/** Points for a matchup's round (First Four rounds are 0-indexed as round 0). */
export function roundOf(t: Tournament, m: Matchup): Round {
  const base = t.kind === "ncaam" || t.kind === "ncaaw" ? 0 : 1;
  return t.rounds[m.round - base];
}

/** Who plays in a matchup given the winners so far (picks or results); null while undecided. */
export function participants(
  t: Tournament,
  matchupId: string,
  winners: Winners,
): [EntrantKey | null, EntrantKey | null] {
  const m = t.matchups.find((x) => x.id === matchupId);
  if (!m) return [null, null];
  return [resolve(m.a, winners), resolve(m.b, winners)];
}

function resolve(src: Source, winners: Winners): EntrantKey | null {
  if (src.kind === "seed") return src.key;
  if (src.kind === "winner") return winners[src.of] ?? null;
  // The bye team is in its divisional game whatever the wild-card round does.
  if (src.pos === 0) return src.bye;
  const advanced = src.from.map((id) => winners[id]);
  if (advanced.some((k) => !k)) return null;
  // Lowest remaining seed plays the bye team; the other two meet, higher seed first.
  const bySeed = (advanced as EntrantKey[]).sort((a, b) => seedOf(a) - seedOf(b));
  const order = [src.bye, bySeed[2], bySeed[0], bySeed[1]];
  return order[src.pos];
}

/** Matchups in play order (rounds ascending), so each is resolved after what feeds it. */
export function ordered(t: Tournament): Matchup[] {
  return [...t.matchups].sort((a, b) => a.round - b.round);
}

/**
 * Picks with every inconsistent one dropped: a pick for a team that, by the earlier picks, isn't
 * in that game. Changing an early pick clears what depended on it.
 */
export function cleanPicks(t: Tournament, picks: Winners): Winners {
  const out: Winners = {};
  for (const m of ordered(t)) {
    const pick = picks[m.id];
    if (!pick) continue;
    const [a, b] = [resolve(m.a, out), resolve(m.b, out)];
    if (pick === a || pick === b) out[m.id] = pick;
  }
  return out;
}

export type BracketScore = {
  points: number;
  correct: number;
  /** Points still reachable: undecided games whose picked team is still alive. */
  possible: number;
};

/**
 * Picks against real results. A pick scores its round's points when the picked team won that
 * game. A pick is dead once its team has lost anywhere, so it stops counting toward `possible`.
 */
export function scoreBracket(t: Tournament, picks: Winners, results: Winners): BracketScore {
  const clean = cleanPicks(t, picks);
  const eliminated = new Set<EntrantKey>();
  for (const m of t.matchups) {
    const winner = results[m.id];
    if (!winner) continue;
    const [a, b] = participants(t, m.id, results);
    for (const k of [a, b]) if (k && k !== winner) eliminated.add(k);
  }
  let points = 0,
    correct = 0,
    possible = 0;
  for (const m of t.matchups) {
    const pick = clean[m.id];
    if (!pick) continue;
    const value = roundOf(t, m).points;
    const result = results[m.id];
    if (result) {
      if (result === pick) {
        points += value;
        correct += 1;
      }
    } else if (!eliminated.has(pick)) possible += value;
  }
  return { points, correct, possible: points + possible };
}

/** The champion a bracket picks (the last game's winner), if it has one. */
export function championOf(t: Tournament, picks: Winners): EntrantKey | null {
  const all = ordered(t);
  const last = all[all.length - 1];
  return last ? (cleanPicks(t, picks)[last.id] ?? null) : null;
}
