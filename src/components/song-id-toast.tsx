import { useEffect, useRef, useState } from "react";
import { SongIdCard, type SongCardStyle } from "./song-id-card";
import { useT } from "@/lib/i18n";
import { saveFoundSong } from "@/lib/music/found-songs";
import { useView } from "@/lib/view";
import { useSettings } from "@/lib/settings";
import { onSongIdToast, type SongIdToastMsg } from "@/lib/song-id";

/**
 * The song-ID result card over the video. Clicking it saves the song for later (Music › Found
 * while watching, and your YouTube playlist) so the movie keeps playing.
 */
export function SongIdToast() {
  const t = useT();
  const { settings } = useSettings();
  const style = (settings.songCardStyle ?? "cinematic") as SongCardStyle;
  const showDetails = settings.songCardDetails ?? true;

  const { player } = useView();
  const [msg, setMsg] = useState<SongIdToastMsg | null>(null);
  const [saved, setSaved] = useState<"saving" | "saved" | "youtube" | null>(null);
  const [enter, setEnter] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const off = onSongIdToast((t) => {
      setMsg(t);
      setSaved(null);
      if (timer.current) window.clearTimeout(timer.current);
      if (t.kind !== "info") {
        timer.current = window.setTimeout(() => setMsg(null), 12000);
      }
    });
    return () => {
      off();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!msg) {
      setEnter(false);
      return;
    }
    setEnter(false);
    const id = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(id);
  }, [msg]);

  if (!msg || !settings.songIdEnabled) return null;

  const open = () => {
    const song = msg.song;
    if (!song || saved) return;
    setSaved("saving");
    void saveFoundSong(
      {
        title: song.title || song.artist,
        artist: song.title ? song.artist : "",
        album: song.album,
        art: song.artwork || msg.art || null,
      },
      player?.title ?? null,
    ).then((r) => setSaved(r.youtube === "added" ? "youtube" : "saved"));
  };
  const actionLabel =
    saved === "youtube"
      ? t("Saved for later · on your YouTube playlist")
      : saved === "saved"
        ? t("Saved for later · Music › Found while watching")
        : saved === "saving"
          ? t("Saving…")
          : t("Save for later");

  const anim = [
    "origin-top transition-all duration-500 ease-out motion-reduce:transition-none",
    enter ? "scale-100 opacity-100" : "scale-90 opacity-0",
    msg.kind === "result" ? "pointer-events-auto cursor-pointer hover:ring-white/25" : "",
  ].join(" ");

  return (
    <div className="pointer-events-none absolute left-1/2 top-8 z-30 flex -translate-x-1/2 flex-col items-center gap-3">
      <span className="rounded-full bg-black/70 px-4 py-1.5 text-sm font-semibold text-white/90 shadow-lg backdrop-blur">
        ▶ {t("Now Playing")}
      </span>
      <SongIdCard
        message={msg}
        style={style}
        showDetails={showDetails}
        onOpen={open}
        actionLabel={actionLabel}
        className={anim}
      />
    </div>
  );
}
