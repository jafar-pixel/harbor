import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useJlSession } from "@/lib/jl/account/client";
import { ENVIRONMENTS, environmentImage } from "@/lib/environments";
import {
  artChoice,
  BACKDROP_PAGES,
  deleteBackdropArt,
  envChoice,
  listBackdropArt,
  uploadBackdropArt,
  useArtUrls,
  type BackdropChoice,
} from "@/lib/page-backdrops";
import { Section } from "../shared";
import { ROW_ACTION, ROW_ACTION_PRIMARY } from "../kit";
import "./page-backdrops.css";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Settings › Appearance › Interface: a backdrop for each page (an Environment or your own art)
 * and the art you uploaded, kept with your JL account.
 */
export function PageBackdropsSection() {
  const t = useT();
  const { settings, update } = useSettings();
  const session = useJlSession();
  const pages = settings.pageBackdrops ?? {};
  const [art, setArt] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const urls = useArtUrls(art);

  useEffect(() => {
    if (!session) return;
    void listBackdropArt()
      .then(setArt)
      .catch((e: unknown) => setError(message(e)));
  }, [session]);

  const choose = (page: string, choice: BackdropChoice | null) => {
    const next = { ...pages };
    if (choice) next[page] = choice;
    else delete next[page];
    update({ pageBackdrops: next });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(t("Uploading…"));
    setError(null);
    try {
      const path = await uploadBackdropArt(file);
      setArt((a) => [path, ...a]);
      if (open) choose(open, artChoice(path));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (path: string) => {
    if (!window.confirm(t("Remove this picture from your backdrop art?"))) return;
    setBusy(t("Removing…"));
    try {
      await deleteBackdropArt(path);
      setArt((a) => a.filter((p) => p !== path));
      const next = Object.fromEntries(
        Object.entries(pages).filter(([, c]) => c !== artChoice(path)),
      );
      update({ pageBackdrops: next });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const preview = (choice: string | undefined): string | null => {
    if (!choice) return null;
    if (choice.startsWith("env:")) {
      const env = ENVIRONMENTS.find((e) => e.id === choice.slice(4));
      return env ? environmentImage(env) : null;
    }
    return urls.get(choice.slice(4)) ?? null;
  };

  return (
    <Section
      title={t("Page backdrops")}
      subtitle={t(
        "Give each page its own backdrop: an Environment or your own art. Pages left on Theme use the theme's backdrop.",
      )}
    >
      <div className="pb">
        <div className="pb-art">
          <div className="pb-art-head">
            <strong>{t("Your backdrop art")}</strong>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t("Upload backdrop art")}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <button
              type="button"
              className={ROW_ACTION_PRIMARY}
              disabled={!session || !!busy}
              onClick={() => input.current?.click()}
            >
              <ImagePlus size={15} /> {t("Upload art")}
            </button>
          </div>
          {!session && (
            <p className="pb-muted">
              {t("Sign in to your JL Media Vision account to upload your own art.")}
            </p>
          )}
          {busy && (
            <p className="pb-muted" role="status">
              <Loader2 size={14} className="animate-spin" /> {busy}
            </p>
          )}
          {error && (
            <p className="pb-error" role="alert">
              {error}
            </p>
          )}
          {art.length > 0 && (
            <div className="pb-art-grid">
              {art.map((p) => (
                <div key={p} className="pb-art-item">
                  {urls.get(p) ? <img src={urls.get(p)} alt="" /> : <span />}
                  <button
                    type="button"
                    className="pb-art-remove"
                    aria-label={t("Remove picture")}
                    onClick={() => void remove(p)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="pb-muted">{t("PNG, JPEG or WebP up to 15 MB; 3840×2160 looks best.")}</p>
        </div>

        <ul className="pb-pages">
          {BACKDROP_PAGES.map((page) => {
            const current = pages[page.id];
            const thumb = preview(current);
            const expanded = open === page.id;
            const label = !current
              ? t("Theme")
              : current.startsWith("env:")
                ? (ENVIRONMENTS.find((e) => e.id === current.slice(4))?.name ?? t("Environment"))
                : t("Your art");
            return (
              <li key={page.id} className="pb-page" data-open={expanded}>
                <button
                  type="button"
                  className="pb-page-row"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : page.id)}
                >
                  <span className="pb-thumb">{thumb ? <img src={thumb} alt="" /> : null}</span>
                  <span className="pb-page-text">
                    <strong>{t(page.label)}</strong>
                    <span>{label}</span>
                  </span>
                  <ChevronDown size={16} className="pb-chevron" />
                </button>
                {expanded && (
                  <div className="pb-choices" role="group" aria-label={t(page.label)}>
                    <Choice
                      label={t("Theme")}
                      image={null}
                      on={!current}
                      onPick={() => choose(page.id, null)}
                    />
                    {ENVIRONMENTS.map((env) => (
                      <Choice
                        key={env.id}
                        label={env.name}
                        image={environmentImage(env)}
                        on={current === envChoice(env.id)}
                        onPick={() => choose(page.id, envChoice(env.id))}
                      />
                    ))}
                    {art.map((p, i) => (
                      <Choice
                        key={p}
                        label={`${t("Your art")} ${art.length - i}`}
                        image={urls.get(p) ?? null}
                        on={current === artChoice(p)}
                        onPick={() => choose(page.id, artChoice(p))}
                      />
                    ))}
                    {session && (
                      <button
                        type="button"
                        className={`pb-choice pb-choice-upload ${ROW_ACTION}`}
                        disabled={!!busy}
                        onClick={() => input.current?.click()}
                      >
                        <ImagePlus size={18} />
                        <span>{t("Upload")}</span>
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}

function Choice({
  label,
  image,
  on,
  onPick,
}: {
  label: string;
  image: string | null;
  on: boolean;
  onPick: () => void;
}) {
  return (
    <button type="button" className="pb-choice" aria-pressed={on} onClick={onPick}>
      <span className="pb-choice-img">
        {image ? <img src={image} alt="" loading="lazy" /> : null}
        {on && (
          <span className="pb-choice-check" aria-hidden="true">
            <Check size={14} />
          </span>
        )}
      </span>
      <span className="pb-choice-label">{label}</span>
    </button>
  );
}
