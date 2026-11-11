import { useCallback } from "react";
import { useT } from "@/lib/i18n";
import { liveChannelSource } from "@/lib/iptv/playback-source";
import { recordChannelPlay } from "@/lib/iptv/channel-stats";
import type { IptvChannel } from "@/lib/iptv/types";
import type { SportsGame } from "@/lib/sports/espn";
import { matchChannelsForGame, type SportsChannelIndex } from "@/lib/sports/iptv-match";
import { setGameFeeds } from "@/lib/sports/game-feeds";
import { recordGameWatch } from "@/lib/continue/recent-games";
import { useView } from "@/lib/view";
import { useStreamPlayer } from "./add-stream-dialog";
import { useAttachments } from "./source-store";

export function fixtureLabelOf(game: SportsGame): string {
  return game.away.name
    ? `${game.away.name} v ${game.home.name}`
    : game.context?.name || game.home.name;
}

export function useChannelPlayer(): (channel: IptvChannel, subtitle: string) => void {
  const t = useT();
  const { openPlayer } = useView();
  return useCallback(
    (channel: IptvChannel, subtitle: string) => {
      recordChannelPlay(channel);
      openPlayer({
        ...liveChannelSource(channel, subtitle),
        sportsDocked: true,
        meta: {
          id: `iptv:${channel.id}`,
          type: "tv",
          name: channel.name,
          poster: channel.logo ?? undefined,
          logo: channel.logo ?? undefined,
          background: channel.logo ?? undefined,
          description: channel.group
            ? t("Live channel: {group}", { group: channel.group })
            : t("Live channel"),
          releaseInfo: t("Live"),
        },
        url: channel.url,
        title: channel.name,
        subtitle,
        notWebReady: true,
        isLive: true,
      });
    },
    [openPlayer, t],
  );
}

export function useWatchGame(index: SportsChannelIndex): (game: SportsGame) => boolean {
  const attachments = useAttachments();
  const playChannel = useChannelPlayer();
  const playStream = useStreamPlayer();
  return useCallback(
    (game: SportsGame) => {
      const label = fixtureLabelOf(game);
      const recent = {
        gameId: game.id,
        league: game.league,
        label,
        logos: [game.away.logo, game.home.logo].filter(Boolean),
        art: game.artwork ?? game.poster ?? null,
        startMs: game.startMs,
      };
      const stream = attachments.streams[game.id];
      if (stream) {
        playStream(stream, label);
        recordGameWatch({ ...recent, stream });
        return true;
      }
      const matches = matchChannelsForGame(game, index, {
        attachedIds: attachments.channels[game.league] ?? [],
      });
      const best = matches[0];
      if (!best || best.tier !== "exact") return false;
      setGameFeeds(
        label,
        matches.map((m) => m.channel),
      );
      playChannel(best.channel, label);
      recordGameWatch({ ...recent, channel: best.channel });
      return true;
    },
    [attachments, index, playChannel, playStream],
  );
}
