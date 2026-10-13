import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { isCurrentStream } from "@/components/player/stream-switcher/switcher-row";
import { useSwitcherRefresh } from "@/components/player/stream-switcher/use-switcher-refresh";
import { useT } from "@/lib/i18n";
import type { PlayerBridge, PlayerSnapshot } from "@/lib/player/bridge";
import {
  dubStreamKey,
  englishAudioState,
  findEnglishTrack,
  isEnglishLanguage,
  rankEnglishDubStreams,
  streamTextIsEnglish,
} from "@/lib/player/english-dub";
import { isNativeEnglishDubRequest, showNativeTvMessage } from "@/lib/player/native-tv/shell";
import { peekPickerCache } from "@/lib/picker-cache";
import { writePlayerPrefs } from "@/lib/player-prefs";
import type { ScoredStream } from "@/lib/streams/types";
import type { PlayerSrc, PlayerStreamRef } from "@/lib/view";
import type { ToastInfo } from "@/views/addons/addons-types";

/** Sources tried per press before giving up; each failed resolve moves on to the next. */
const MAX_SOURCE_TRIES = 3;

export type EnglishDubControl = {
  visible: boolean;
  /** The audio playing is English. */
  active: boolean;
  /** Looking for, or loading, an English dub source. */
  busy: boolean;
  notice: ToastInfo | null;
  press: () => void;
};

/**
 * The "English dub" control: switches to the file's English track through the same bridge call
 * the audio menu uses, and when the file has none, finds a source tagged English or multi-audio
 * for the same title and switches to it in place, resuming where playback is.
 */
