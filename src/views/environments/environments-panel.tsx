import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, Clock, Eye, Heart, Mountain, Sparkles, X } from "lucide-react";
import {
  CATEGORIES,
  ENVIRONMENTS,
  LIGHTS,
  activeLight,
  applyEnvironment,
  environmentById,
  environmentImage,
  setAmbientLight,
  toggleFavorite,
  useEnvironments,
  type EnvironmentCategory,
} from "@/lib/environments";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { getThemeById } from "@/lib/theme";
import { useView } from "@/lib/view";
import "./environments.css";

let open = false;
const listeners = new Set<() => void>();
export function openEnvironments() {
  open = true;
  for (const fn of listeners) fn();
}
function closeEnvironments() {
  open = false;
  for (const fn of listeners) fn();
}
function useOpen() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => open,
    () => false,
  );
}

type Tab = "all" | "favorites" | "recent";

/** Environments when the theme uses them: the floating pill and the panel it opens. */
export function EnvironmentsChrome() {
  const { settings } = useSettings();
  const { player } = useView();
  const preset = settings.theme.preset !== "custom" ? getThemeById(settings.theme.preset) : null;
  if (!preset?.environments) return null;
  return (
    <>
      {!player && <EnvironmentsButton />}
      <EnvironmentsPanel />
    </>
  );
}

/** The floating Environments pill, beside Big Picture. */
function EnvironmentsButton() {
  const t = useT();
  return (
    <button
      type="button"
      data-focusable="true"
      aria-label={t("Environments")}
      onClick={openEnvironments}
      className="env-fab group"
    >
      <Mountain size={16} strokeWidth={2} />
      <span>{t("Environments")}</span>
    </button>
  );
}

/**
 * JL Media Vision Pro Environments: pick the scene that surrounds the whole app. A big preview,
 * the scene's details with Preview and Apply, ambient lighting, favourites and recents.
 */
function EnvironmentsPanel() {
  const t = useT();
  const isOpen = useOpen();
  const env = useEnvironments();
  const [tab, setTab] = useState<Tab>("all");
  const [category, setCategory] = useState<EnvironmentCategory | "all">("all");
  const [selected, setSelected] = useState(env.applied);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(env.applied);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (previewing) setPreviewing(false);
        else closeEnvironments();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, previewing]);

  if (!isOpen) return null;
  const chosen = environmentById(selected);
  const list = ENVIRONMENTS.filter((e) =>
    tab === "favorites"
      ? env.favorites.includes(e.id)
      : tab === "recent"
        ? env.recent.includes(e.id)
        : category === "all" || e.category === category,
  ).sort((a, b) => (tab === "recent" ? env.recent.indexOf(a.id) - env.recent.indexOf(b.id) : 0));
  const light = activeLight(env);
  const categoryLabel = (id: EnvironmentCategory) =>
    t(CATEGORIES.find((c) => c.id === id)?.label ?? id);

  if (previewing) {
    return (
      <button
        type="button"
        className="env-preview"
        style={{ backgroundImage: `url("${environmentImage(chosen)}")` }}
        onClick={() => setPreviewing(false)}
        aria-label={t("Close preview")}
      >
        <span className="env-preview-hint">
          {chosen.name} · {t("Tap or press Esc to go back")}
        </span>
      </button>
    );
  }

  return (
    <div className="env" role="dialog" aria-modal="true" aria-label={t("Environments")}>
      <header className="env-top">
        <div className="env-brand">
          <strong data-brand-name>JL MEDIA VISION</strong>
          <span>PRO</span>
        </div>
        <nav className="env-tabs" role="tablist">
          {(
            [
              ["all", t("Environments"), Sparkles],
              ["favorites", t("Favorites"), Heart],
              ["recent", t("Recent"), Clock],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`env-tab${tab === id ? " is-on" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="env-close"
          onClick={closeEnvironments}
          aria-label={t("Close")}
        >
          <X size={20} />
        </button>
      </header>

      {tab === "all" && (
        <div className="env-cats" role="group" aria-label={t("Categories")}>
          <button
            type="button"
            className={`env-cat${category === "all" ? " is-on" : ""}`}
            onClick={() => setCategory("all")}
          >
            {t("All")}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`env-cat${category === c.id ? " is-on" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              {t(c.label)}
            </button>
          ))}
        </div>
      )}

      <div className="env-main">
        <div className="env-hero" style={{ backgroundImage: `url("${environmentImage(chosen)}")` }}>
          <span className="env-hero-crumb">
            {categoryLabel(chosen.category)} · {chosen.name}
          </span>
          <button
            type="button"
            className={`env-heart${env.favorites.includes(chosen.id) ? " is-on" : ""}`}
            aria-pressed={env.favorites.includes(chosen.id)}
            aria-label={t("Favorite")}
            onClick={() => toggleFavorite(chosen.id)}
          >
            <Heart size={20} fill={env.favorites.includes(chosen.id) ? "currentColor" : "none"} />
          </button>
        </div>
        <aside className="env-info">
          {chosen.category === "signature" && (
            <span className="env-badge">★ {t("JL Signature")}</span>
          )}
          <h2>{chosen.name}</h2>
          <p className="env-cat-line">{categoryLabel(chosen.category)}</p>
          <p className="env-blurb">{t(chosen.blurb)}</p>
          <div className="env-actions">
            <button type="button" className="env-btn" onClick={() => setPreviewing(true)}>
              <Eye size={18} /> {t("Preview")}
            </button>
            <button
              type="button"
              className="env-btn jl-cta is-cta"
              onClick={() => applyEnvironment(chosen.id)}
              disabled={env.applied === chosen.id}
            >
              <Check size={18} />{" "}
              {env.applied === chosen.id ? t("Applied") : t("Apply Environment")}
            </button>
          </div>
          <div className="env-light">
            <span>{t("Ambient lighting")}</span>
            <div className="env-light-row">
              {LIGHTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  data-light={l.id}
                  className={`env-light-chip${light === l.id ? " is-on" : ""}`}
                  aria-pressed={light === l.id}
                  onClick={() => setAmbientLight(l.id)}
                >
                  <i /> {t(l.label)}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="env-strip" role="list">
        {list.length === 0 && (
          <p className="env-empty">
            {tab === "favorites"
              ? t("Tap the heart on an environment to keep it here.")
              : t("Environments you apply show up here.")}
          </p>
        )}
        {list.map((e) => (
          <button
            key={e.id}
            type="button"
            role="listitem"
            className={`env-card${selected === e.id ? " is-selected" : ""}${env.applied === e.id ? " is-applied" : ""}`}
            onClick={() => setSelected(e.id)}
            onDoubleClick={() => applyEnvironment(e.id)}
          >
            <span
              className="env-card-img"
              style={{ backgroundImage: `url("${environmentImage(e)}")` }}
            >
              {env.favorites.includes(e.id) && (
                <Heart size={16} fill="currentColor" className="env-card-heart" />
              )}
            </span>
            <span className="env-card-cat">{categoryLabel(e.category)}</span>
            <strong>{e.name}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
