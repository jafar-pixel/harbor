import { artKey, curatedArt, useCuratedArtVersion } from "@/lib/jl/sports/curated-art";
import { teamBrand } from "@/lib/jl/sports/vision";
import { useEffect, useState } from "react";
import type { SportsGame } from "@/lib/sports/espn";
import {
  artworkCacheKey,
  cachedArtwork,
  fetchSportsArtwork,
  type SportsArtwork,
} from "@/lib/sports/hub-artwork";
export function useSportsArtwork(game?: SportsGame): SportsArtwork {
  useCuratedArtVersion();
  const key = game ? artworkCacheKey(game) : "";
  const [loaded, setLoaded] = useState<{ key: string; art: SportsArtwork }>(() => ({
    key,
    art: game ? cachedArtwork(game) : {},
  }));
  useEffect(() => {
    if (!game) return;
    let active = true;
    void fetchSportsArtwork(game).then((art) => {
      if (active) setLoaded({ key, art });
    });
    return () => {
      active = false;
    };
  }, [key]);
  if (!game) return {};
  const fallback =
    loaded.key === key ? { ...loaded.art, ...cachedArtwork(game) } : cachedArtwork(game);
  const homeKey = artKey.team(game.league, game.home.id);
  const awayKey = artKey.team(game.league, game.away.id);
  return {
    ...fallback,
    backdrop: curatedArt(homeKey, "hero") || curatedArt(awayKey, "hero") || fallback.backdrop,
    poster: curatedArt(homeKey, "card") || curatedArt(awayKey, "card") || fallback.poster,
    home: teamBrand(game.league, game.home.id)?.logo || fallback.home,
    away: teamBrand(game.league, game.away.id)?.logo || fallback.away,
  };
}
