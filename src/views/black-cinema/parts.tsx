import { useEffect, useRef, useState, type ReactNode } from "react";
import { Heart } from "lucide-react";
import { PickCard } from "@/components/pick-card";
import { Row, usePosterRow } from "@/components/row";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";

/**
 * A heart on a Black Cinema title: adds it to the viewer's favorites (the app's Watchlist, the same
 * list as the bookmark everywhere else) or takes it out.
 */
export function FavoriteHeart({ meta, className = "" }: { meta: Meta; className?: string }) {
  const t = useT();
  const on = useInWatchlist(meta.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? t("Remove from favorites") : t("Add to favorites")}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWatchlist({
          id: meta.id,
          type: meta.type,
          name: meta.name,
          poster: meta.poster,
          imdbId: meta.id.startsWith("tt") ? meta.id : null,
        });
      }}
      className={`grid size-9 place-items-center rounded-full bg-canvas/70 ring-1 ring-edge-soft/60 backdrop-blur-md transition-colors hover:bg-canvas/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${
        on ? "text-danger" : "text-ink"
      } ${className}`}
    >
      <Heart size={17} strokeWidth={on ? 0 : 2} fill={on ? "currentColor" : "none"} />
    </button>
  );
}

/** A card with its heart in the top corner. */
export function WithHeart({ meta, children }: { meta: Meta; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <FavoriteHeart meta={meta} className="absolute end-2 top-2 z-10" />
    </div>
  );
}

/**
 * Builds its row only once the page scrolls near it: the hub has over thirty rows, and building
 * them all at once kept a TV busy long before the first ones could be used.
 */
export function NearView({
  children,
  minHeight = 300,
}: {
  children: ReactNode;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return near ? <>{children}</> : <div ref={ref} style={{ minHeight }} aria-hidden />;
}

/** A poster row of Black Cinema titles, each with a heart. */
export function BlackCinemaShelf({
  title,
  kicker,
  items,
  scrollKey,
  onViewAll,
}: {
  title: string;
  kicker?: string;
  items: Meta[];
  scrollKey: string;
  onViewAll?: () => void;
}) {
  const sizing = usePosterRow();
  if (items.length === 0) return null;
  return (
    <Row
      {...sizing}
      title={
        <span className="flex flex-col gap-0.5">
          <span className="text-[17px] font-medium tracking-tight text-ink">{title}</span>
          {kicker && <span className="text-[12px] font-medium text-ink-subtle">{kicker}</span>}
        </span>
      }
      scrollKey={scrollKey}
      onViewAll={onViewAll}
    >
      {items.map((m) => (
        <WithHeart key={m.id} meta={m}>
          <PickCard meta={m} />
        </WithHeart>
      ))}
    </Row>
  );
}
