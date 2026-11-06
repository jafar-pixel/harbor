import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, Play, Radio } from "lucide-react";
import jlBackdrop from "@/assets/brand/jl-vision-backdrop.webp";
import jlMark from "@/assets/brand/jl-particle.webp";
import { useT } from "@/lib/i18n";
import { coverArt } from "@/lib/music/cover-art";
import { VIBES, type Vibe } from "@/lib/music/dj/vibes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import "./music-dj-hero.css";

/** Featured vibes after the welcome slide. */
const FEATURED = VIBES.slice(0, 6);
const ROTATE_MS = 8000;
const SWIPE_PX = 50;

/**
 * Ask JL's welcome before a set starts: rotating slides, first what Ask JL is, then featured
 * vibes with a button to start each. It turns on its own and stops while the pointer or focus
 * is on it (and never turns with reduced motion); arrows, dots and a swipe move it by hand.
 */
export function DjHero({ onStart }: { onStart: (vibe: Vibe) => void }) {
  const t = useT();
  const reduce = useReducedMotion();
  const count = FEATURED.length + 1;
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const swipe = useRef<number | null>(null);

  const go = (to: number) => setIndex(((to % count) + count) % count);

  useEffect(() => {
    if (held || reduce) return;
    const timer = window.setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [index, held, reduce, count]);

  const onPointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    swipe.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (swipe.current === null) return;
    const dx = e.clientX - swipe.current;
    swipe.current = null;
    if (Math.abs(dx) >= SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <section
      className="dj-hero"
      aria-roledescription={t("carousel")}
      aria-label={t("Ask JL")}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipe.current = null)}
    >
      <div className="dj-hero-slide" data-on={index === 0} aria-hidden={index !== 0}>
        <div className="dj-hero-art" aria-hidden="true">
          <img className="dj-hero-wave" src={jlBackdrop} alt="" />
          <div className="dj-hero-record">
            <span className="dj-hero-grooves" />
            <img className="dj-hero-label" src={jlMark} alt="" />
          </div>
          <div className="dj-hero-eq">
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} style={{ animationDelay: `${(i % 6) * -0.19}s` }} />
            ))}
          </div>
        </div>
        <div className="dj-hero-text">
          <p className="dj-hero-eyebrow">
            <Radio size={14} /> {t("JL Media Vision · AI DJ")}
          </p>
          <h2>{t("Ask JL")}</h2>
          <p className="dj-hero-tag">{t("Your AI DJ. Name a vibe, get the top 50.")}</p>
          <ol className="dj-hero-steps">
            <li>
              <b>1</b> {t("Pick a vibe or type your own")}
            </li>
            <li>
              <b>2</b> {t("JL mixes 50 music videos like a club set")}
            </li>
            <li>
              <b>3</b> {t("The set keeps going until you stop it")}
            </li>
          </ol>
        </div>
      </div>

      {FEATURED.map((vibe, i) => {
        const on = index === i + 1;
        return (
          <div
            key={vibe.id}
            className="dj-hero-slide dj-hero-vibe"
            data-on={on}
            aria-hidden={!on}
            style={{ "--v-a": vibe.colors[0], "--v-b": vibe.colors[1] } as CSSProperties}
          >
            <div className="dj-hero-art" aria-hidden="true">
              <div className="dj-hero-record dj-hero-record-behind">
                <span className="dj-hero-grooves" />
              </div>
              <img
                className="dj-hero-cover"
                src={coverArt(t(vibe.name), t("AI DJ vibe"), vibe.colors)}
                alt=""
              />
            </div>
            <div className="dj-hero-text">
              <p className="dj-hero-eyebrow">
                <Radio size={14} /> {t("Featured vibe · 50-song set")}
              </p>
              <h2 className="dj-hero-vibe-name">{t(vibe.name)}</h2>
              <p className="dj-hero-tag">{t(vibe.prompt)}</p>
              <button
                type="button"
                className="dj-hero-start"
                tabIndex={on ? 0 : -1}
                onClick={() => onStart(vibe)}
              >
                <Play size={18} /> {t("Start this vibe")}
              </button>
            </div>
          </div>
        );
      })}

      <div className="dj-hero-nav">
        <button type="button" aria-label={t("Previous slide")} onClick={() => go(index - 1)}>
          <ChevronLeft size={18} />
        </button>
        <div className="dj-hero-dots">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${t("Slide")} ${i + 1}`}
              aria-current={index === i}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button type="button" aria-label={t("Next slide")} onClick={() => go(index + 1)}>
          <ChevronRight size={18} />
        </button>
      </div>
    </section>
  );
}
