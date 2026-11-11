import { useEffect, useRef } from "react";
import { channelHealth, recordChannelResult } from "@/lib/iptv/channel-health";
import type { IptvChannel } from "@/lib/iptv/types";
import { showNativeTvMessage } from "@/lib/player/native-tv/shell";
import { useGameFeeds } from "@/lib/sports/game-feeds";
import type { PlayerSrc } from "@/lib/view";

/** A live channel that shows no picture by then has failed. */
const LIVE_START_TIMEOUT_MS = 20_000;

/** The next feed of the same game to try after `currentId`, skipping ones known to fail. */
export function nextFeed(
  channels: readonly IptvChannel[],
  currentId: string,
  failing: (url: string) => boolean,
): IptvChannel | null {
  const at = channels.findIndex((c) => c.id === currentId);
  if (at < 0) return null;
  return channels.slice(at + 1).find((c) => !failing(c.url)) ?? null;
}

/**
 * Live channels from the viewer's playlists: records whether each one actually plays here
 * (channel-health.ts), and when a game's feed fails, moves on to the next feed found for that
 * game by itself (game-feeds.ts), saying so on the screen.
 */
export function useLiveFailover({
  src,
  status,
  started,
  channelId,
  switchChannel,
}: {
  src: PlayerSrc;
  status: string;
  started: boolean;
  channelId: string | null;
  switchChannel: (channel: IptvChannel, program?: string) => void;
}) {
  const feeds = useGameFeeds();
  const live = !!channelId && !!src.url;
  const done = useRef<string | null>(null);
  const latest = useRef({ feeds, channelId, switchChannel });
  latest.current = { feeds, channelId, switchChannel };

  useEffect(() => {
    done.current = null;
  }, [src.url]);

  const fail = (url: string) => {
    if (done.current === url) return;
    done.current = url;
    recordChannelResult(url, false);
    const { feeds: now, channelId: id, switchChannel: go } = latest.current;
    if (!now || !id) return;
    const next = nextFeed(now.channels, id, (u) => channelHealth(u) === "failing");
    if (!next) return;
    showNativeTvMessage(`That feed isn't working. Trying ${next.name}…`);
    go(next, now.label);
  };

  useEffect(() => {
    if (!live || !started || done.current === src.url) return;
    done.current = src.url;
    recordChannelResult(src.url, true);
  }, [live, started, src.url]);

  useEffect(() => {
    if (live && status === "error" && !started) fail(src.url);
  }, [live, status, started, src.url]);

  useEffect(() => {
    if (!live) return;
    const url = src.url;
    const timer = window.setTimeout(() => {
      if (done.current !== url) fail(url);
    }, LIVE_START_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [live, src.url]);
}
