import { useEffect, useRef, type CSSProperties } from "react";
import type { StudioDeck } from "@/lib/music/studio/deck";

/** 33⅓ RPM: degrees the record turns per second of audio. */
const DEG_PER_SEC = (100 / 3 / 60) * 360;

/**
 * A turntable: a metal platter with strobe dots, a black vinyl record with grooves and the album
 * cover on its label, light that stays put while the record spins, and a tonearm that tracks
 * across the record as the song plays. Dragging the record scratches while stopped and bends
 * the tempo while playing.
 */
export function Turntable({ deck, art }: { deck: StudioDeck; art?: string | null }) {
  const record = useRef<HTMLDivElement>(null);
  const arm = useRef<SVGGElement>(null);
  const drag = useRef<{ angle: number; at: number } | null>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const pos = deck.position;
      if (record.current)
        record.current.style.transform = `rotate(${(pos * DEG_PER_SEC) % 360}deg)`;
      if (arm.current) {
        // Rest off the record with nothing loaded; otherwise lead-in to run-out.
        const progress = deck.duration ? pos / deck.duration : 0;
        const angle = deck.track ? -1 + progress * 19 : -22;
        arm.current.setAttribute("transform", `rotate(${angle} 168 30)`);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [deck]);

  const angleOf = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return (
      (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) /
      Math.PI
    );
  };
  const release = () => {
    drag.current = null;
    deck.setBend(0);
  };

  return (
    <div
      className={`tt${deck.playing ? " is-playing" : ""}${deck.track ? " is-loaded" : ""}`}
      aria-hidden="true"
    >
      <div
        className="tt-platter"
        onPointerDown={(e) => {
          if (!deck.track) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { angle: angleOf(e), at: performance.now() };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const now = angleOf(e);
          let delta = now - d.angle;
          if (delta > 180) delta -= 360;
          if (delta < -180) delta += 360;
          d.angle = now;
          const seconds = delta / DEG_PER_SEC;
          if (deck.playing) {
            const dt = Math.max(1, performance.now() - d.at) / 1000;
            deck.setBend(Math.max(-0.6, Math.min(0.6, seconds / dt / 3)));
          } else {
            deck.seek(deck.position + seconds);
          }
          d.at = performance.now();
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="tt-strobe" />
        <div ref={record} className="tt-record">
          <div className="tt-grooves" />
          <div
            className="tt-label"
            style={art ? ({ backgroundImage: `url("${art}")` } as CSSProperties) : undefined}
          />
        </div>
        <div className="tt-sheen" />
        <div className="tt-spindle" />
      </div>
      <svg className="tt-arm" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="tt-metal" x1="0" x2="1">
            <stop offset="0" stopColor="#6d727c" />
            <stop offset="0.45" stopColor="#e8ebf0" />
            <stop offset="1" stopColor="#8a8f99" />
          </linearGradient>
          <radialGradient id="tt-base" cx="0.4" cy="0.35">
            <stop offset="0" stopColor="#4a4e57" />
            <stop offset="1" stopColor="#15171b" />
          </radialGradient>
        </defs>
        <circle cx="168" cy="30" r="20" fill="url(#tt-base)" stroke="#2c2f36" strokeWidth="2" />
        <g ref={arm}>
          <rect x="164" y="2" width="8" height="18" rx="3" fill="#2a2d33" />
          <path
            d="M168 30 L168 120 Q168 138 150 150 L132 162"
            fill="none"
            stroke="url(#tt-metal)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path d="M122 158 L140 150 L148 166 L130 174 Z" fill="#1b1d22" stroke="#4b4f58" />
          <rect x="131" y="166" width="6" height="5" fill="#d9dde4" />
        </g>
        <circle cx="168" cy="30" r="6" fill="#c9cdd4" />
      </svg>
    </div>
  );
}
