/**
 * Original cover art drawn in the browser, for anything that has no cover of its own: a vibe,
 * a playlist without artwork, a song no catalog knows. Each title always gets the same design
 * (seeded by its name), in one of a few poster styles: Swiss type, sunset, grain blobs and grid.
 * Returns an SVG data URL. Plain module, no I/O.
 */

type Palette = [string, string, string];

const PALETTES: Palette[] = [
  ["#ff5a36", "#1b1464", "#ffd23f"],
  ["#00c2a8", "#0b132b", "#f7f052"],
  ["#ff3d7f", "#2b0a3d", "#ffb703"],
  ["#4361ee", "#0d0d0d", "#f72585"],
  ["#f4a261", "#264653", "#e9c46a"],
  ["#06d6a0", "#073b4c", "#ef476f"],
  ["#e63946", "#1d3557", "#f1faee"],
  ["#9b5de5", "#00171f", "#00f5d4"],
  ["#ffbe0b", "#3a0ca3", "#ff006e"],
  ["#2ec4b6", "#011627", "#ff9f1c"],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
}

const esc = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Break a title into at most three short lines for big poster type. */
function lines(title: string, max = 11): string[] {
  const words = title.toUpperCase().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && (last + " " + w).length <= max) out[out.length - 1] = `${last} ${w}`;
    else out.push(w.length > max + 3 ? `${w.slice(0, max + 2)}…` : w);
  }
  return out.slice(0, 3);
}

const grain = `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0"/></filter><rect width="600" height="600" filter="url(#n)"/>`;

export function coverArt(title: string, subtitle = "", colors?: [string, string]): string {
  const seed = hash(`${title}|${subtitle}`);
  const r = rng(seed);
  const base = PALETTES[seed % PALETTES.length];
  const [a, b, c]: Palette = colors ? [colors[0], colors[1], base[2]] : base;
  const t = lines(title);
  const sub = esc(subtitle.toUpperCase().slice(0, 34));
  const style = (seed >>> 8) % 4;
  const font = `font-family="Inter, Helvetica, Arial, sans-serif" font-weight="900"`;
  let body = "";

  if (style === 0) {
    // Swiss: a color field, one big circle, stacked type.
    const cx = 180 + r() * 260;
    const cy = 140 + r() * 140;
    body = `<rect width="600" height="600" fill="${b}"/><circle cx="${cx}" cy="${cy}" r="${150 + r() * 70}" fill="${a}"/><rect x="0" y="${380 + r() * 40}" width="600" height="8" fill="${c}"/>${t
      .map(
        (l, i) =>
          `<text x="36" y="${470 + i * 52 - (t.length - 1) * 26}" ${font} font-size="54" fill="#fff" letter-spacing="-2">${esc(l)}</text>`,
      )
      .join(
        "",
      )}<text x="36" y="572" ${font} font-size="16" fill="${c}" letter-spacing="3">${sub}</text>`;
  } else if (style === 1) {
    // Sunset: gradient sky, a striped sun, the title low.
    body = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient><clipPath id="c"><circle cx="300" cy="300" r="170"/></clipPath></defs><rect width="600" height="600" fill="url(#s)"/><g clip-path="url(#c)"><rect width="600" height="600" fill="${c}"/>${Array.from(
      { length: 6 },
      (_, i) => `<rect x="0" y="${330 + i * 26}" width="600" height="${6 + i * 2}" fill="${a}"/>`,
    ).join("")}</g>${t
      .map(
        (l, i) =>
          `<text x="300" y="${520 + i * 40 - (t.length - 1) * 20}" ${font} font-size="40" fill="#fff" text-anchor="middle" letter-spacing="4">${esc(l)}</text>`,
      )
      .join(
        "",
      )}<text x="300" y="70" ${font} font-size="15" fill="#fff" fill-opacity=".8" text-anchor="middle" letter-spacing="5">${sub}</text>`;
  } else if (style === 2) {
    // Grain: soft blurred color blobs on dark, with film grain.
    body = `<defs><filter id="b"><feGaussianBlur stdDeviation="60"/></filter></defs><rect width="600" height="600" fill="${b}"/><g filter="url(#b)"><circle cx="${150 + r() * 120}" cy="${160 + r() * 120}" r="190" fill="${a}"/><circle cx="${360 + r() * 120}" cy="${330 + r() * 120}" r="170" fill="${c}"/></g>${grain}${t
      .map(
        (l, i) =>
          `<text x="40" y="${90 + i * 60}" ${font} font-size="58" fill="#fff" letter-spacing="-2">${esc(l)}</text>`,
      )
      .join(
        "",
      )}<text x="40" y="560" ${font} font-size="16" fill="#fff" fill-opacity=".85" letter-spacing="4">${sub}</text>`;
  } else {
    // Grid: bold blocks and a quarter circle, Bauhaus-style.
    body = `<rect width="600" height="600" fill="${c}"/><rect x="0" y="0" width="300" height="300" fill="${a}"/><rect x="300" y="300" width="300" height="300" fill="${b}"/><path d="M300 300 L600 300 A300 300 0 0 0 300 0 Z" fill="${b}"/><circle cx="150" cy="450" r="${90 + r() * 40}" fill="${a}"/>${t
      .map(
        (l, i) =>
          `<text x="324" y="${400 + i * 46}" ${font} font-size="40" fill="#fff" letter-spacing="-1">${esc(l)}</text>`,
      )
      .join(
        "",
      )}<text x="324" y="570" ${font} font-size="14" fill="#fff" letter-spacing="3">${sub}</text>`;
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">${body}</svg>`,
  )}`;
}
