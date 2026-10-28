import { useEffect, useState } from "react";
import { Check, FolderGit2, Plus, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  installGitHubTheme,
  listGitHubThemes,
  parseGitHubSource,
  readGitHubSources,
  sourceLabel,
  writeGitHubSources,
  type GitHubSource,
  type GitHubTheme,
} from "@/lib/github-themes";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Community › GitHub: add any public GitHub repository (or a folder or file in one) that holds theme
 * files, browse what it has and add themes to My library.
 */
export function GitHubThemes() {
  const t = useT();
  const [sources, setSources] = useState<GitHubSource[]>(readGitHubSources);
  const [active, setActive] = useState(0);
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [themes, setThemes] = useState<GitHubTheme[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const source = sources[active] ?? null;

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setThemes(null);
    setError(null);
    listGitHubThemes(source)
      .then((list) => !cancelled && setThemes(list))
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(message(e));
        setThemes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  const save = (next: GitHubSource[]) => {
    setSources(next);
    writeGitHubSources(next);
  };

  const add = () => {
    const parsed = parseGitHubSource(input);
    if (!parsed) {
      setInputError(t("Enter a GitHub repository, like owner/repo or a github.com link."));
      return;
    }
    setInputError(null);
    setInput("");
    const existing = sources.findIndex((s) => sourceLabel(s) === sourceLabel(parsed));
    if (existing >= 0) return setActive(existing);
    save([...sources, parsed]);
    setActive(sources.length);
  };

  const install = (item: GitHubTheme) => {
    setBusy(item.path);
    try {
      installGitHubTheme(item);
      setAdded((s) => new Set(s).add(item.path));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-5">
      <form
        className="flex flex-wrap items-center gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="sr-only" htmlFor="github-theme-source">
          {t("GitHub repository")}
        </label>
        <div className="flex h-11 min-w-[260px] flex-1 items-center gap-2 rounded-full bg-elevated px-4">
          <FolderGit2 size={18} className="text-ink-subtle" />
          <input
            id="github-theme-source"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("owner/repo, a folder, or a github.com link")}
            className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!input.trim()}
          className="flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-canvas disabled:opacity-50"
        >
          <Plus size={16} /> {t("Add repository")}
        </button>
      </form>
      {inputError && <p className="text-[13.5px] text-danger">{inputError}</p>}

      {sources.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-edge px-6 py-10 text-center text-[14.5px] leading-relaxed text-ink-muted">
          {t(
            "Add a public GitHub repository that has theme files (.json) and its themes show up here. You can point at the whole repository, one folder, or a single theme file.",
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("Repositories")}>
          {sources.map((s, i) => (
            <span
              key={sourceLabel(s)}
              className={`flex items-center gap-1 rounded-full border ps-3.5 pe-1 text-[13.5px] ${
                i === active ? "border-edge bg-raised text-ink" : "border-edge-soft text-ink-muted"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={i === active}
                onClick={() => setActive(i)}
              >
                {sourceLabel(s)}
              </button>
              <button
                type="button"
                aria-label={t("Remove {name}", { name: sourceLabel(s) })}
                className="flex h-7 w-7 items-center justify-center rounded-full text-ink-subtle hover:text-ink"
                onClick={() => {
                  save(sources.filter((_, j) => j !== i));
                  setActive(0);
                }}
              >
                <Trash2 size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      {source && error && <p className="text-[14px] text-danger">{error}</p>}
      {source && !themes && <p className="text-[14px] text-ink-muted">{t("Loading themes…")}</p>}
      {source && themes && themes.length === 0 && !error && (
        <p className="text-[14px] text-ink-muted">
          {t("No theme files found there. Themes are .json files exported from Your themes.")}
        </p>
      )}
      {themes && themes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {themes.map((item) => {
            const done = added.has(item.path);
            return (
              <article
                key={item.path}
                className="flex flex-col gap-3 rounded-2xl border border-edge-soft bg-elevated p-4"
              >
                <div className="flex h-20 overflow-hidden rounded-xl">
                  {item.theme.swatch.map((c, i) => (
                    <span key={i} className="flex-1" style={{ background: c }} />
                  ))}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-[15.5px] font-semibold text-ink">
                    {item.theme.name}
                  </h3>
                  <p className="line-clamp-2 text-[13px] text-ink-muted">
                    {item.theme.blurb || item.path}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={done || busy === item.path}
                  onClick={() => install(item)}
                  className="mt-auto flex h-10 items-center justify-center gap-2 rounded-full bg-ink text-[14px] font-semibold text-canvas disabled:opacity-60"
                >
                  {done ? <Check size={15} /> : <Plus size={15} />}
                  {done ? t("Added to My library") : t("Add to My library")}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
