import { Radio } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";
import { qualityLabel } from "@/lib/jl/sports/channels";
import { SportsTvScreen } from "./sports-tv-screen";
import { tuneOrWatch, useSportsTvTuned } from "./sports-tv-tuner";

export type BandItem = {
  key: string;
  title: string;
  subtitle: string;
  live: boolean;
  channels: IptvChannel[];
};

/**
 * The fixed Sports TV for Schedules and Replays: the screen on one side, the channels to put on
 * it on the other. It stays at the top while the page scrolls under it.
 */
export function SportsTvBand({
  heading,
  items,
  emptyList,
  active,
  sourceNames,
  onWatch,
}: {
  heading: string;
  items: BandItem[];
  emptyList: string;
  active: boolean;
  sourceNames: Map<string, string>;
  onWatch: (channel: IptvChannel) => void;
}) {
  const t = useT();
  const tuned = useSportsTvTuned();
  return (
    <div className="sticky top-0 z-30 grid gap-4 bg-canvas/85 px-12 py-3 backdrop-blur-xl lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
      <div className="h-[clamp(280px,42vh,520px)]">
        <SportsTvScreen
          tuned={tuned}
          active={active}
          sourceNames={sourceNames}
          onWatch={onWatch}
          emptyText={t("Pick a channel to put it on. Click it again to watch full screen.")}
        />
      </div>
      <aside className="hot-week harbor-scroll h-[clamp(280px,42vh,520px)] overflow-y-auto">
        <div>
          <h3>{heading}</h3>
        </div>
        {items.map((it) => {
          const ch = it.channels[0];
          const q = ch ? qualityLabel(ch.name) : null;
          return (
            <article className="hot-week-item" key={it.key} aria-current={tuned?.key === it.key}>
              <button
                className="sh-event-open"
                onClick={() => tuneOrWatch(it, onWatch)}
                aria-label={it.title}
              />
              <span className="hot-week-logos is-event">
                {ch?.logo ? (
                  <img
                    src={ch.logo}
                    alt=""
                    draggable={false}
                    className="max-h-9 max-w-[52px] object-contain"
                  />
                ) : (
                  <Radio size={22} />
                )}
              </span>
              <span className="hot-week-copy">
                <small>
                  {it.live ? `● ${t("Live")} · ` : ""}
                  {it.subtitle}
                  {q ? ` · ${q}` : ""}
                </small>
                <strong dir="auto">{it.title}</strong>
              </span>
            </article>
          );
        })}
        {!items.length && <p>{emptyList}</p>}
      </aside>
    </div>
  );
}
