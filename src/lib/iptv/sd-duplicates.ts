import { isSdChannel } from "../jl/sports/channels.ts";
import { channelKey } from "../jl/sports/sports-channels.ts";
import type { IptvChannel } from "./types";

/**
 * Drops a channel's SD copy when the same channel is in the list in better quality ("USA ESPN
 * SD" beside "USA ESPN HD" or "UHD"). A channel that only exists in SD stays.
 */
export function hideSdDuplicates(channels: IptvChannel[]): IptvChannel[] {
  const better = new Set<string>();
  for (const c of channels) if (!isSdChannel(c.name)) better.add(channelKey(c.name));
  return channels.filter((c) => !isSdChannel(c.name) || !better.has(channelKey(c.name)));
}
