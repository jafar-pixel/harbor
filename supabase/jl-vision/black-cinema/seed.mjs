// Turns list.txt (the Black Cinema master list) into seed.sql for public.black_cinema_titles.
// Run: node supabase/jl-vision/black-cinema/seed.mjs > supabase/jl-vision/black-cinema/seed.sql
// A title listed in several sections is one row with every section's categories and networks.
// TMDB/IMDb ids, posters and genres are filled in later by the black-cinema-sync function.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

/** Franchise collections (section 6 of the list): the first rule a title matches. */
const FRANCHISES = [
  ["Bad Boys", /^bad boys\b/],
  ["Friday", /^(friday|next friday|friday after next)$/],
  ["Barbershop", /^(barbershop\b|beauty shop$)/],
  ["The Best Man", /^the best man( holiday|: the final chapters)?$/],
  ["Creed", /^creed( ii| iii)?$/],
  ["Black Panther", /^black panther\b/],
  ["Power Universe", /^power( book .*)?$/],
  ["Snowfall Universe", /^(snowfall|the drop: a snowfall saga)$/],
  ["The Game", /^the game$/],
  ["Tyler Perry's Madea", /madea|^diary of a mad black woman$/],
  ["Why Did I Get Married?", /^why did i get married/],
  ["Sistas Universe", /^(sistas|zatima|divorced sistas)$/],
  ["The Oval Universe", /^(the oval|ruthless)$/],
  ["The Family Business", /the family business/],
  ["All American", /^all american\b/],
  ["Secret Society", /secret society/],
  ["Dutch", /^dutch\b/],
  ["The Stepmother", /^the stepmother\b/],
  ["Think Like a Man", /^think like a man\b/],
  ["Ride Along", /^ride along\b/],
  ["Big Momma's House", /^big momma/],
  ["Beverly Hills Cop", /^beverly hills cop\b/],
  ["Coming to America", /^(coming to america|coming 2 america)$/],
  ["Shaft", /^shaft\b/],
  ["The Proud Family", /^the proud family\b/],
  ["A Different World", /^a different world$/],
];

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

export function parseList(text) {
  const rows = [];
  let section = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      section = line.slice(3).trim();
      continue;
    }
    const [title, year, type, network, tags] = line.split("|").map((p) => (p ?? "").trim());
    // "?" for a year: a show whose start year the source didn't give (it merges with the same
    // show listed elsewhere, or counts as new this year).
    if (!title || !/^(\d{4}|\?)$/.test(year) || !["movie", "series"].includes(type)) {
      throw new Error(`Bad line: ${raw}`);
    }
    const categories = new Set([section, ...(tags ? tags.split(",").map((t) => t.trim()) : [])]);
    categories.delete("");
    const known = year !== "?";
    rows.push({ title, year: known ? Number(year) : null, type, network: network || null, categories, section });
  }
  return rows;
}

/** One row per title: same name and type, released within a year of each other. */
export function mergeTitles(rows) {
  const out = [];
  for (const r of rows) {
    const same = out.find(
      (o) =>
        norm(o.title) === norm(r.title) &&
        o.type === r.type &&
        (r.year === null || Math.abs(o.year - r.year) <= 1),
    );
    if (!same) {
      out.push({
        ...r,
        year: r.year ?? new Date().getUTCFullYear(),
        categories: new Set(r.categories),
        networks: new Set(r.network ? [r.network] : []),
      });
      continue;
    }
    for (const c of r.categories) same.categories.add(c);
    if (r.network) same.networks.add(r.network);
  }
  for (const o of out) {
    const lower = o.title.toLowerCase();
    o.franchise = FRANCHISES.find(([, re]) => re.test(lower))?.[0] ?? null;
    if (o.franchise) o.categories.add("Black Movie Franchises");
    o.decade = `${Math.floor(o.year / 10) * 10}s`;
  }
  return out;
}

const sql = (v) =>
  v === null || v === undefined
    ? "null"
    : Array.isArray(v)
      ? `array[${v.map(sql).join(",")}]::text[]`
      : typeof v === "number"
        ? String(v)
        : `'${String(v).replace(/'/g, "''")}'`;

export function seedSql(titles) {
  const values = titles.map((t) =>
    `(${[
      sql(t.title),
      sql(t.year),
      sql(t.type),
      sql("Black Cinema"),
      sql(t.decade),
      sql([...t.categories]),
      sql([...t.networks][0] ?? null),
      sql([...t.networks]),
      sql(t.franchise),
    ].join(", ")})`,
  );
  return [
    "insert into public.black_cinema_titles",
    "  (title, release_year, media_type, collection, decade, categories, original_network, networks, franchise)",
    "values",
    values.join(",\n"),
    "on conflict (title_key, media_type, release_year) do update set",
    "  categories = excluded.categories, original_network = excluded.original_network,",
    "  networks = excluded.networks, franchise = excluded.franchise, decade = excluded.decade;",
    "",
  ].join("\n");
}

// Run as a script (not when the sync function imports it, where there is no process.argv).
if (typeof process !== "undefined" && import.meta.url === `file://${process.argv?.[1]}`) {
  // The owner's list first, then Black Box's collections (black-box.txt) merged into it.
  const titles = mergeTitles([
    ...parseList(readFileSync(`${here}/list.txt`, "utf8")),
    ...parseList(readFileSync(`${here}/black-box.txt`, "utf8")),
  ]);
  process.stdout.write(seedSql(titles));
  process.stderr.write(`${titles.length} titles\n`);
}
