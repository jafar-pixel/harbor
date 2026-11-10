import { useEffect, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useT } from "@/lib/i18n";

export type CoverflowSlide = {
  key: string;
  image: string;
  title: string;
  subtitle: string;
  play: () => void;
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
export function HubCoverflow({ slides }: { slides: CoverflowSlide[] }) {
  const t = useT();
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  const count = slides.length;
  const at = count ? active % count : 0;

  useEffect(() => {
    if (held || count < 2 || reducedMotion()) return;
    const timer = window.setTimeout(() => setActive((a) => (a + 1) % count), ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, held, count]);

  if (!count) return null;
  const go = (step: number) => setActive((a) => (((a + step) % count) + count) % count);
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
              <img src={s.image} alt="" loading={Math.abs(d) <= 1 ? "eager" : "lazy"} />
              {centre ? (
                <div className="hub-flow-caption">
                  <div className="hub-flow-text">
                    <strong>{s.title}</strong>
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
          <div className="hub-flow-dots" aria-hidden="true">
            {slides.map((s, i) => (
              <span key={s.key} data-on={i === at} />
            ))}
          </div>
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
