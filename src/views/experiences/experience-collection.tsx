import { useEffect, useState } from "react";
import { X, ArrowRight } from "lucide-react";
import { ModalShell } from "@/components/modal-shell";
import { meta as fetchMeta, type Meta } from "@/lib/cinemeta";
import { useMediaFavorites } from "@/lib/media-favorites";
import { useLocalWatchlist } from "@/lib/local-watchlist";
import { useView } from "@/lib/view";
import { useT } from "@/lib/i18n";

export type ExperienceCollectionInfo = {
  title: string;
  description: string;
  movies?: readonly string[];
  birthday?: boolean;
  sports?: boolean;
  preview?: boolean;
};
export function ExperienceCollection({
  info,
  onClose,
}: {
  info: ExperienceCollectionInfo;
  onClose: () => void;
}) {
  const t = useT();
  const { openMeta, setView } = useView();
  const favorites = useMediaFavorites();
  const watchlist = useLocalWatchlist();
  const [movies, setMovies] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!info.movies) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setMovies([]);
    Promise.all(info.movies.map((id) => fetchMeta("movie", id).catch(() => null))).then(
      (results) => {
        if (cancelled) return;
        setMovies(results.filter((m): m is Meta => !!m));
        setFailed(results.some((m) => !m));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [info.movies, attempt]);
  const personal = [
    ...new Map(
      [...favorites.items.values(), ...watchlist.items.values()]
        .filter((m) => m.name)
        .map((m) => [`${m.type}:${m.id}`, m]),
    ).values(),
  ].slice(0, 24);
  const items: Meta[] = info.birthday ? personal : movies;
  return (
    <ModalShell closing={false} onDismiss={onClose} width={980} labelledBy="experience-title">
      <div className="flex items-start justify-between gap-4 border-b border-edge-soft p-6">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">
            {t(info.preview ? "Preview" : "JL Experiences")}
          </p>
          <h2 id="experience-title" className="text-3xl font-semibold">
            {info.title}
          </h2>
          <p className="mt-2 text-sm text-ink-muted">{info.description}</p>
        </div>
        <button
          className="min-h-11 min-w-11 rounded-full hover:bg-elevated"
          aria-label={t("Close")}
          onClick={onClose}
        >
          <X className="mx-auto" size={22} />
        </button>
      </div>
      <div className="overflow-y-auto p-6">
        {info.sports ? (
          <div className="space-y-4">
            <p>
              {t(
                "Open your Sports Hub for games, scores and available broadcasts. Your sports and followed teams control what appears.",
              )}
            </p>
            <button
              className="experience-action"
              onClick={() => {
                onClose();
                setView("sports");
              }}
            >
              {t("Open Sports Hub")}
              <ArrowRight size={18} />
            </button>
          </div>
        ) : (
          <>
            {loading && <p role="status">{t("Loading collection…")}</p>}
            {!loading && failed && (
              <p className="mb-4 text-sm text-ink-muted">
                {t("Some titles could not load.")}{" "}
                <button className="underline" onClick={() => setAttempt((n) => n + 1)}>
                  {t("Retry")}
                </button>
              </p>
            )}
            {!loading && items.length === 0 && (
              <div className="space-y-4">
                <p>
                  {t(
                    info.birthday
                      ? "Save movies and shows to this profile's favorites or watchlist to fill your birthday collection."
                      : "This collection is unavailable right now.",
                  )}
                </p>
                <button
                  className="experience-action"
                  onClick={() => {
                    onClose();
                    setView("library");
                  }}
                >
                  {t("Open My Library")}
                  <ArrowRight size={18} />
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {items.map((item) => (
                <button
                  key={`${item.type}:${item.id}`}
                  className="group rounded-xl text-start focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => {
                    onClose();
                    openMeta(item);
                  }}
                >
                  <div className="mb-2 aspect-[2/3] overflow-hidden rounded-xl bg-elevated">
                    {item.poster ? (
                      <img
                        src={item.poster}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center p-4 text-center">
                        {item.name}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium">{item.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
