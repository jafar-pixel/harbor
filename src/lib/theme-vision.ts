/**
 * JL Media Vision's glass look, after visionOS: panels are frosted glass over the brand's
 * particle-wave backdrop, with rounder corners, a light rim on top and soft depth. Big surfaces
 * (sidebar, panels, dialogs, menus) blur what is behind them; small ones are tinted glass only,
 * since blurring hundreds of cards costs too much. The TV app skips blur entirely.
 */
type GlassTone = { glass: string; strong: string; rim: string; rimTop: string; tvGlass: string };

const ORANGE_GLASS: GlassTone = {
  glass: "rgb(30 24 40 / 0.5)",
  strong: "rgb(24 19 32 / 0.72)",
  rim: "rgb(255 255 255 / 0.14)",
  rimTop: "rgb(255 255 255 / 0.22)",
  tvGlass: "rgb(26 21 34 / 0.82)",
};

const glassCss = (tone: GlassTone) => `
:root {
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 28px;
  --radius-2xl: 36px;
  --vision-glass: ${tone.glass};
  --vision-glass-strong: ${tone.strong};
  --vision-rim: ${tone.rim};
  --vision-rim-top: ${tone.rimTop};
  --vision-blur: blur(30px) saturate(170%);
}

/* Panels and cards: tinted glass with a bright top rim. */
html .bg-surface:not(button):not(.no-glass),
html .bg-elevated:not(button):not(.no-glass) {
  background-color: var(--vision-glass) !important;
  border-color: var(--vision-rim);
  box-shadow:
    inset 0 1px 0 var(--vision-rim-top),
    0 18px 40px rgb(0 0 0 / 0.28);
}

/* Large surfaces blur the backdrop like a visionOS window. */
html [data-harbor-sidebar],
html .rounded-2xl.bg-surface:not(button),
html .rounded-3xl.bg-surface:not(button),
html .rounded-2xl.bg-elevated:not(button),
html .rounded-3xl.bg-elevated:not(button),
html [role="dialog"],
html [role="menu"],
html [role="listbox"],
html .modal-panel,
html .glass-card {
  backdrop-filter: var(--vision-blur);
  -webkit-backdrop-filter: var(--vision-blur);
}

/* The app sidebar floats as its own rounded glass window. */
html aside[data-harbor-sidebar],
html nav[data-harbor-sidebar] {
  margin: 10px;
  border: 1px solid var(--vision-rim);
  border-radius: 30px;
  background-color: var(--vision-glass) !important;
  box-shadow:
    inset 0 1px 0 var(--vision-rim-top),
    0 24px 60px rgb(0 0 0 / 0.4);
}

/* Dialogs and menus: denser glass so text stays easy to read. */
html [role="dialog"],
html [role="menu"],
html [role="listbox"],
html .modal-panel {
  background-color: var(--vision-glass-strong) !important;
  border-color: var(--vision-rim) !important;
  border-radius: var(--radius-xl);
}

/* Buttons and chips: rounder, with the glass rim. */
html button.rounded-lg,
html button.rounded-md,
html a.rounded-lg {
  border-radius: 999px;
}
html button.bg-elevated,
html button.bg-surface,
html button.bg-raised {
  background-color: rgb(255 255 255 / 0.08) !important;
  box-shadow: inset 0 1px 0 var(--vision-rim-top);
}
html button.bg-elevated:hover,
html button.bg-surface:hover,
html button.bg-raised:hover {
  background-color: rgb(255 255 255 / 0.14) !important;
}

/* Posters and artwork: rounder, with depth. */
html [data-media-card] img,
html [data-media-card] {
  border-radius: 18px;
}

/* Android TV: no blur (too costly on TV chips); denser glass instead. */
html[data-tv-app] *,
html[data-tv-app] *::before {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
html[data-tv-app] {
  --vision-glass: ${tone.tvGlass};
}
`;

export const visionCss = glassCss(ORANGE_GLASS);

/**
 * JL Media Vision Pro, after Apple Vision Pro: the room (the chosen Environment) stays bright and
 * clear, and the app is one floating window of frosted glass with the sidebar inside it. The
 * window's blur sits on a pseudo-element so the window itself never becomes the containing block
 * for fixed overlays (players, dialogs, menus). Cards inside are lighter glass with a bright rim.
 */
