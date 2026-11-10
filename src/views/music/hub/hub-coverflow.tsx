import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useT } from "@/lib/i18n";

export type CoverflowSlide = {
  key: string;
  image: string | null;
  title: string;
  subtitle: string;
  play: () => void;
  /** Shows what is inside (a playlist's songs); the centre card's title opens it. */
  open?: () => void;
};

const ADVANCE_MS = 6000;
/** Cards drawn each side of the centre one. */
const SIDE = 2;

/** Where slide `i` sits relative to the centre one, wrapping round: -1 is just left of it. */
export function coverflowOffset(i: number, active: number, count: number): number {
  let d = (((i - active) % count) + count) % count;
  if (d > count / 2) d -= count;
  return d;
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/**
 * The Music Hub's opening carousel: the listener's own songs and playlists as large cards, the
 * centre one with its title and a play button, the rest fanned out behind it. It moves on by
 * itself unless the pointer or focus is on it (or the viewer asked for less motion).
 */
export function HubCoverflow({
  slides,
  active: shown,
  onActive,
}: {
  slides: CoverflowSlide[];
  /** The centre card when a list beside the carousel picks it; the carousel keeps its own otherwise. */
  active?: number;
  onActive?: (index: number) => void;
}) {
  const t = useT();
  const [own, setOwn] = useState(0);
  const [held, setHeld] = useState(false);
  const count = slides.length;
  const at = count ? (shown ?? own) % count : 0;
  const setActive = (i: number) => (onActive ?? setOwn)(i);

  useEffect(() => {
    if (held || count < 2 || reducedMotion()) return;
    const timer = window.setTimeout(() => (onActive ?? setOwn)((at + 1) % count), ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [at, held, count, onActive]);

  if (!count) return null;
  const go = (step: number) => setActive((((at + step) % count) + count) % count);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else return;
    e.preventDefault();
  };

  return (
    <section
      className="hub-flow"
      aria-roledescription="carousel"
      aria-label={t("Your music")}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
      }}
      onKeyDown={onKey}
    >
      <div className="hub-flow-track">
        {slides.map((s, i) => {
          const d = coverflowOffset(i, at, count);
          // Only the cards on show and the next one each side are drawn, so a long list of
          // playlists doesn't load every cover at once (the TV app has little memory to spare).
          if (Math.abs(d) > SIDE + 1) return null;
          const far = Math.abs(d) > SIDE;
          const centre = d === 0;
          return (
            <div
              key={s.key}
              className="hub-flow-card"
              data-centre={centre}
              aria-hidden={!centre}
              style={{ "--d": d, "--ad": Math.abs(d) } as CSSProperties}
              data-far={far}
            >
              {s.image ? (
                <img src={s.image} alt="" loading={Math.abs(d) <= 1 ? "eager" : "lazy"} />
              ) : (
                <span className="hub-flow-noart" aria-hidden="true">
                  {s.title.slice(0, 1)}
                </span>
              )}
              {centre ? (
                <div className="hub-flow-caption">
                  <div className="hub-flow-text">
                    {s.open ? (
                      <button
                        type="button"
                        className="hub-flow-open"
                        title={t("Show songs")}
                        onClick={s.open}
                      >
                        {s.title}
                      </button>
                    ) : (
                      <strong>{s.title}</strong>
                    )}
                    <span>{s.subtitle}</span>
                  </div>
                  <button
                    type="button"
                    className="hub-flow-play"
                    aria-label={`${t("Play")} ${s.title}`}
                    onClick={s.play}
                  >
                    <Play size={26} />
                  </button>
                </div>
              ) : (
                !far && (
                  <button
                    type="button"
                    className="hub-flow-pick"
                    tabIndex={-1}
                    aria-label={s.title}
                    onClick={() => setActive(i)}
                  />
                )
              )}
            </div>
          );
        })}
      </div>
      {count > 1 && (
        <div className="hub-flow-nav">
          <button
            type="button"
            className="hub-flow-arrow"
            aria-label={t("Previous")}
            onClick={() => go(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          {count <= 12 ? (
            <div className="hub-flow-dots" aria-hidden="true">
              {slides.map((s, i) => (
                <span key={s.key} data-on={i === at} />
              ))}
            </div>
          ) : (
            <span className="hub-flow-count">
              {at + 1} / {count}
            </span>
          )}
          <button
            type="button"
            className="hub-flow-arrow"
            aria-label={t("Next")}
            onClick={() => go(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </section>
  );
}
