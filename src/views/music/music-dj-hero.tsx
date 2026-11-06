import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { useT } from "@/lib/i18n";
import { VIBES, type Vibe } from "@/lib/music/dj/vibes";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import "./music-dj-hero.css";

/** Featured vibes after the welcome slide. */
const FEATURED = VIBES.slice(0, 6);
const ROTATE_MS = 8000;
const SWIPE_PX = 50;
/** The welcome slide's colours: JL orange, magenta and violet. */
const JL_COLORS: [string, string, string] = ["#f97316", "#db2777", "#7c3aed"];

type Slide = {
  key: string;
  colors: [string, string, string];
  eyebrow: string[];
  points: string[];
  /** The big centred title; `dot` puts a gradient dot between its two parts. */
  title: [string, string] | string;
  chips: string[];
  badge: string;
  vibe?: Vibe;
};

/**
 * Ask JL's welcome before a set starts: rotating poster slides (glossy ribbons and spheres on
 * deep navy, a huge centred title, chips beneath). First what Ask JL is, then featured vibes
 * with a button to start each. It turns on its own and holds while the pointer or focus is on
 * it (and never turns with reduced motion); arrows, dots and a swipe move it by hand.
 */
export function DjHero({ onStart }: { onStart: (vibe: Vibe) => void }) {
  const t = useT();
  const reduce = useReducedMotion();
  const slides: Slide[] = [
    {
      key: "ask-jl",
      colors: JL_COLORS,
      eyebrow: [t("Your AI DJ"), t("Music videos, mixed live"), t("By JL Media Vision")],
      points: [t("50-song sets"), t("Any vibe, any genre"), t("Never runs out")],
      title: ["Ask", "JL"],
      chips: [t("Name a vibe"), t("JL mixes the top 50"), t("It keeps going")],
      badge: t("AI DJ · JL Media Vision · "),
    },
    ...FEATURED.map((vibe): Slide => ({
      key: vibe.id,
      colors: [vibe.colors[0], vibe.colors[1], JL_COLORS[1]],
      eyebrow: [t("Featured vibe"), t("50-song set"), t("Ask JL")],
      points: [t("Music videos"), t("Mixed like a club set"), t("Keeps refilling")],
      title: t(vibe.name),
      chips: [t(vibe.prompt)],
      badge: t("Start this vibe · Ask JL · "),
      vibe,
    })),
  ];
  const count = slides.length;
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
      {slides.map((s, i) => {
        const on = index === i;
        return (
          <div
            key={s.key}
            className="dj-hero-slide"
            data-on={on}
            aria-hidden={!on}
            style={
              {
                "--c1": s.colors[0],
                "--c2": s.colors[1],
                "--c3": s.colors[2],
              } as CSSProperties
            }
          >
            <Shapes colors={s.colors} />
            <ul className="dj-hero-eyebrow">
              {s.eyebrow.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <ul className="dj-hero-points">
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Badge text={s.badge} />
            <div className="dj-hero-center">
              {Array.isArray(s.title) ? (
                <h2 className="dj-hero-word">
                  {s.title[0]}
                  <span className="dj-hero-dot" aria-hidden="true" />
                  {s.title[1]}
                </h2>
              ) : (
                <h2 className="dj-hero-word dj-hero-word-vibe">{s.title}</h2>
              )}
              <p className="dj-hero-chips">
                {s.chips.map((c, ci) => (
                  <span key={c}>
                    {ci > 0 && <ArrowRight size={14} aria-hidden="true" />}
                    <em>{c}</em>
                  </span>
                ))}
              </p>
              {s.vibe && (
                <button
                  type="button"
                  className="dj-hero-start"
                  tabIndex={on ? 0 : -1}
                  onClick={() => onStart(s.vibe!)}
                >
                  <Play size={18} /> {t("Start this vibe")}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="dj-hero-nav">
        <button type="button" aria-label={t("Previous slide")} onClick={() => go(index - 1)}>
          <ChevronLeft size={18} />
        </button>
        <div className="dj-hero-dots">
          {slides.map((s, i) => (
            <button
              key={s.key}
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

/** Glossy ribbons and spheres in the slide's three colours. */
function Shapes({ colors: [a, b, c] }: { colors: [string, string, string] }) {
  const id = useId().replace(/:/g, "");
  const g = (name: string) => `url(#${id}-${name})`;
  return (
    <svg
      className="dj-hero-shapes"
      viewBox="0 0 1600 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-ribbon`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="0.55" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
        <linearGradient id={`${id}-ribbon2`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} />
          <stop offset="1" stopColor={a} />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-ball1`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.18" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </radialGradient>
        <radialGradient id={`${id}-ball2`} cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.2" stopColor={c} />
          <stop offset="1" stopColor="#0b1030" />
        </radialGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={b} stopOpacity="0.45" />
          <stop offset="1" stopColor={b} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="800" cy="360" rx="620" ry="300" fill={g("glow")} />
      <g className="dj-hero-float">
        <path
          d="M-80 560 C 180 380, 300 760, 560 560 S 900 420, 980 640"
          fill="none"
          stroke={g("ribbon")}
          strokeWidth="70"
          strokeLinecap="round"
        />
        <path
          d="M-80 560 C 180 380, 300 760, 560 560 S 900 420, 980 640"
          fill="none"
          stroke={g("shine")}
          strokeWidth="26"
          strokeLinecap="round"
          transform="translate(0 -14)"
        />
      </g>
      <g className="dj-hero-float dj-hero-float-2">
        <path
          d="M1700 120 C 1480 40, 1380 260, 1220 180 S 1020 30, 1060 -60"
          fill="none"
          stroke={g("ribbon2")}
          strokeWidth="56"
          strokeLinecap="round"
        />
        <path
          d="M1700 120 C 1480 40, 1380 260, 1220 180 S 1020 30, 1060 -60"
          fill="none"
          stroke={g("shine")}
          strokeWidth="20"
          strokeLinecap="round"
          transform="translate(0 -12)"
        />
      </g>
      <g className="dj-hero-float dj-hero-float-3">
        <circle cx="600" cy="120" r="48" fill={g("ball1")} />
        <circle cx="1420" cy="560" r="92" fill={g("ball2")} />
        <circle cx="1180" cy="610" r="30" fill={g("ball1")} />
        <circle cx="860" cy="70" r="16" fill={g("ball2")} />
      </g>
      <g className="dj-hero-float dj-hero-float-2">
        <path
          d="M1240 700 C 1300 560, 1480 600, 1520 460 S 1640 320, 1720 380"
          fill="none"
          stroke={g("ribbon")}
          strokeWidth="44"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** A round badge with its text running around the edge. */
function Badge({ text }: { text: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="dj-hero-badge" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <path id={`${id}-ring`} d="M100 100 m-74 0 a74 74 0 1 1 148 0 a74 74 0 1 1 -148 0" />
      </defs>
      <circle cx="100" cy="100" r="96" className="dj-hero-badge-disc" />
      <g className="dj-hero-badge-spin">
        <text>
          <textPath href={`#${id}-ring`} textLength="458" lengthAdjust="spacing">
            {text.repeat(2)}
          </textPath>
        </text>
      </g>
      <circle cx="100" cy="100" r="30" className="dj-hero-badge-core" />
      <path d="M92 86 L114 100 L92 114 Z" fill="#fff" />
    </svg>
  );
}
