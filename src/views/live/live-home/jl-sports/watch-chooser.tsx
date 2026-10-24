import { ExternalLink, Info, Play, Radio, Tv } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";
import { isStreamingOnly, type GameChannelSource } from "@/lib/jl/sports/channels";
import { streamProvider } from "@/lib/jl/sports/college-games";
import { useWatchStream } from "@/views/sports-pages/college-ui";
import { watchGameOn } from "@/lib/jl/sports/now-watching";
import type { SportsGame } from "@/lib/sports/espn";
import { JlDialog } from "./jl-dialog";
import type { JlHubGame } from "./use-jl-sports";

const SOURCE_LABEL: Record<GameChannelSource, string> = {
  event: "Game feed",
  network: "Network",
  guide: "From the TV guide",
};

const BOXCAST_URL = "https://boxcast.tv/";

/** Every way to watch a game: your M3U channels first, then anything else. Nothing plays until you pick. */
export function WatchChooser({
  item,
  onPlay,
  onOpenGame,
  onClose,
}: {
  item: JlHubGame;
  onPlay: (channel: IptvChannel) => void;
  onOpenGame: (game: SportsGame) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { game, channels } = item;
  const title = `${game.away.location || game.away.name} ${t("at")} ${game.home.location || game.home.name}`;
  const watchStream = useWatchStream();
  const stream = game.stream ?? null;
  const streamBy = stream ? streamProvider(stream) : null;
  // The school's own stream replaces the network line; BoxCast is always on offer.
  const network = stream ? null : (game.network ?? null);
  const streaming = network && isStreamingOnly(network);
  const play = (url: string, by: string) => {
    onClose();
    watchStream(url, title, by);
  };
  return (
    <JlDialog title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {t("Your channels")}
          </h3>
          {channels.length === 0 && (
            <p className="text-[13px] text-ink-subtle">
              {t("None of your channels lists this game yet.")}
            </p>
          )}
          {channels.map((c) => (
            <button
              key={c.channel.id}
              onClick={() => {
                onClose();
                watchGameOn(c.channel, game, onPlay);
              }}
              className="flex items-center gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-3.5 py-2.5 text-start transition-colors hover:border-edge focus:border-ink-subtle focus:outline-none"
            >
              {c.channel.logo ? (
                <img
                  src={c.channel.logo}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded object-contain"
                  loading="lazy"
                />
              ) : (
                <Tv size={18} className="shrink-0 text-ink-subtle" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13.5px] font-medium text-ink">
                  {c.channel.name}
                </span>
                <span className="text-[11.5px] text-ink-subtle">
                  {t(SOURCE_LABEL[c.via])}
                  {c.alternate ? ` · ${t("Alternate language")}` : ""}
                </span>
              </span>
              <Play
                size={14}
                fill="currentColor"
                strokeWidth={0}
                className="shrink-0 text-accent"
              />
            </button>
          ))}
        </section>
        <section className="flex flex-col gap-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {t("Other ways to watch")}
          </h3>
          {stream && streamBy && (
            <button
              onClick={() => play(stream, streamBy)}
              className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-2.5 text-start text-[13.5px] font-medium text-ink transition-colors hover:border-accent focus:border-ink-subtle focus:outline-none"
            >
              <Radio size={15} className="shrink-0 text-accent" />
              <span className="flex-1">{t("Watch on {network}", { network: t(streamBy) })}</span>
              <Play
                size={14}
                fill="currentColor"
                strokeWidth={0}
                className="shrink-0 text-accent"
              />
            </button>
          )}
          {streamBy !== "BoxCast" && (
            <button
              onClick={() => play(BOXCAST_URL, "BoxCast")}
              className="flex items-center gap-3 rounded-xl border border-edge-soft/60 px-3.5 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:border-edge hover:text-ink focus:border-ink-subtle focus:outline-none"
            >
              <Radio size={15} className="shrink-0 text-ink-subtle" />
              {t("Find it on BoxCast")}
            </button>
          )}
          {network && (
            <div className="flex items-center gap-3 rounded-xl border border-edge-soft/60 px-3.5 py-2.5 text-[13px] text-ink-muted">
              <ExternalLink size={15} className="shrink-0 text-ink-subtle" />
              {streaming
                ? t("Streaming on {network}", { network })
                : t("Broadcast on {network}", { network })}
            </div>
          )}
          <button
            onClick={() => {
              onClose();
              onOpenGame(game);
            }}
            className="flex items-center gap-3 rounded-xl border border-edge-soft/60 px-3.5 py-2.5 text-start text-[13px] text-ink-muted transition-colors hover:border-edge hover:text-ink focus:border-ink-subtle focus:outline-none"
          >
            <Info size={15} className="shrink-0 text-ink-subtle" />
            {t("Game details and live field")}
          </button>
        </section>
      </div>
    </JlDialog>
  );
}
