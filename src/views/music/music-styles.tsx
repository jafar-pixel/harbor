import { useEffect, useRef, useState } from "react";
import { Check, Plus, Sparkles, X } from "lucide-react";
import { ChevronLeft } from "@/components/icons/music-icons";
import { useT } from "@/lib/i18n";
import {
  STYLE_GENRES,
  customStyleKey,
  resolveStyles,
  seedArtists,
  styleKey,
} from "@/lib/music/tastes/styles";
import { useSettings } from "@/lib/settings";
import "./music-styles.css";

/**
 * "What type of Hip-Hop do you listen to?" and the same for Jazz, Rock, Gospel, Reggae and
 * international music. Picks save to the `musicStyles` setting, which syncs with the JL profile,
 * and seed the AI DJ and vibes.
 */
export function MusicStyles({
  onBack,
  initialGenre,
}: {
  onBack: () => void;
  initialGenre?: string;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  const heading = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<string[]>(() => settings.musicStyles ?? []);
  const [genreId, setGenreId] = useState(
    () => STYLE_GENRES.find((g) => g.id === initialGenre)?.id ?? STYLE_GENRES[0].id,
  );
  const [custom, setCustom] = useState("");
  const genre = STYLE_GENRES.find((g) => g.id === genreId) ?? STYLE_GENRES[0];
  const picked = new Set(draft);
  const mine = resolveStyles(draft);
  const extras = mine.filter((r) => r.genre.id === genre.id && !r.style);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.musicStyles ?? []);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [genreId]);

  const toggle = (key: string) =>
    setDraft((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));

  const addCustom = () => {
    const key = customStyleKey(genre.id, custom);
    if (key && !picked.has(key)) setDraft((list) => [...list, key]);
    setCustom("");
  };

  const save = () => {
    update({ musicStyles: draft });
    onBack();
  };

  return (
    <section className="music-styles">
      <button type="button" className="music-styles-back" data-music-inner-back onClick={onBack}>
        <ChevronLeft className="dir-icon" size={18} />
        {t("Back")}
      </button>

      <nav className="music-styles-genres" aria-label={t("Genres")}>
        {STYLE_GENRES.map((g) => {
          const count = mine.filter((r) => r.genre.id === g.id).length;
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={g.id === genre.id}
              onClick={() => setGenreId(g.id)}
            >
              {t(g.name)}
              {count > 0 && <span>{count}</span>}
            </button>
          );
        })}
      </nav>

      <header>
        <h1 ref={heading} tabIndex={-1}>
          {t(genre.question)}
        </h1>
        <p>{t("Tap every style you like. Your AI DJ and vibes start from these artists.")}</p>
      </header>

      <div className="music-styles-grid">
        {genre.styles.map((style) => {
          const key = styleKey(genre.id, style.id);
          const on = picked.has(key);
          return (
            <button
              key={key}
              type="button"
              className="music-styles-chip"
              aria-pressed={on}
              onClick={() => toggle(key)}
            >
              <span className="music-styles-chip-head">
                <strong>{t(style.name)}</strong>
                <span className="music-styles-check">
                  {on ? <Check size={14} /> : <Plus size={14} />}
                </span>
              </span>
              <span className="music-styles-artists">{style.artists.slice(0, 3).join(" · ")}</span>
            </button>
          );
        })}
        {extras.map((r) => (
          <button
            key={r.key}
            type="button"
            className="music-styles-chip"
            aria-pressed
            onClick={() => toggle(r.key)}
          >
            <span className="music-styles-chip-head">
              <strong>{r.name}</strong>
              <span className="music-styles-check">
                <X size={14} />
              </span>
            </span>
            <span className="music-styles-artists">{t("Your own style")}</span>
          </button>
        ))}
      </div>

      <form
        className="music-styles-custom"
        onSubmit={(e) => {
          e.preventDefault();
          addCustom();
        }}
      >
        <input
          value={custom}
          maxLength={46}
          placeholder={t("Something else…")}
          aria-label={t("Add a style that isn't listed")}
          onChange={(e) => setCustom(e.target.value)}
        />
        <button type="submit" disabled={!customStyleKey(genre.id, custom)}>
          <Plus size={15} /> {t("Add")}
        </button>
      </form>

      <footer className="music-styles-footer">
        <div>
          <p>
            <Sparkles size={14} />{" "}
            {mine.length
              ? t("{n} styles · your DJ starts with {artists}", {
                  n: mine.length,
                  artists: seedArtists(draft, 4).join(", ") || t("your picks"),
                })
              : t("Pick a few styles across any genres.")}
          </p>
          <p className="music-styles-sync">{t("Saved with your account, on every device.")}</p>
        </div>
        <div className="music-styles-actions">
          {draft.length > 0 && (
            <button type="button" className="music-home-text" onClick={() => setDraft([])}>
              {t("Clear all")}
            </button>
          )}
          <button type="button" className="music-home-primary" disabled={!dirty} onClick={save}>
            {t("Save my styles")}
          </button>
        </div>
      </footer>
    </section>
  );
}

/**
 * For You's entry to the picker: the genre questions until the listener has picked styles, then
 * their styles with an Edit button.
 */
export function MusicStylesCard({ onOpen }: { onOpen: (genre?: string) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const mine = resolveStyles(settings.musicStyles ?? []);
  if (!mine.length) {
    return (
      <section className="music-styles-card">
        <div>
          <Sparkles size={18} />
          <h2>{t("Tell your DJ what you're into")}</h2>
        </div>
        <div className="music-styles-card-questions">
          {STYLE_GENRES.map((g) => (
            <button key={g.id} type="button" onClick={() => onOpen(g.id)}>
              {t(g.question)}
            </button>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="music-styles-card music-styles-card-mine">
      <div>
        <Sparkles size={18} />
        <h2>{t("Your styles")}</h2>
        <button type="button" className="music-home-text" onClick={() => onOpen()}>
          {t("Edit")}
        </button>
      </div>
      <div className="music-styles-card-questions">
        {mine.slice(0, 12).map((r) => (
          <button key={r.key} type="button" onClick={() => onOpen(r.genre.id)}>
            {r.style ? t(r.style.name) : r.name}
          </button>
        ))}
        {mine.length > 12 && <span>{t("+{n} more", { n: mine.length - 12 })}</span>}
      </div>
    </section>
  );
}
