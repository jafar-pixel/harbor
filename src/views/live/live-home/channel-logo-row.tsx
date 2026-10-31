import { useState } from "react";
import { Tv } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { IptvChannel } from "@/lib/iptv/types";

/**
 * A strip of channel logos under Your TV, like the app row on a TV home screen. A click puts the
 * channel on Your TV; a click on the channel already on it opens it full screen.
 */
export function ChannelLogoRow({
  title,
  channels,
  tunedId,
  onTune,
}: {
  title: string;
  channels: IptvChannel[];
  tunedId: string | null;
  onTune: (ch: IptvChannel) => void;
}) {
  if (channels.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="ps-[9px] text-[17px] font-semibold text-ink">{title}</h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {channels.map((ch) => (
          <LogoTile key={ch.id} channel={ch} tuned={ch.id === tunedId} onTune={onTune} />
        ))}
      </div>
    </section>
  );
}

function LogoTile({
  channel,
  tuned,
  onTune,
}: {
  channel: IptvChannel;
  tuned: boolean;
  onTune: (ch: IptvChannel) => void;
}) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const logo = !failed && channel.logo ? channel.logo : "";
  return (
    <button
      type="button"
      onClick={() => onTune(channel)}
      title={channel.name}
      aria-label={channel.name}
      aria-current={tuned || undefined}
      className={`flex h-[84px] w-[150px] shrink-0 items-center justify-center rounded-lg bg-white/[0.07] p-3 ring-1 transition-[box-shadow,background-color] duration-150 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
        tuned ? "ring-2 ring-accent" : "ring-edge-soft/40"
      }`}
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-full max-w-full object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
        />
      ) : (
        <span className="flex min-w-0 flex-col items-center gap-1 text-ink-muted">
          <Tv size={18} />
          <span dir="auto" className="w-full truncate text-[12px] font-medium">
            {channel.name || t("Channel")}
          </span>
        </span>
      )}
    </button>
  );
}
