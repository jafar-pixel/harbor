import type { IptvChannel } from "../../iptv/types.ts";
import { channelQualityOf } from "./channels.ts";
import { tvLeagueOf, type TvLeague } from "./tv-leagues.ts";

const REPLAY = /\b(REPLAYS?|REWIND|FULL ?GAMES?|CONDENSED|ENCORE|ON ?DEMAND|CATCH ?UP)\b/i;

export type ReplayChannel = { channel: IptvChannel; league: TvLeague };

/**
 * Replay channels from the viewer's providers ("US | NFL Replay", "NBA Full Games"), by league
 * and best picture first. A whole group named for replays counts, as does a channel named so.
 */
export function replayChannels(channels: IptvChannel[]): ReplayChannel[] {
  return channels
    .filter((c) => REPLAY.test(c.group ?? "") || REPLAY.test(c.name))
    .map((channel) => ({
      channel,
      league: tvLeagueOf(
        { group: channel.group, name: channel.name, title: channel.name },
        "other",
      ),
    }))
    .sort((a, b) => channelQualityOf(b.channel) - channelQualityOf(a.channel));
}
