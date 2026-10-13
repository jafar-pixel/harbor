import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCw,
  Search,
} from "lucide-react";
import { Play } from "@/components/icons/play-filled";
import { useDebridClients } from "@/lib/debrid/registry";
import {
  magnetFromHash,
  type DebridStore,
  type LibraryEntry,
  type LibraryFile,
} from "@/lib/debrid/types";
import {
  buildLibraryRows,
  countLibraryKinds,
  debridMetaId,
  describeRelease,
  fileBaseName,
  filterLibraryRows,
  isVideoName,
  libraryFileChoices,
  pageLibraryRows,
  type LibraryKindFilter,
  type LibraryProviderFilter,
  type LibraryRow,
} from "@/lib/debrid/library-view";
import { enqueueDownload } from "@/lib/download/downloads-store";
import { offlineDownloadsAvailable, saveInBrowser } from "@/lib/browser-download";
import type { Meta } from "@/lib/cinemeta";
import { useView, type PlayEpisode } from "@/lib/view";
import { useT } from "@/lib/i18n";
import { fmtBytes } from "./downloads-format";

type ActionState =
  | { status: "resolving"; intent: "play" | "download" }
  | { status: "queued" }
  | { status: "saved" }
  | { status: "error"; message: string };

type Target = { row: LibraryRow; file?: LibraryFile; fileIdx?: number };

const PROVIDER_LABEL: Record<string, string> = { rd: "RD", tb: "TB" };

function targetKey(t: Target): string {
  return t.fileIdx == null ? t.row.key : `${t.row.key}#${t.fileIdx}`;
}

function errorMessage(code: string): string {
  if (code === "unauthorized") return "The debrid key was rejected. Check it in Settings.";
  if (code === "not-premium") return "This debrid account has no active subscription.";
  if (code === "rate-limited") return "The debrid service is busy. Try again in a minute.";
  if (code === "not-cached" || code === "still-downloading")
    return "This torrent isn't ready on the debrid service.";
  if (code === "no-video-file") return "No playable file in this torrent.";
  return "Couldn't get a link: {code}";
}

