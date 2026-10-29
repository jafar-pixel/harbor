import { Check, Gauge } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { PlayerBridge } from "@/lib/player/bridge";
import { qualityLabel, writeStreamQualityPref } from "@/lib/player/html5/hls-quality";
import { Tooltip } from "@/components/player/transport/tooltip";
import { useT } from "@/lib/i18n";

/** Picks the rendition of an adaptive stream the browser player is showing. */
export function StreamQualityControl({
  bridgeRef,
  levels,
  cap,
  theme,
}: {
  bridgeRef: RefObject<PlayerBridge | null>;
  levels: number[];
  cap: number | null;
  theme: "default" | "stremio";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (levels.length < 2) return null;

  const choose = (height: number | null) => {
    setOpen(false);
    writeStreamQualityPref(height);
    bridgeRef.current?.setQualityCap?.(height);
  };
  const label = cap == null ? t("Auto") : qualityLabel(cap);
  const options: { height: number | null; label: string }[] = [
    { height: null, label: t("Auto") },
    ...levels.map((h) => ({ height: h, label: qualityLabel(h) })),
  ];
  return (
    <div
      ref={wrap}
      className="pointer-events-auto relative z-[190] flex flex-col items-center"
      onClick={(event) => event.stopPropagation()}
    >
      {open && (
        <div className="absolute bottom-[calc(100%+12px)] left-1/2 w-48 max-w-[calc(100vw-32px)] -translate-x-1/2 animate-menu-pop overflow-hidden rounded-md bg-elevated p-1.5 text-ink shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)]">
          <div className="px-3 pb-2 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t("Quality")}
          </div>
          {options.map((o) => {
            const active = o.height === cap;
            return (
              <button
                key={o.height ?? "auto"}
                type="button"
                onClick={() => choose(o.height)}
                className={`flex h-9 w-full items-center justify-between rounded px-3 text-start text-[12.5px] transition-colors ${active ? "bg-accent text-white" : "text-ink-muted hover:bg-white/10 hover:text-ink"}`}
              >
                <span>{o.label}</span>
                {active && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
      <Tooltip label={`${t("Quality")} · ${label}`}>
        <button
          type="button"
          aria-label={`${t("Quality")}: ${label}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={`${theme === "default" ? "h-11 min-w-11" : "h-10 min-w-10"} flex items-center justify-center gap-1 rounded-full px-2 transition-[background-color,color] ${open ? "bg-white/22 text-white hover:bg-white/30" : "text-white/85 hover:bg-white/10 hover:text-white"}`}
        >
          <Gauge size={22} strokeWidth={1.9} />
          {cap != null && (
            <span className="text-[11px] font-bold tabular-nums tracking-wider">{label}</span>
          )}
        </button>
      </Tooltip>
    </div>
  );
}