const PRO_ROOM_CSS = `
:root {
  --radius-sm: 12px;
  --radius-md: 16px;
  --radius-lg: 22px;
  --radius-xl: 30px;
  --radius-2xl: 40px;
  --vision-glass: rgb(255 255 255 / 0.09);
  --vision-glass-strong: rgb(38 42 54 / 0.78);
  --vision-rim: rgb(255 255 255 / 0.22);
  --vision-rim-top: rgb(255 255 255 / 0.45);
  --vision-window: rgb(40 44 58 / 0.48);
  --vision-blur: blur(48px) saturate(185%);
  --vision-window-gap: 18px;
  /* Secondary text is brighter than on a dark canvas so it reads on glass over a bright room. */
  --color-ink-muted: oklch(0.92 0.015 255) !important;
  --color-ink-subtle: oklch(0.84 0.025 255) !important;
}

/* The one floating window. */
html [data-harbor-native-backdrop]:has(> aside[data-harbor-sidebar]) {
  margin: var(--vision-window-gap);
  height: calc(100% - var(--vision-window-gap) * 2);
  border-radius: 40px;
  box-shadow:
    inset 0 1px 0 var(--vision-rim-top),
    inset 0 0 0 1px var(--vision-rim),
    0 40px 120px rgb(0 0 0 / 0.35);
}
html [data-harbor-native-backdrop]:has(> aside[data-harbor-sidebar])::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background:
    linear-gradient(160deg, rgb(255 255 255 / 0.12), rgb(255 255 255 / 0) 45%),
    var(--vision-window);
  backdrop-filter: var(--vision-blur);
  -webkit-backdrop-filter: var(--vision-blur);
  pointer-events: none;
}

/* The sidebar is part of the window, not a window of its own. */
html aside[data-harbor-sidebar] {
  background: transparent !important;
  border-color: rgb(255 255 255 / 0.12) !important;
  border-start-start-radius: 40px;
  border-end-start-radius: 40px;
}
html aside[data-harbor-sidebar] [aria-current="page"],
html aside[data-harbor-sidebar] [data-active="true"] {
  background: rgb(255 255 255 / 0.18) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.3);
}

/* Pages inside the window show the glass, not a solid canvas; fields stay readable. */
html [data-harbor-native-backdrop]:has(> aside[data-harbor-sidebar]) .bg-canvas:not(.fixed),
html [data-harbor-native-backdrop]:has(> aside[data-harbor-sidebar]) main {
  background-color: transparent !important;
}
html [data-harbor-native-backdrop]:has(> aside[data-harbor-sidebar]) :is(input, textarea, select).bg-canvas {
  background-color: rgb(255 255 255 / 0.1) !important;
}
/* The sidebar's scroll fades were painted in the canvas colour; the glass needs none. */
html aside[data-harbor-sidebar] .from-canvas {
  display: none;
}

/* Cards and panels inside the window: light glass with a bright rim. */
html .bg-surface:not(button):not(.no-glass),
html .bg-elevated:not(button):not(.no-glass) {
  background-color: var(--vision-glass) !important;
  border-color: var(--vision-rim);
  box-shadow: inset 0 1px 0 var(--vision-rim-top);
}

/* Dialogs, menus and lists float above the window as their own denser glass. */
html [role="dialog"],
html [role="menu"],
html [role="listbox"],
html .modal-panel,
html .glass-card {
  background-color: var(--vision-glass-strong) !important;
  border-color: var(--vision-rim) !important;
  border-radius: var(--radius-xl);
  backdrop-filter: var(--vision-blur);
  -webkit-backdrop-filter: var(--vision-blur);
  box-shadow:
    inset 0 1px 0 var(--vision-rim-top),
    0 30px 80px rgb(0 0 0 / 0.4);
}

/* Buttons and chips: round glass capsules. */
html button.rounded-lg,
html button.rounded-md,
html a.rounded-lg {
  border-radius: 999px;
}
html button.bg-elevated,
html button.bg-surface,
html button.bg-raised {
  background-color: rgb(255 255 255 / 0.12) !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.28);
}
html button.bg-elevated:hover,
html button.bg-surface:hover,
html button.bg-raised:hover {
  background-color: rgb(255 255 255 / 0.22) !important;
}

/* Posters and artwork: rounder, with depth. */
html [data-media-card] img,
html [data-media-card] {
  border-radius: 20px;
}

/* Text stays crisp over a bright room. */
html [data-harbor-native-backdrop] {
  text-shadow: 0 1px 3px rgb(0 0 0 / 0.28);
}

/* Android TV: no blur (too costly on TV chips); the window is a denser tint instead. */
html[data-tv-app] *,
html[data-tv-app] *::before {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
html[data-tv-app] {
  --vision-window: rgb(40 44 58 / 0.78);
  --vision-glass: rgb(255 255 255 / 0.1);
}
`;

/** Pro adds the brand face on the wordmark and orange for the main call to action. */
export const proCss = `${PRO_ROOM_CSS}
html [data-brand-name] {
  font-family: "JL Orbitron", "Orbitron", var(--font-display);
  letter-spacing: 0.08em;
}
html .jl-cta {
  background: linear-gradient(180deg, #ff8a2b, #f26a0f) !important;
  color: #fff !important;
  box-shadow: 0 10px 28px rgb(242 106 15 / 0.35), inset 0 1px 0 rgb(255 255 255 / 0.3);
}
`;