export function DebridLibrary() {
  const t = useT();
  const { openSettings, openPlayer } = useView();
  const clients = useDebridClients();
  const libraryClients = useMemo(() => clients.filter((c) => !!c.listAllLibrary), [clients]);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [errors, setErrors] = useState<Array<{ name: string; code: string }>>([]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<LibraryKindFilter>("all");
  const [provider, setProvider] = useState<LibraryProviderFilter>("all");
  const [page, setPage] = useState(1);
  const [actions, setActions] = useState<Record<string, ActionState>>({});
  const loadRef = useRef<AbortController | null>(null);

  const load = useCallback(
    (refresh: boolean) => {
      loadRef.current?.abort();
      const ac = new AbortController();
      loadRef.current = ac;
      setLoading(true);
      setLoaded(0);
      setErrors([]);
      const progress = new Map<string, number>();
      void Promise.all(
        libraryClients.map(async (c) => {
          const r = await c.listAllLibrary!(
            ac.signal,
            (n) => {
              progress.set(c.slug, n);
              if (!ac.signal.aborted) setLoaded([...progress.values()].reduce((a, b) => a + b, 0));
            },
            { refresh },
          );
          return { client: c, r };
        }),
      ).then((results) => {
        if (ac.signal.aborted) return;
        const next: LibraryEntry[] = [];
        const failed: Array<{ name: string; code: string }> = [];
        for (const { client, r } of results) {
          if (r.ok) next.push(...r.data);
          else if (r.code !== "aborted") failed.push({ name: client.name, code: r.code });
        }
        setEntries(next);
        setErrors(failed);
        setLoading(false);
      });
    },
    [libraryClients],
  );

  useEffect(() => {
    if (libraryClients.length > 0) load(false);
    else setEntries([]);
    return () => loadRef.current?.abort();
  }, [libraryClients, load]);

  const rows = useMemo(() => buildLibraryRows(entries), [entries]);
  const providerCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows) out[r.entry.slug] = (out[r.entry.slug] ?? 0) + 1;
    return out;
  }, [rows]);
  const searched = useMemo(
    () => filterLibraryRows(rows, { search, kind: "all", provider }),
    [rows, search, provider],
  );
  const kindCounts = useMemo(() => countLibraryKinds(searched), [searched]);
  const filtered = useMemo(
    () => (kind === "all" ? searched : searched.filter((r) => r.kind === kind)),
    [searched, kind],
  );
  const view = pageLibraryRows(filtered, page);

  useEffect(() => setPage(1), [search, kind, provider]);

  const clientFor = useCallback(
    (row: LibraryRow): DebridStore | undefined => clients.find((c) => c.slug === row.entry.slug),
    [clients],
  );
  const setAction = (key: string, state: ActionState | null) =>
    setActions((prev) => {
      const next = { ...prev };
      if (state) next[key] = state;
      else delete next[key];
      return next;
    });

  const offline = offlineDownloadsAvailable();

  const run = async (target: Target, intent: "play" | "download") => {
    const key = targetKey(target);
    const client = clientFor(target.row);
    if (!client || actions[key]?.status === "resolving") return;
    setAction(key, { status: "resolving", intent });
    const ac = new AbortController();
    const r = client.libraryLink
      ? await client.libraryLink(target.row.entry.id, target.fileIdx, ac.signal)
      : await client.playableUrl(magnetFromHash(target.row.entry.hash), target.fileIdx, ac.signal);
    if (!r.ok) {
      setAction(key, { status: "error", message: t(errorMessage(r.code), { code: r.code }) });
      return;
    }
    const { row } = target;
    const fileName = fileBaseName(r.data.filename ?? target.file?.name ?? row.entry.name);
    const release = describeRelease(target.file?.name ?? row.entry.name);
    const baseId = debridMetaId(row.entry);
    try {
      if (intent === "play") {
        setAction(key, null);
        openPlayer({
          meta: {
            id: target.fileIdx == null ? baseId : `${baseId}:${target.fileIdx}`,
            type: "other",
            name: row.title,
          },
          url: r.data.webStreamUrl ?? r.data.url,
          historyUrl: r.data.url,
          headers: r.data.headers,
          title: target.file ? fileName : row.year ? `${row.title} (${row.year})` : row.title,
          subtitle: target.file ? row.title : fileName,
          notWebReady: r.data.notWebReady,
          subtitles: r.data.subtitles,
        });
        return;
      }
      if (!offline) {
        saveInBrowser(r.data.url, fileName);
        setAction(key, { status: "saved" });
        return;
      }
      const season = release.season ?? row.season;
      const episodeNo = release.episode ?? (target.file ? null : row.episode);
      const episode: PlayEpisode | undefined =
        season != null && episodeNo != null ? { season, episode: episodeNo } : undefined;
      const meta: Meta = {
        id: baseId,
        type: row.kind === "show" ? "series" : "movie",
        name: row.title,
        releaseInfo: !episode && row.year ? String(row.year) : undefined,
      };
      await enqueueDownload({
        meta,
        episode,
        streamLabel: release.label,
        url: r.data.url,
        headers: r.data.headers,
      });
      setAction(key, { status: "queued" });
    } catch (e) {
      setAction(key, {
        status: "error",
        message: e instanceof Error ? t(e.message) : t("Couldn't start the download."),
      });
    }
  };

  if (libraryClients.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-edge-soft bg-elevated/30 px-8 py-14 text-center">
        <p className="max-w-[380px] text-[13.5px] leading-relaxed text-ink-muted">
          {t("Add a Real-Debrid or TorBox key to browse the torrents in your debrid account here.")}
        </p>
        <button
          type="button"
          onClick={() => openSettings("streaming")}
          className="text-[13px] font-semibold text-accent transition duration-150 hover:opacity-85 active:scale-[0.97]"
        >
          {t("Open Streaming settings")}
        </button>
      </div>
    );
  }

  const kindTabs: Array<{ id: LibraryKindFilter; label: string }> = [
    { id: "all", label: t("All") },
    { id: "movie", label: t("Movies") },
    { id: "show", label: t("TV shows") },
    { id: "other", label: t("Others") },
  ];
  const slugs = Object.keys(providerCounts);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 min-w-[220px] flex-1 items-center gap-2.5 rounded-xl border border-edge bg-elevated/40 px-3.5 focus-within:border-ink-subtle">
          <Search size={16} className="shrink-0 text-ink-subtle" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search your library, or /regex/")}
            aria-label={t("Search your debrid library")}
            className="h-full w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-subtle"
          />
        </div>
        <button
          type="button"
          aria-disabled={loading}
          onClick={() => {
            if (!loading) load(true);
          }}
          aria-label={t("Reload debrid library")}
          title={t("Reload debrid library")}
          className="flex h-10 items-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-accent transition duration-150 hover:opacity-85 active:scale-[0.97] aria-disabled:opacity-50"
        >
          <RotateCw size={15} className={loading ? "animate-spin" : ""} />
          {t("Reload")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {kindTabs.map((k) => (
          <Chip
            key={k.id}
            label={k.label}
            count={kindCounts[k.id]}
            active={kind === k.id}
            onClick={() => setKind(k.id)}
          />
        ))}
        {slugs.length > 1 && (
          <>
            <span className="mx-1 h-5 w-px bg-edge-soft" aria-hidden />
            <Chip
              label={t("All services")}
              count={rows.length}
              active={provider === "all"}
              onClick={() => setProvider("all")}
            />
            {slugs.map((slug) => (
              <Chip
                key={slug}
                label={PROVIDER_LABEL[slug] ?? slug.toUpperCase()}
                count={providerCounts[slug]}
                active={provider === slug}
                onClick={() => setProvider(slug as LibraryProviderFilter)}
              />
            ))}
          </>
        )}
      </div>

      {errors.map((e) => (
        <p key={e.name} role="alert" className="text-sm text-danger">
          {e.name}: {t(errorMessage(e.code), { code: e.code })}
        </p>
      ))}

      <div className="flex items-center justify-between gap-3 text-[12.5px] tabular-nums text-ink-subtle">
        <span>
          {loading
            ? t("Loading your library… {count} torrents", { count: loaded })
            : view.total === 1
              ? t("1 torrent")
              : t("{count} torrents", { count: view.total })}
        </span>
        <div className="flex items-center gap-1">
          <PageBtn
            label={t("Previous page")}
            disabled={view.page <= 1}
            onClick={() => setPage(view.page - 1)}
          >
            <ChevronLeft size={16} />
          </PageBtn>
          <span className="min-w-[3.5rem] text-center">
            {view.page}/{view.pages}
          </span>
          <PageBtn
            label={t("Next page")}
            disabled={view.page >= view.pages}
            onClick={() => setPage(view.page + 1)}
          >
            <ChevronRight size={16} />
          </PageBtn>
        </div>
      </div>

      {!loading && view.total === 0 ? (
        <p className="rounded-xl border border-dashed border-edge-soft bg-elevated/30 px-6 py-10 text-center text-[13.5px] text-ink-muted">
          {rows.length === 0
            ? t("No finished torrents in your debrid account.")
            : t("Nothing matches these filters.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.rows.map((row) => (
            <LibraryItem
              key={row.key}
              row={row}
              client={clientFor(row)}
              actions={actions}
              offline={offline}
              onAction={(target, intent) => void run(target, intent)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LibraryItem({
  row,
  client,
  actions,
  offline,
  onAction,
}: {
  row: LibraryRow;
  client: DebridStore | undefined;
  actions: Record<string, ActionState>;
  offline: boolean;
  onAction: (target: Target, intent: "play" | "download") => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<LibraryFile[] | null>(row.entry.files ?? null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const videoCount = row.entry.files
    ? row.entry.files.filter((f) => isVideoName(f.name)).length
    : (row.entry.fileCount ?? 0);
  const expandable = videoCount > 1;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || files || filesLoading || !client?.libraryFiles) return;
    setFilesLoading(true);
    setFilesError(null);
    void client.libraryFiles(row.entry.id, new AbortController().signal).then((r) => {
      setFilesLoading(false);
      if (r.ok) setFiles(r.data);
      else setFilesError(t(errorMessage(r.code), { code: r.code }));
    });
  };

  const choices = useMemo(() => (files ? libraryFileChoices(files) : []), [files]);
  const rowTarget: Target = { row };

  return (
    <li className="overflow-hidden rounded-2xl border border-edge-soft bg-elevated/40 transition-colors hover:bg-elevated/70">
      <div className="flex items-center gap-3 p-3">
        <span className="shrink-0 rounded-md bg-ink/10 px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide text-ink-muted">
          {PROVIDER_LABEL[row.entry.slug] ?? row.entry.slug.toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[14.5px] font-semibold text-ink">
            {row.title}
            {row.year ? <span className="font-normal text-ink-subtle"> ({row.year})</span> : null}
          </span>
          <span className="truncate text-[12px] text-ink-subtle" title={row.entry.name}>
            {row.entry.name}
            {row.entry.size ? `  ·  ${fmtBytes(row.entry.size)}` : ""}
            {expandable ? `  ·  ${t("{count} files", { count: videoCount })}` : ""}
          </span>
          <ActionStatus state={actions[targetKey(rowTarget)]} />
        </div>
        <Actions
          target={rowTarget}
          state={actions[targetKey(rowTarget)]}
          offline={offline}
          onAction={onAction}
        />
        {expandable && (
          <RowBtn label={open ? t("Hide files") : t("Show files")} onClick={toggle} expanded={open}>
            <ChevronDown
              size={16}
              className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
            />
          </RowBtn>
        )}
      </div>
      {open && (
        <ul className="flex flex-col gap-1 border-t border-edge-soft/50 px-2 pb-2 pt-2">
          {filesLoading && (
            <li className="px-2 py-1.5 text-[12.5px] text-ink-subtle">{t("Loading files…")}</li>
          )}
          {filesError && (
            <li role="alert" className="px-2 py-1.5 text-[12.5px] text-danger">
              {filesError}
            </li>
          )}
          {choices.map(({ file, fileIdx }) => {
            const target: Target = { row, file, fileIdx };
            const state = actions[targetKey(target)];
            return (
              <li
                key={`${file.id}-${fileIdx}`}
                className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-ink/5"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] text-ink" title={file.name}>
                    {fileBaseName(file.name)}
                  </span>
                  <span className="text-[11.5px] tabular-nums text-ink-subtle">
                    {fmtBytes(file.size)}
                  </span>
                  <ActionStatus state={state} />
                </div>
                <Actions target={target} state={state} offline={offline} onAction={onAction} />
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function Actions({
  target,
  state,
  offline,
  onAction,
}: {
  target: Target;
  state: ActionState | undefined;
  offline: boolean;
  onAction: (target: Target, intent: "play" | "download") => void;
}) {
  const t = useT();
  const busy = state?.status === "resolving";
  const downloadLabel = offline ? t("Download for offline") : t("Save through the browser");
  return (
    <div className="flex shrink-0 items-center gap-1">
      <RowBtn label={t("Play")} busy={busy} onClick={() => onAction(target, "play")}>
        {busy && state.intent === "play" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Play size={16} strokeWidth={2.2} fill="currentColor" />
        )}
      </RowBtn>
      <RowBtn label={downloadLabel} busy={busy} onClick={() => onAction(target, "download")}>
        {busy && state.intent === "download" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <ArrowDownToLine size={16} />
        )}
      </RowBtn>
    </div>
  );
}

function ActionStatus({ state }: { state: ActionState | undefined }) {
  const t = useT();
  if (!state) return null;
  if (state.status === "resolving")
    return <span className="text-[11.5px] text-ink-muted">{t("Getting a link…")}</span>;
  if (state.status === "queued")
    return <span className="text-[11.5px] text-accent">{t("Added to Offline downloads")}</span>;
  if (state.status === "saved")
    return (
      <span className="text-[11.5px] text-accent">{t("Sent to your browser's downloads")}</span>
    );
  return (
    <span role="alert" className="text-[11.5px] text-danger">
      {state.message}
    </span>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold transition duration-150 active:scale-[0.96] ${
        active
          ? "bg-ink text-canvas"
          : "bg-elevated/50 text-ink-muted ring-1 ring-edge-soft hover:bg-elevated hover:text-ink"
      }`}
    >
      {label}
      <span className={`tabular-nums ${active ? "text-canvas/70" : "text-ink-subtle"}`}>
        {count}
      </span>
    </button>
  );
}

function PageBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) onClick();
      }}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-[color,background-color,transform] duration-150 hover:bg-ink/10 hover:text-ink active:scale-[0.96] aria-disabled:opacity-40 motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}

function RowBtn({
  label,
  onClick,
  busy = false,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  expanded?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-busy={busy}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-subtle transition-[color,background-color,transform] duration-150 hover:bg-ink/10 hover:text-ink active:scale-[0.96] aria-busy:opacity-50 motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}
