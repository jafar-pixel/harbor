import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * Live TV Home's ambient fan art: whatever the remote rests on (a channel, a game, a movie)
 * fills the screen behind the page, fading from one to the next, like a TV home screen. The art
 * is sharp at the top end and melts away toward the start and the bottom (a mask, not a colour
 * over it), so the viewer's own theme backdrop shows through around it.
 */

type Ambient = { key: string; art: React.ReactNode };

const AmbientContext = createContext<(a: Ambient) => void>(() => {});

/** How long the remote rests on something before the backdrop follows it. */
const AMBIENT_DWELL_MS = 350;

/** Props for a focusable card: resting on it (focus or hover) makes its art the backdrop. */
export function useAmbientTarget(key: string, art: () => React.ReactNode) {
  const set = useContext(AmbientContext);
  const show = () => set({ key, art: art() });
  return { onFocus: show, onMouseEnter: show };
}

export function AmbientBackdrop({
  fallback,
  children,
}: {
  /** Shown until something is focused, and whenever this changes (the channel on Your TV). */
  fallback: Ambient | null;
  children: React.ReactNode;
}) {
  const [layers, setLayers] = useState<{ cur: Ambient | null; prev: Ambient | null }>({
    cur: fallback,
    prev: null,
  });
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((a: Ambient) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setLayers((l) => (l.cur?.key === a.key ? l : { cur: a, prev: l.cur }));
    }, AMBIENT_DWELL_MS);
  }, []);
  const fallbackKey = fallback?.key ?? "";
  useEffect(() => {
    if (fallback) show(fallback);
    // Only a new channel on Your TV moves the backdrop back to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackKey, show]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <AmbientContext.Provider value={show}>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-[5] overflow-hidden">
        {layers.prev && <AmbientLayer key={`p:${layers.prev.key}`} art={layers.prev.art} leaving />}
        {layers.cur && <AmbientLayer key={`c:${layers.cur.key}`} art={layers.cur.art} />}
      </div>
      {children}
    </AmbientContext.Provider>
  );
}

function AmbientLayer({ art, leaving = false }: { art: React.ReactNode; leaving?: boolean }) {
  const [on, setOn] = useState(leaving);
  useEffect(() => {
    if (leaving) {
      const id = window.setTimeout(() => setOn(false), 30);
      return () => window.clearTimeout(id);
    }
    const id = window.requestAnimationFrame(() => setOn(true));
    return () => window.cancelAnimationFrame(id);
  }, [leaving]);
  const rtl = typeof document !== "undefined" && document.dir === "rtl";
  const fade = `linear-gradient(to ${rtl ? "right" : "left"}, #000 30%, transparent 100%), linear-gradient(to top, transparent 0%, #000 60%)`;
  return (
    <div
      className="absolute inset-y-0 end-0 w-[78%] transition-opacity duration-700 ease-out"
      style={{
        opacity: on ? 0.8 : 0,
        maskImage: fade,
        WebkitMaskImage: fade,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      <div className="relative h-full w-full">{art}</div>
    </div>
  );
}
