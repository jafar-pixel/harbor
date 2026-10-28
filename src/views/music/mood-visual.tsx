import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  MOOD_VISUALS,
  readMoodVisual,
  runMoodVisual,
  saveMoodVisual,
  type MoodVisualId,
} from "@/lib/music/sounds/mood-visuals";

function MoodCanvas({ id, className }: { id: Exclude<MoodVisualId, "off">; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) return runMoodVisual(ref.current, id);
  }, [id]);
  return <canvas ref={ref} className={className} aria-hidden />;
}

/** The JL Mood stage: pick a moving light scene to sit with your sounds; go full screen. */
export function MoodVisualStage() {
  const t = useT();
  const [id, setId] = useState<MoodVisualId>(readMoodVisual);
  const [full, setFull] = useState(false);
  const pick = (next: MoodVisualId) => {
    setId(next);
    saveMoodVisual(next);
  };

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Backspace") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  return (
    <section className="mood-visual" aria-label={t("JL Mood visuals")}>
      <div className="mood-visual-picker" role="radiogroup" aria-label={t("Visual")}>
        {MOOD_VISUALS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={id === m.id}
            className="mood-visual-chip"
            onClick={() => pick(m.id)}
          >
            {t(m.name)}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={id === "off"}
          className="mood-visual-chip"
          onClick={() => pick("off")}
        >
          {t("Off")}
        </button>
      </div>
      {id !== "off" && (
        <div className="mood-visual-stage">
          {!full && <MoodCanvas id={id} className="mood-visual-canvas" />}
          <button
            type="button"
            className="mood-visual-full"
            aria-label={t("Full screen")}
            onClick={() => setFull(true)}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      )}
      {full && id !== "off" && (
        <div className="mood-visual-overlay" role="dialog" aria-label={t("JL Mood visuals")}>
          <MoodCanvas id={id} className="mood-visual-canvas" />
          <button
            type="button"
            className="mood-visual-full"
            aria-label={t("Exit full screen")}
            autoFocus
            onClick={() => setFull(false)}
          >
            <Minimize2 size={18} />
          </button>
        </div>
      )}
    </section>
  );
}
