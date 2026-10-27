/**
 * JL Media Vision's glass look, after visionOS: panels are frosted glass over the brand's
 * particle-wave backdrop, with rounder corners, a light rim on top and soft depth. Big surfaces
 * (sidebar, panels, dialogs, menus) blur what is behind them; small ones are tinted glass only,
 * since blurring hundreds of cards costs too much. The TV app skips blur entirely.
 */
export const visionCss = `
:root {
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 28px;
  --radius-2xl: 36px;
  --vision-glass: rgb(30 24 40 / 0.5);
  --vision-glass-strong: rgb(24 19 32 / 0.72);
  --vision-rim: rgb(255 255 255 / 0.14);
  --vision-rim-top: rgb(255 255 255 / 0.22);
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
  --vision-glass: rgb(26 21 34 / 0.82);
}
`;
