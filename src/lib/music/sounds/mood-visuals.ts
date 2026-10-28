/**
 * JL Mood visuals: our own moving light clips, drawn live on a canvas so nothing is downloaded
 * or licensed. Each scene is a small generative loop (soft gradients, drifting light, bokeh) that
 * sits behind Moods & Sounds.
 */

export const MOOD_VISUALS = [
  { id: "abstract", name: "Abstract" },
  { id: "background", name: "Background" },
  { id: "moving", name: "Moving Backgrounds" },
  { id: "light", name: "Light" },
  { id: "texture", name: "Texture" },
  { id: "lights", name: "Lights" },
  { id: "bokeh", name: "Bokeh" },
] as const;

export type MoodVisualId = (typeof MOOD_VISUALS)[number]["id"] | "off";

const KEY = "jl.music.moodVisual.v1";

export function readMoodVisual(): MoodVisualId {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "off" || MOOD_VISUALS.some((m) => m.id === v)) return v as MoodVisualId;
  } catch {
    /* storage blocked */
  }
  return "abstract";
}

export function saveMoodVisual(id: MoodVisualId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage blocked: lasts this visit */
  }
}

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

/** Small deterministic random so a scene looks the same on every visit. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const blob = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `hsla(${color}, ${alpha})`);
  g.addColorStop(1, `hsla(${color}, 0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
};

function base(ctx: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

const SCENES: Record<Exclude<MoodVisualId, "off">, Draw> = {
  // Big slow colour fields that swirl around each other.
  abstract: (ctx, w, h, t) => {
    base(ctx, w, h, "#120b2e", "#04131f");
    ctx.globalCompositeOperation = "lighter";
    const hues = ["280,90%,62%", "195,95%,55%", "330,90%,60%", "160,80%,50%"];
    hues.forEach((hue, i) => {
      const a = t * 0.00012 * (i + 1) + i * 1.7;
      blob(
        ctx,
        w * (0.5 + 0.32 * Math.cos(a)),
        h * (0.5 + 0.3 * Math.sin(a * 1.3)),
        Math.max(w, h) * 0.45,
        hue,
        0.45,
      );
    });
    ctx.globalCompositeOperation = "source-over";
  },
  // A calm, nearly still wash for reading and working.
  background: (ctx, w, h, t) => {
    const shift = Math.sin(t * 0.00005) * 20;
    base(ctx, w, h, `hsl(${215 + shift}, 45%, 22%)`, `hsl(${250 + shift}, 40%, 12%)`);
    blob(ctx, w * 0.25, h * 0.3, w * 0.6, "205,70%,60%", 0.18);
    blob(ctx, w * 0.8, h * 0.75, w * 0.5, "265,60%,60%", 0.16);
  },
  // Flowing ribbons of light.
  moving: (ctx, w, h, t) => {
    base(ctx, w, h, "#050a1c", "#0c0420");
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const y =
          h * (0.3 + i * 0.1) +
          Math.sin(x * 0.004 + t * 0.0006 + i) * h * 0.12 +
          Math.sin(x * 0.011 - t * 0.0004 * (i + 1)) * h * 0.04;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsla(${190 + i * 28}, 90%, 60%, 0.35)`;
      ctx.lineWidth = 2 + i * 1.5;
      ctx.shadowColor = `hsla(${190 + i * 28}, 90%, 60%, 0.8)`;
      ctx.shadowBlur = 24;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
  },
  // Soft beams sweeping down from above.
  light: (ctx, w, h, t) => {
    base(ctx, w, h, "#1d1a2f", "#07060e");
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const x = w * (0.1 + i * 0.16) + Math.sin(t * 0.0003 + i * 2) * w * 0.08;
      const g = ctx.createLinearGradient(x, 0, x + w * 0.1, h);
      g.addColorStop(0, `hsla(${40 + i * 12}, 90%, 75%, 0.32)`);
      g.addColorStop(1, "hsla(40, 90%, 75%, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.02, 0);
      ctx.lineTo(x + w * 0.02, 0);
      ctx.lineTo(x + w * 0.18, h);
      ctx.lineTo(x - w * 0.06, h);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  },
  // Fine grain over slowly breathing colour.
  texture: (ctx, w, h, t) => {
    const p = (Math.sin(t * 0.0002) + 1) / 2;
    base(ctx, w, h, `hsl(${20 + p * 20}, 35%, 24%)`, `hsl(${330 + p * 20}, 30%, 14%)`);
    const rand = seeded(Math.floor(t / 90) + 1);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 1400; i++) ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < 1400; i++) ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
  },
  // Twinkling points like distant city lights.
  lights: (ctx, w, h, t) => {
    base(ctx, w, h, "#02040c", "#0b0718");
    const rand = seeded(7);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 160; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const hue = 30 + rand() * 200;
      const twinkle = (Math.sin(t * 0.002 * (0.5 + rand()) + i) + 1) / 2;
      blob(ctx, x, y, 4 + rand() * 10, `${hue},90%,70%`, 0.25 + twinkle * 0.6);
    }
    ctx.globalCompositeOperation = "source-over";
  },
  // Large out-of-focus discs drifting upwards.
  bokeh: (ctx, w, h, t) => {
    base(ctx, w, h, "#0d0a1a", "#1a0d14");
    const rand = seeded(42);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 38; i++) {
      const speed = 0.006 + rand() * 0.02;
      const r = Math.min(w, h) * (0.03 + rand() * 0.09);
      const x = rand() * w + Math.sin(t * 0.0004 + i) * 20;
      const y = ((((rand() * h - t * speed) % (h + r * 2)) + h + r * 2) % (h + r * 2)) - r;
      const hue = rand() < 0.5 ? 30 + rand() * 30 : 300 + rand() * 40;
      ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${0.08 + rand() * 0.14})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  },
};

/**
 * Run a scene on a canvas at about 30 frames a second, sized to its box. With reduced motion
 * it draws one still frame. Returns a stop function.
 */
export function runMoodVisual(canvas: HTMLCanvasElement, id: Exclude<MoodVisualId, "off">) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;
  const draw = SCENES[id];
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  let raf = 0;
  let last = 0;
  const resize = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(1, Math.round(canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  const frame = (now: number) => {
    raf = still ? 0 : requestAnimationFrame(frame);
    if (now - last < 33 && !still) return;
    last = now;
    resize();
    if (canvas.width > 1 && canvas.height > 1) draw(ctx, canvas.width, canvas.height, now);
  };
  raf = requestAnimationFrame(frame);
  const observer = new ResizeObserver(() => {
    if (still) frame(performance.now());
  });
  observer.observe(canvas);
  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
  };
}
