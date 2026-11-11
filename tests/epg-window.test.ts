import assert from "node:assert/strict";
import test from "node:test";
import { parseXmltv } from "../src/lib/iptv/xmltv.ts";
import { guideWindow } from "../src/lib/iptv/epg-store.ts";

const H = 60 * 60 * 1000;

function stamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00 +0000`;
}

function guide(now: number, desc = "Short."): string {
  let xml = '<tv><channel id="espn.us"><display-name>ESPN</display-name></channel>';
  // A 7-day guide, one program per hour, from 3 days back to 4 days ahead.
  for (let h = -72; h < 96; h++) {
    const start = now + h * H;
    xml += `<programme start="${stamp(start)}" stop="${stamp(start + H)}" channel="espn.us"><title>Show ${h}</title><desc>${desc}</desc></programme>`;
  }
  return `${xml}</tv>`;
}

test("the guide keeps only what it can show (14 h back to 40 h ahead)", () => {
  const now = Date.UTC(2026, 10, 11, 18, 30);
  const all = parseXmltv(guide(now)).programs;
  const kept = parseXmltv(guide(now), guideWindow(now)).programs;
  assert.equal(all.length, 168);
  // Programs that end after now-14h and start before now+40h.
  assert.equal(kept.length, 54);
  assert.ok(kept.every((p) => p.endMs > now - 14 * H && p.startMs < now + 40 * H));
  // What is on now, and the guide's own 12 h back and 36 h ahead, are all kept.
  assert.ok(kept.some((p) => p.startMs <= now && p.endMs > now));
  assert.ok(kept.some((p) => p.startMs <= now - 12 * H));
  assert.ok(kept.some((p) => p.endMs >= now + 36 * H));
});

test("long descriptions are capped", () => {
  const now = Date.UTC(2026, 10, 11, 18, 30);
  const [p] = parseXmltv(guide(now, "x".repeat(5000)), guideWindow(now)).programs;
  assert.ok(p.description && p.description.length === 500 && p.description.endsWith("…"));
});
