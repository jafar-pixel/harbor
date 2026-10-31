import type { IptvChannel } from "../../iptv/types.ts";
import { channelQualityOf } from "./channels.ts";
import { tvLeagueOf, type TvLeague } from "./tv-leagues.ts";

// Words that mark a sports replay. "Encore", "On Demand" and "Catch Up" are left out: they name
// movie channels (Starz Encore) and catch-up TV far more often than games.
const REPLAY = /\b(REPLAYS?|REWIND|FULL ?GAMES?|CONDENSED)\b/i;
// A replay group with no league in it still counts when it is plainly sports.
const SPORTS =
  /\b(SPORTS?|ESPN|FOX ?SPORTS|NBC ?SPORTS|DAZN|UFC|MMA|BOXING|WWE|AEW|F1|FORMULA ?1|NASCAR|INDYCAR|MOTOGP|GOLF|PGA|TENNIS|ATP|WTA|RUGBY|CRICKET|NCAA|COLLEGE)\b/i;

export type ReplayChannel = { channel: IptvChannel; league: TvLeague };

/**
 * Sports replay channels from the viewer's providers ("US | NFL Replay", "NBA Full Games"), by
 * league and best picture first. A whole group named for replays counts, as does a channel named
 * so, but only when it is a sports channel: a league in its group or name, or plainly sports.
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
    .filter(
      (r) =>
        r.league !== "More sports" ||
        SPORTS.test(r.channel.group ?? "") ||
        SPORTS.test(r.channel.name),
    )
    .sort((a, b) => channelQualityOf(b.channel) - channelQualityOf(a.channel));
}