export function useEnglishDub(params: {
  bridgeRef: RefObject<PlayerBridge | null>;
  src: PlayerSrc;
  snap: PlayerSnapshot;
  liveUrl: string;
  streamRef: PlayerStreamRef | undefined;
  imdbId: string | null;
  debridSlugs: string[];
  onSwitchStream: (stream: ScoredStream) => Promise<boolean>;
  /** Live TV, sports and local files. */
  hidden: boolean;
  /** False for a Watch Together guest, who follows the host's source. */
  canSearch: boolean;
}): EnglishDubControl {
  const t = useT();
  const { bridgeRef, src, snap, liveUrl, streamRef, hidden } = params;
  const { refresh } = useSwitcherRefresh({
    meta: src.meta,
    episode: src.episode,
    imdbId: params.imdbId,
    active: false,
  });

  const state = englishAudioState(snap.audioTracks);
  const streamText = [streamRef?.title, streamRef?.resolvedFilename].filter(Boolean).join(" ");
  const active = state === "english" || (state === "unknown" && streamTextIsEnglish(streamText));

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ToastInfo | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const showNotice = useCallback((text: string, kind: ToastInfo["kind"] = "ok", ms = 4000) => {
    if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current);
    setNotice({ kind, text });
    // Over the TV app's full-screen video the page is hidden. The ongoing "Finding…" notice is
    // left out: the app shows its own when its menu asks for a dub.
    if (ms > 0) showNativeTvMessage(text);
    noticeTimerRef.current = ms > 0 ? window.setTimeout(() => setNotice(null), ms) : null;
  }, []);
  useEffect(
    () => () => {
      if (noticeTimerRef.current != null) window.clearTimeout(noticeTimerRef.current);
    },
    [],
  );

  const latest = useRef(params);
  latest.current = params;
  const triedRef = useRef(new Set<string>());
  const runRef = useRef(0);
  /** The url a dub switch left; set until the new source's tracks have been checked. */
  const switchedFromRef = useRef<string | null>(null);
  const itemKey = `${src.meta.id}|${src.episode?.season ?? ""}|${src.episode?.episode ?? ""}`;
  useEffect(() => {
    triedRef.current = new Set();
    switchedFromRef.current = null;
    runRef.current += 1;
    setBusy(false);
  }, [itemKey]);

  const selectTrack = useCallback(
    (id: string, lang: string | undefined) => {
      bridgeRef.current?.setAudioTrack(id);
      if (lang) writePlayerPrefs(latest.current.src.meta.id, { audioLang: lang });
    },
    [bridgeRef],
  );

  // A dub source has loaded. The track autoload already prefers the English written to the
  // player prefs; this covers a track named English without a language tag, and a source that
  // turned out to have no English after all.
  useEffect(() => {
    if (switchedFromRef.current == null || switchedFromRef.current === liveUrl) return;
    if (snap.audioTracks.length === 0) return;
    switchedFromRef.current = null;
    const next = englishAudioState(snap.audioTracks);
    if (next === "missing") {
      showNotice(t("This source has no English audio either. Press again to try another"), "error");
      return;
    }
    const track = findEnglishTrack(snap.audioTracks);
    if (next === "available" && track && !isEnglishLanguage(track.lang)) {
      selectTrack(track.id, undefined);
    }
  }, [liveUrl, snap.audioTracks, selectTrack, showNotice, t]);

  const searchDub = useCallback(
    async (tracksKnown: boolean) => {
      const run = ++runRef.current;
      const p = latest.current;
      const ref = p.streamRef;
      const exclude = (s: ScoredStream) =>
        triedRef.current.has(dubStreamKey(s)) ||
        isCurrentStream(s, p.liveUrl, ref?.infoHash ?? null, ref?.fileIdx ?? null);
      const rank = () =>
        rankEnglishDubStreams(peekPickerCache(p.src.meta, p.src.episode)?.result.picker.all ?? [], {
          debridSlugs: p.debridSlugs,
          exclude,
        });

      setBusy(true);
      showNotice(
        tracksKnown
          ? t("No English audio in this file. Finding an English dub…")
          : t("Finding an English dub…"),
        "ok",
        0,
      );
      try {
        let candidates = rank();
        if (candidates.length === 0 && !peekPickerCache(p.src.meta, p.src.episode)?.complete) {
          await refresh();
          if (run !== runRef.current) return;
          candidates = rank();
        }
        // The track autoload reads this when the new source's tracks arrive.
        if (candidates.length > 0) writePlayerPrefs(p.src.meta.id, { audioLang: "en" });
        for (const stream of candidates.slice(0, MAX_SOURCE_TRIES)) {
          triedRef.current.add(dubStreamKey(stream));
          const ok = await latest.current.onSwitchStream(stream);
          if (run !== runRef.current) return;
          if (ok) {
            // onSwitchStream settles before React renders the new url, so wait for any change.
            switchedFromRef.current = p.liveUrl;
            showNotice(t("Switched to an English dub source"));
            return;
          }
        }
        showNotice(t("No English dub found for this title"), "error");
      } finally {
        if (run === runRef.current) setBusy(false);
      }
    },
    [refresh, showNotice, t],
  );

  const press = useCallback(() => {
    if (busy) return;
    const p = latest.current;
    const tracks = p.snap.audioTracks;
    const now = englishAudioState(tracks);
    // The tracks of a file that is still opening aren't known yet.
    if (now === "unknown" && (p.snap.status === "idle" || p.snap.status === "loading")) return;
    if (now === "english" || (now === "unknown" && active)) {
      showNotice(t("Already playing English audio"));
      return;
    }
    if (now === "available") {
      const track = findEnglishTrack(tracks);
      if (track) {
        selectTrack(track.id, track.lang);
        showNotice(t("Switched to English audio"));
        return;
      }
    }
    if (!p.canSearch) {
      showNotice(t("No English audio in this file"), "error");
      return;
    }
    void searchDub(now !== "unknown");
  }, [busy, active, selectTrack, searchDub, showNotice, t]);

  // The TV app's full-screen menu asks for a dub source when the file has no English track.
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onNative = (e: Event) => {
      if (!isNativeEnglishDubRequest((e as CustomEvent<unknown>).detail)) return;
      if (latest.current.hidden) {
        showNotice(t("No English audio in this file"), "error");
        return;
      }
      pressRef.current();
    };
    window.addEventListener("jl-native-player", onNative);
    return () => window.removeEventListener("jl-native-player", onNative);
  }, [showNotice, t]);

  return useMemo(
    () => ({ visible: !hidden, active, busy, notice, press }),
    [hidden, active, busy, notice, press],
  );
}
