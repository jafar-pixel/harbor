import assert from "node:assert/strict";
import test from "node:test";
import type { TrackInfo } from "../src/lib/player/bridge.ts";
import {
  englishAudioState,
  findEnglishTrack,
  isEnglishLanguage,
  isEnglishTrack,
  rankEnglishDubStreams,
  streamTextIsEnglish,
} from "../src/lib/player/english-dub.ts";
import { nativeAudioTrackInfo } from "../src/lib/player/native-tv/bridge.ts";

const audio = (id: string, extra: Partial<TrackInfo> = {}): TrackInfo => ({
  id,
  label: extra.title ?? id,
  kind: "audio",
  selected: false,
  ...extra,
});

test("English dub: English language codes", () => {
  for (const code of ["en", "eng", "English", "EN-us", "en_GB"])
    assert.ok(isEnglishLanguage(code), code);
  for (const code of ["", undefined, null, "ja", "jpn", "und", "enm2"]) {
    assert.equal(isEnglishLanguage(code), false, String(code));
  }
});

test("English dub: a track is English by its language or its title", () => {
  assert.ok(isEnglishTrack(audio("1", { lang: "eng" })));
  assert.ok(isEnglishTrack(audio("1", { title: "English 5.1" })));
  assert.equal(isEnglishTrack(audio("1", { lang: "jpn", title: "Japanese" })), false);
  assert.equal(isEnglishTrack(audio("1", { title: "Englishman's commentary" })), false);
});

test("English dub: state of the playing audio", () => {
  assert.equal(englishAudioState([]), "unknown");
  assert.equal(
    englishAudioState([audio("1", { lang: "en", selected: true }), audio("2", { lang: "ja" })]),
    "english",
  );
  assert.equal(
    englishAudioState([audio("1", { lang: "ja", selected: true }), audio("2", { lang: "eng" })]),
    "available",
  );
  assert.equal(englishAudioState([audio("1", { lang: "ja", selected: true })]), "missing");
});

test("English dub: the main English mix wins over commentary", () => {
  const tracks = [
    audio("1", { lang: "jpn", selected: true }),
    audio("2", { lang: "eng", title: "Commentary", channelCount: 6 }),
    audio("3", { lang: "eng", title: "English", channelCount: 2 }),
  ];
  assert.equal(findEnglishTrack(tracks)?.id, "3");
  assert.equal(findEnglishTrack([audio("1", { lang: "ja" })]), null);
});

test("English dub: stream titles tagged English", () => {
  assert.ok(streamTextIsEnglish("Show.S01E01.1080p.ENG.WEB-DL"));
  assert.equal(streamTextIsEnglish("Show.S01E01.1080p.JPN.WEB-DL"), false);
  assert.equal(streamTextIsEnglish(null), false);
});

test("English dub: candidates are cached first, then English named, then multi-audio", () => {
  const s = (id: string, audioLanguages: string[], cached = false) => ({
    url: null,
    infoHash: id,
    fileIdx: null,
    addonId: "a",
    title: id,
    audioLanguages,
    cached: cached ? { realdebrid: true } : {},
    inLibrary: {},
  });
  const streams = [
    s("current", ["English"], true),
    s("untagged", [], true),
    s("japanese", ["Japanese"], true),
    s("multi-cached", ["Multi"], true),
    s("english-uncached", ["English"]),
    s("english-cached", ["English"], true),
  ];
  const ranked = rankEnglishDubStreams(streams, {
    debridSlugs: ["realdebrid"],
    exclude: (x) => x.infoHash === "current",
  });
  assert.deepEqual(
    ranked.map((x) => x.infoHash),
    ["english-cached", "multi-cached", "english-uncached"],
  );
});

test("English dub: native TV tracks become player tracks", () => {
  const tracks = nativeAudioTrackInfo([
    { id: "0:0", language: "ja", label: "Japanese", selected: true, channels: 6 },
    { id: "1:0", language: "und" },
    { id: "2:0", language: "en", channels: 2 },
    { language: "fr" },
  ]);
  assert.deepEqual(
    tracks.map((x) => [x.id, x.lang, x.selected, x.channelCount]),
    [
      ["0:0", "ja", true, 6],
      ["1:0", undefined, false, undefined],
      ["2:0", "en", false, 2],
    ],
  );
  assert.equal(englishAudioState(tracks), "available");
  assert.deepEqual(nativeAudioTrackInfo("nope"), []);
});
