import assert from "node:assert/strict";
import test from "node:test";
import { hideSdDuplicates } from "../src/lib/iptv/sd-duplicates.ts";
import type { IptvChannel } from "../src/lib/iptv/types.ts";

const ch = (id: string, name: string): IptvChannel => ({
  id,
  tvgId: null,
  name,
  logo: null,
  group: "USA Sports",
  url: `https://x/${id}`,
  catchupSource: null,
  durationSec: null,
  attrs: {},
});

test("an SD copy hides when the channel exists in better quality; SD-only channels stay", () => {
  const out = hideSdDuplicates([
    ch("1", "USA ESPN SD"),
    ch("2", "USA ESPN UHD"),
    ch("3", "USA NFL Network SD"),
    ch("4", "UK: Sky Sports Main Event SD"),
    ch("5", "UK: Sky Sports Main Event HD"),
  ]);
  assert.deepEqual(
    out.map((c) => c.id),
    ["2", "3", "5"],
  );
});
