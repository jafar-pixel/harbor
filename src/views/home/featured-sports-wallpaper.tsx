import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Play } from "lucide-react";
import {
  cardArtworkFor,
  useApprovedSportsArtwork,
} from "@/lib/sports/approved-art";
import type { SportsGame } from "@/lib/sports/espn";

type Props = {
  games: SportsGame[];
  onDetails: (game: SportsGame) => void;
};

export function FeaturedSportsWallpaper({ games, onDetails }: Props) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const art = useApprovedSportsArtwork();
  const upcoming = games
    .filter((game) => game.state !== "post")
    .sort(
      (a, b) =>
        (a.state === "in" ? -1 : a.startMs) -
        (b.state === "in" ? -1 : b.startMs),
    )
    .slice(0, 6);

  useEffect(() => {
    if (paused || upcoming.length < 2) return;

    const tick = window.setInterval(
      () => setActive((current) => (current + 1) % upcoming.length),
      9000,
    );

    return () => window.clearInterval(tick);
  }, [paused, upcoming.length]);

  useEffect(() => {
    if (active >= upcoming.length) setActive(0);
  }, [active, upcoming.length]);

  if (!upcoming.length) return null;

  const game = upcoming[active] || upcoming[0];
  const team = game.home;
  const photo = cardArtworkFor(art, team.name, game.away.name);
  const parts = team.name.trim().split(/\s+/);
  const school = parts.length > 1 ? parts.slice(0, -1).join(" ") : team.name;
  const nickname = parts.length > 1 ? parts.at(-1) : "";
  const go = (delta: number) =>
    setActive((current) => (current + delta + upcoming.length) % upcoming.length);

  return (
    <section
      aria-label="Featured sports wallpaper slides"
      className="relative isolate min-h-[380px] overflow-hidden rounded-[28px] bg-[#141518] sm:min-h-[450px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {photo && (
        <img
          src={photo}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover"
        />
      )}
      {!photo && team.logo && (
        <img
          src={team.logo}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute right-[10%] top-[8%] -z-20 h-[85%] max-w-[55%] object-contain opacity-20"
        />
      )}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[#0b0c0f] via-[#0b0c0f]/85 to-[#0b0c0f]/25" />
      <div className="relative flex min-h-[380px] max-w-[85%] flex-col justify-center gap-5 px-6 py-10 sm:min-h-[450px] sm:px-12">
        <div className="text-xs font-black uppercase tracking-[0.24em] text-accent">
          JL SPORTS · FEATURED WALLPAPERS
        </div>
        <div className="font-['Orbitron',sans-serif] font-black uppercase leading-[1.03] tracking-[-0.055em]">
          <div
            className="text-[clamp(28px,5.5vw,76px)] text-transparent"
            style={{ WebkitTextStroke: "1.6px #f0eee8" }}
          >
            {school}
          </div>
          {nickname && (
            <div className="text-[clamp(32px,6vw,82px)] text-[#e0c38b]">
              {nickname}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#f1eee6]">
          {game.away.logo && (
            <img
              src={game.away.logo}
              alt=""
              className="h-7 w-7 object-contain"
            />
          )}
          <span>{game.away.name}</span>
          <span className="opacity-60">at</span>
          {team.logo && (
            <img src={team.logo} alt="" className="h-7 w-7 object-contain" />
          )}
          <span>{team.name}</span>
        </div>
        <div className="text-sm text-white/70">
          {game.league} ·{" "}
          {game.state === "in"
            ? "Live"
            : new Date(game.startMs).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onDetails(game)}
            className="inline-flex items-center gap-2 rounded-full bg-[#e0c38b] px-6 py-3 font-bold text-black"
          >
            <Play size={16} /> Watch game
          </button>
          <button
            type="button"
            onClick={() => onDetails(game)}
            className="inline-flex items-center gap-2 rounded-full border border-white/35 bg-black/30 px-5 py-3 font-bold text-white"
          >
            <Info size={16} /> Game details
          </button>
        </div>
      </div>
      {upcoming.length > 1 && (
        <div className="absolute bottom-5 right-5 flex items-center gap-2">
          <button
            aria-label="Previous wallpaper"
            onClick={() => go(-1)}
            className="rounded-full bg-black/60 p-2 text-white"
          >
            <ChevronLeft />
          </button>
          <span className="min-w-11 text-center text-xs text-white">
            {active + 1} / {upcoming.length}
          </span>
          <button
            aria-label="Next wallpaper"
            onClick={() => go(1)}
            className="rounded-full bg-black/60 p-2 text-white"
          >
            <ChevronRight />
          </button>
        </div>
      )}
    </section>
  );
}
