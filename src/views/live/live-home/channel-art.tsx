import { createContext, useContext, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { IptvChannel } from "@/lib/iptv/types";
import type { SportsGame } from "@/lib/sports/espn";
import { hubLeague } from "@/lib/sports/hub-data";
import { useSportsArtwork } from "@/views/sports/use-artwork";
import { sportsSceneryPhoto } from "@/views/sports/sports-hero-scenery";
import { GameBackdrop, type BackdropVariant } from "./jl-sports/game-backdrop";
import type { NowItem } from "./use-live-home";

/**
 * Fan art for Live TV: a channel carrying one of today's games shows that game's artwork; any
 * other channel shows the program's backdrop (Cinemeta), then the guide's picture, then a backdrop
 * made from its own logo. Every Live TV surface (Your TV, the surfer, cards, Top 10) uses this.
 */

/** Which game each channel carries, from the Sports agent's picks (Live TV Home provides it). */
export const ChannelGamesContext = createContext<ReadonlyMap<string, SportsGame>>(new Map());

export function channelGameMap(
  games: readonly { game: SportsGame; channels: readonly { channel: IptvChannel }[] }[],
): Map<string, SportsGame> {
  const map = new Map<string, SportsGame>();
  // A live game claims its channels before one that hasn't started.
  const order = [...games].sort(
    (a, b) => Number(b.game.state === "in") - Number(a.game.state === "in"),
  );
  for (const g of order) {
    if (g.game.state === "post") continue;
    for (const c of g.channels) if (!map.has(c.channel.id)) map.set(c.channel.id, g.game);
  }
  return map;
}

export function useChannelGame(channelId: string): SportsGame | null {
  return useContext(ChannelGamesContext).get(channelId) ?? null;
}

/** A game's artwork filling its box (the event's photo, the teams', then the league's). */
export function GameArt({
  game,
  variant = "card",
}: {
  game: SportsGame;
  variant?: BackdropVariant;
}) {
  const art = useSportsArtwork(game);
  return (
    <GameBackdrop
      game={game}
      variant={variant}
      slot={variant === "hero" ? "hero" : "card"}
      eventPhoto={game.artwork || game.poster}
      leaguePhoto={art.backdrop || sportsSceneryPhoto(hubLeague(game.league)?.group, game.league)}
    />
  );
}

/** The picture for a channel that isn't carrying a game, if it has one. */
export function programPicture(item: NowItem, hydrated: Meta | null | undefined): string | null {
  return hydrated?.background || item.current?.iconUrl || null;
}

/** A channel's fan art, filling its (relative) box. */
export function ChannelArt({
  item,
  hydrated,
  zoom = false,
}: {
  item: NowItem;
  hydrated?: Meta | null;
  /** Scale up slightly on hover or focus of the enclosing `group`. */
  zoom?: boolean;
}) {
  const game = useChannelGame(item.channel.id);
  const [artErr, setArtErr] = useState<string | null>(null);
  const [logoErr, setLogoErr] = useState(false);
  if (game) return <GameArt game={game} />;
  const picture = programPicture(item, hydrated);
  const art = picture && artErr !== picture ? picture : null;
  const logo = item.channel.logo && !logoErr ? item.channel.logo : null;
  const zoomCls = zoom
    ? "transition-transform duration-300 group-hover:scale-[1.04] group-focus-visible:scale-[1.04]"
    : "";
  if (art)
    return (
      <img
        src={art}
        alt=""
        draggable={false}
        loading="lazy"
        onError={() => setArtErr(art)}
        className={`absolute inset-0 h-full w-full object-cover ${zoomCls}`}
      />
    );
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden" style={monogramBg(item.channel)}>
      {logo ? (
        <>
          <img
            src={logo}
            alt=""
            draggable={false}
            loading="lazy"
            className="absolute left-1/2 top-1/2 h-[160%] w-[90%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-30 blur-2xl saturate-150"
          />
          <img
            src={logo}
            alt=""
            draggable={false}
            loading="lazy"
            onError={() => setLogoErr(true)}
            className={`absolute left-1/2 top-[42%] max-h-[46%] max-w-[62%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)] ${zoomCls}`}
          />
        </>
      ) : (
        <span className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 font-display text-[clamp(18px,5vw,44px)] font-semibold tracking-tight text-white/80">
          {initials(item.channel.name)}
        </span>
      )}
    </div>
  );
}

function initials(name: string): string {
  const words = name
    // Provider tags ("USA ", "UK: ", "SP - ") aren't the channel's name.
    .replace(/^(?:[A-Z]{2,3}\s*[|:-]|(?:usa|us|uk|ca|can|au|mx)\b)\s*/i, "")
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "TV"
  );
}

/** A colour wash of its own for each channel, so cards without a picture still differ. */
function monogramBg(channel: IptvChannel): React.CSSProperties {
  let h = 0;
  for (const ch of channel.name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return {
    background: `radial-gradient(120% 90% at 20% 10%, hsl(${h} 55% 34%), transparent 60%), linear-gradient(135deg, hsl(${(h + 40) % 360} 45% 18%), hsl(${(h + 200) % 360} 35% 10%))`,
  };
}
