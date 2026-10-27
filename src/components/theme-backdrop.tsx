import { AuroraBokeh } from "@/components/aurora-bokeh";
import { useActiveHeroDockMode } from "@/lib/hero-dock-layout";
import { useSettings } from "@/lib/settings";
import { getThemeById } from "@/lib/theme";
import { useThemePreview } from "@/lib/theme-preview";
import { useView } from "@/lib/view";
import {
  LIGHTS,
  activeLight,
  environmentById,
  environmentImage,
  useEnvironments,
} from "@/lib/environments";
import { usePageBackdrop } from "@/lib/page-backdrops";

export function ThemeBackdrop() {
  const { settings } = useSettings();
  const { player, view } = useView();
  const preview = useThemePreview();
  const dockMode = useActiveHeroDockMode();
  const env = useEnvironments();
  // A backdrop chosen for this page (Settings › Appearance › Interface) wins over the theme's.
  const pageChoice = settings.pageBackdrops?.[view] ?? null;
  const pageImage = usePageBackdrop(pageChoice);

  if (player) return null;
  // A video pinned as the wallpaper replaces the theme background; a scrim keeps the page readable.
  if (dockMode === "wallpaper")
    return <div className="theme-backdrop-scrim pointer-events-none fixed inset-0 -z-10" />;
  // On the desktop the video plays behind the page, so the background must leave the hero box clear.
  const cut = dockMode === "hero" ? " theme-backdrop-hero" : "";

  const preset = settings.theme.preset !== "custom" ? getThemeById(settings.theme.preset) : null;
  const wantsBokeh = (preview ? preview.bokeh : !!preset?.bokeh) && view !== "addons";
  // Pro: the chosen Environment, unless someone set a background photo of their own.
  const envImage =
    pageImage ?? (preset?.environments ? environmentImage(environmentById(env.applied)) : null);
  const tint =
    preset?.environments && !pageImage
      ? LIGHTS.find((l) => l.id === activeLight(env))?.tint
      : undefined;
  // The glass theme's own backdrop can linger in settings after switching themes; it isn't a photo
  // someone chose, so it doesn't hide the Environment.
  const ownPhoto =
    settings.theme.backgroundImage &&
    settings.theme.backgroundImage !== environmentById("jl-signature-waves").image
      ? settings.theme.backgroundImage
      : null;
  const img =
    pageImage ??
    (envImage ? ownPhoto : settings.theme.backgroundImage) ??
    envImage ??
    preset?.background?.image ??
    null;
  const dim = Math.max(
    0,
    Math.min(
      1,
      // An Environment is meant to be seen: only a light veil over it (the saved dim is for
      // people's own background photos, and defaults to 0.65).
      img === envImage ? 0.12 : (settings.theme.backgroundDim ?? preset?.background?.dim ?? 0.65),
    ),
  );

  if (!img) {
    return (
      <>
        <div className={`pointer-events-none fixed inset-0 -z-30 bg-canvas${cut}`} />
        {wantsBokeh && !cut && <AuroraBokeh />}
      </>
    );
  }
  const isGradient =
    img.startsWith("linear-gradient") ||
    img.startsWith("radial-gradient") ||
    img.startsWith("conic-gradient");
  const presetOwned =
    (!!preset?.background?.image && preset.background.image === img) ||
    (!!envImage && envImage === img);
  const presetGradient = presetOwned && isGradient;
  return (
    <>
      <div
        className={`pointer-events-none fixed inset-0 -z-30 bg-cover bg-center${cut}`}
        style={isGradient ? { background: img } : { backgroundImage: `url(${img})` }}
      />
      {/* A theme's own artwork is made dark enough already; only someone's own photo is darkened. */}
      {!presetOwned && (
        <div
          className={`pointer-events-none fixed inset-0 -z-20${cut}`}
          style={{ background: "black", opacity: 0.45 }}
        />
      )}
      <div
        className={`pointer-events-none fixed inset-0 -z-10 bg-canvas${cut}`}
        style={{ opacity: presetGradient ? 0 : dim }}
      />
      {tint && (
        <div
          className={`pointer-events-none fixed inset-0 -z-10${cut}`}
          style={{ background: tint, transition: "background 600ms ease" }}
        />
      )}
      {wantsBokeh && !cut && <AuroraBokeh />}
    </>
  );
}
