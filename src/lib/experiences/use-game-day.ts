import { useEffect, useMemo, useState } from "react";
import { useFavourites } from "@/lib/sports/favourites";
import { useSettings } from "@/lib/settings";
import { useProfiles } from "@/lib/profiles";
import { fetchEsportsFeed } from "@/lib/sports/esports-feeds";
import { experienceLeagueGames } from "./schedule-source";
import { HUB_LEAGUES, fetchHubSlice, dayStamp } from "@/lib/sports/hub-data";
import { selectedSportsLeagues } from "@/lib/sports/personalization";
import type { SportsGame } from "@/lib/sports/espn";
import { fetchTeamGames } from "@/lib/jl/sports/feed";
import { useHubTeams } from "@/views/live/live-home/jl-sports/use-jl-sports";
import { useJlFavoritePlayers, effectiveTeams } from "@/lib/jl/sports/favorites";
import { useFollowedColleges } from "@/lib/jl/sports/college-follows";
import { fetchCalendar } from "@/lib/jl/sports/college-data";
import { collegeGames } from "@/lib/jl/sports/college-games";
import { isFavoriteGame } from "@/lib/jl/sports/rank";
import { gameIsToday, localDateKey } from "./catalog";

export function useExperienceGames(active: boolean, date: Date): SportsGame[] {
  const { settings } = useSettings();
  const { activeId } = useProfiles();
  const legacy = useFavourites();
  const teams = useHubTeams();
  const players = useJlFavoritePlayers();
  const colleges = useFollowedColleges();
  const favorites = useMemo(
    () =>
      effectiveTeams(teams, players).map((team) => ({
        ...team,
        league: team.league === "NCAAB" ? "NCAA" : team.league,
      })),
    [teams, players],
  );
  const leagues = useMemo(
    () =>
      selectedSportsLeagues(HUB_LEAGUES, settings.sportsLeagues, !!legacy.personalized, [
        "NCAAF",
        "NFL",
        "NBA",
      ]),
    [settings.sportsLeagues, legacy.personalized],
  );
  const key = leagues.join(","),
    favoritesKey = favorites.map((f) => `${f.league}:${f.id}`).join(",");
  const collegesKey = colleges.map((c) => `${c.id}:${c.site}`).join(",");
  const day = localDateKey(date);
  const [result, setResult] = useState<{
    profileId: string | null;
    key: string;
    games: SportsGame[];
  }>({ profileId: null, key: "", games: [] });
  useEffect(() => {
    if (!active || settings.hideContent.sports) return;
    const controller = new AbortController();
    let cancelled = false,
      running = false;
    const selected = new Set(leagues.map((key) => HUB_LEAGUES.find((l) => l.key === key)?.tag));
    const poll = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const results = await Promise.allSettled([
          ...leagues.map((key) =>
            experienceLeagueGames(
              HUB_LEAGUES.find((l) => l.key === key)!,
              dayStamp(new Date()),
              controller.signal,
              { hub: fetchHubSlice, esports: fetchEsportsFeed },
            ),
          ),
          ...favorites
            .filter((f) => selected.has(f.league) && /^\d+$/.test(f.id))
            .map((f) => fetchTeamGames(f.league, f.id)),
          ...(leagues.includes("NCAAF") || leagues.includes("NCAAB")
            ? colleges
                .filter((c) => !!c.site)
                .map(async (c) => {
                  const calendar = await fetchCalendar(c.site!);
                  return calendar ? collegeGames(c, calendar.events, Date.now()) : [];
                })
            : []),
        ]);
        const games = new Map<string, SportsGame>();
        for (const result of results) {
          if (result.status !== "fulfilled") continue;
          for (const game of result.value) {
            if (selected.has(game.league) && gameIsToday(game, new Date()))
              games.set(`${game.league}:${game.id}`, game);
          }
        }
        if (!cancelled)
          setResult({
            profileId: activeId,
            key,
            games: [...games.values()].sort(
              (a, b) =>
                Number(isFavoriteGame(b, favorites)) - Number(isFavoriteGame(a, favorites)) ||
                Number(b.state === "in") - Number(a.state === "in") ||
                a.startMs - b.startMs,
            ),
          });
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 60_000);
    const onVisible = () => {
      void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Serialized keys keep equivalent lists from starting a second request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeId, key, favoritesKey, collegesKey, day, settings.hideContent.sports]);
  return active && result.profileId === activeId && result.key === key ? result.games : [];
}
