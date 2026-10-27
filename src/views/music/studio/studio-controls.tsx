import type { CSSProperties } from "react";

/**
 * A rotary knob drawn as an arc over a native range input, so mouse, touch, keyboard and the TV
 * remote all work like any slider. Double-click resets it.
 */
export function Knob({
  label,
  value,
  min,
  max,
  center = 0,
  step = 0.01,
  onChange,
  tone,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  center?: number;
  step?: number;
  onChange: (value: number) => void;
  tone?: string;
}) {
  const t = (value - min) / (max - min);
  const angle = -135 + t * 270;
  return (
    <label
      className="studio-knob"
      style={{ "--knob-angle": `${angle}deg`, "--knob-tone": tone } as CSSProperties}
      onDoubleClick={() => onChange(center)}
    >
      <span className="studio-knob-dial" aria-hidden="true">
        <span className="studio-knob-mark" />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="studio-knob-label">{label}</span>
    </label>
  );
}

/** A vertical fader (channel volume or pitch). */
export function Fader({
  label,
  value,
  min,
  max,
  step = 0.001,
  onChange,
  onReset,
  className = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onReset?: () => void;
  className?: string;
}) {
  return (
    <span className={`studio-fader ${className}`} onDoubleClick={onReset}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </span>
  );
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
