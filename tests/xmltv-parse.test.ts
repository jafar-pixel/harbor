import assert from "node:assert/strict";
import test from "node:test";
import { parseXmltv } from "../src/lib/iptv/xmltv.ts";

const prog = (ch: string, h: number, title: string) =>
  `<programme start="20261025${String(h).padStart(2, "0")}0000 +0000" stop="20261025${String(h + 1).padStart(2, "0")}0000 +0000" channel="${ch}"><title>${title}</title><desc>About ${title}</desc></programme>`;

test("channels and programmes parse in any order", () => {
  const xml = [
    '<?xml version="1.0"?><tv>',
    '<channel id="a"><display-name>ESPN</display-name><icon src="https://x/a.png"/></channel>',
    prog("a", 1, "Game &amp; Talk"),
    '<channel id="b"><display-name>FOX</display-name></channel>',
    prog("b", 2, "<![CDATA[Football]]>"),
    prog("a", 3, "Late"),
    "</tv>",
  ].join("\n");
  const { programs, channelMeta } = parseXmltv(xml);
  assert.deepEqual(
    programs.map((p) => [p.channelTvgId, p.title]),
    [
      ["a", "Game & Talk"],
      ["b", "Football"],
      ["a", "Late"],
    ],
  );
  assert.equal(channelMeta.get("a")?.displayName, "ESPN");
  assert.equal(channelMeta.get("a")?.icon, "https://x/a.png");
  assert.equal(channelMeta.get("b")?.displayName, "FOX");
});

test("a large guide parses in linear time", () => {
  const parts = ["<tv>"];
  for (let c = 0; c < 2000; c++)
    parts.push(`<channel id="c${c}"><display-name>C${c}</display-name></channel>`);
  for (let c = 0; c < 2000; c++)
    for (let h = 0; h < 20; h++) parts.push(prog(`c${c}`, h, `Show ${h}`));
  parts.push("</tv>");
  const xml = parts.join("\n");
  const started = Date.now();
  const { programs, channelMeta } = parseXmltv(xml);
  const ms = Date.now() - started;
  assert.equal(programs.length, 40_000);
  assert.equal(channelMeta.size, 2000);
  // The quadratic version took tens of seconds here.
  assert.ok(ms < 3000, `parsed in ${ms}ms`);
});
