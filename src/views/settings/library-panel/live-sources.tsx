import { useEffect, useState } from "react";
import { Check, Pencil, Plus, RefreshCw, Trash2, Tv } from "lucide-react";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import { EMPTY_PLAYLIST_FORM, type PlaylistFormValue } from "@/lib/iptv/playlist-entry";
import type { IptvPlaylistSource } from "@/lib/iptv/types";
import { PlaylistForm } from "@/views/live/source-picker/playlist-form";

const CARD =
  "flex min-h-[112px] w-full flex-col justify-between gap-3 rounded-2xl border p-4 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent";
const SMALL =
  "flex h-10 items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 text-[13px] font-semibold text-ink-muted outline-none transition-colors hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40";

const KIND_LABEL: Record<string, string> = { m3u: "M3U", xtream: "Xtream", epg: "Guide only" };

type Editing = { mode: "add"; initial: PlaylistFormValue } | { mode: "edit"; id: string };

/**
 * Settings › Library & metadata › Live TV: the viewer's Live TV sources as cards, one press to
 * watch one, and adding or editing on a full-screen form whose buttons are always on screen.
 */
export function LiveSources({
  sources,
  activeId,
  channelCount,
  loading,
  onSelect,
  onAdd,
  onEdit,
  onRemove,
  onRefresh,
}: {
  sources: IptvPlaylistSource[];
  activeId: string | null;
  channelCount: number | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onAdd: (entry: PlaylistFormValue) => void;
  onEdit: (id: string, entry: PlaylistFormValue) => void;
  onRemove: (id: string) => void;
  onRefresh: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState<Editing | null>(null);
  const editingSource =
    editing?.mode === "edit" ? (sources.find((s) => s.id === editing.id) ?? null) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={() => setEditing({ mode: "add", initial: EMPTY_PLAYLIST_FORM })}
          className={`${CARD} border-dashed border-white/20 bg-white/[0.03] hover:bg-white/[0.07]`}
        >
          <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-ink">
            <Plus size={20} />
          </span>
          <span>
            <span className="block text-[16px] font-semibold text-ink">{t("Add source")}</span>
            <span className="block text-[13px] text-ink-muted">
              {t("An M3U link or an Xtream login")}
            </span>
          </span>
        </button>

        {sources.map((s) => {
          const active = s.id === activeId;
          return (
            <div
              key={s.id}
              className={`flex flex-col gap-2 rounded-2xl border p-2 ${
                active ? "border-accent/60 bg-accent/[0.06]" : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(s.id)}
                className={`${CARD} min-h-[88px] border-transparent hover:bg-white/[0.05]`}
              >
                <span className="flex items-center gap-2">
                  <Tv size={16} className="shrink-0 text-ink-subtle" />
                  <span className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ink">
                    {s.name}
                  </span>
                  {active && (
                    <span className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-black">
                      <Check size={12} />
                      {t("Watching")}
                    </span>
                  )}
                </span>
                <span className="text-[13px] text-ink-muted">
                  {t(KIND_LABEL[s.kind ?? "m3u"] ?? "M3U")}
                  {s.epgUrl ? ` · ${t("with guide")}` : ""}
                  {active && channelCount != null
                    ? ` · ${t("{n} channels", { n: channelCount.toLocaleString() })}`
                    : ""}
                </span>
              </button>
              <div className="flex flex-wrap gap-2 px-2 pb-1">
                <button
                  type="button"
                  className={SMALL}
                  onClick={() => setEditing({ mode: "edit", id: s.id })}
                >
                  <Pencil size={14} />
                  {t("Edit")}
                </button>
                {active && (
                  <button type="button" className={SMALL} onClick={onRefresh} disabled={loading}>
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    {t("Refresh")}
                  </button>
                )}
                <button
                  type="button"
                  className={SMALL}
                  onClick={async () => {
                    if (await confirmDialog(t('Remove playlist "{name}"?', { name: s.name })))
                      onRemove(s.id);
                  }}
                >
                  <Trash2 size={14} />
                  {t("Remove")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <FullScreenForm
          title={editing.mode === "add" ? t("Add source") : t("Edit source")}
          onClose={() => setEditing(null)}
        >
          {editing.mode === "add" ? (
            <PlaylistForm
              initial={editing.initial}
              submitLabel={t("Add")}
              actionsOnTop
              onCancel={() => setEditing(null)}
              onSubmit={(v) => {
                onAdd(v);
                setEditing(null);
              }}
            />
          ) : editingSource ? (
            <PlaylistForm
              initial={{
                name: editingSource.name,
                kind: editingSource.kind ?? "m3u",
                url: editingSource.url,
                epgUrl: editingSource.epgUrl ?? "",
                xtream: editingSource.xtream ?? { server: "", username: "", password: "" },
              }}
              submitLabel={t("Save")}
              actionsOnTop
              onCancel={() => setEditing(null)}
              onSubmit={(v) => {
                onEdit(editingSource.id, v);
                setEditing(null);
              }}
            />
          ) : null}
        </FullScreenForm>
      )}
    </div>
  );
}

function FullScreenForm({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onBack = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("harbor:local-back", onBack, true);
    return () => window.removeEventListener("harbor:local-back", onBack, true);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-label={title}
      data-tv-focus-scope="true"
      className="fixed inset-0 z-[400] flex justify-center overflow-y-auto bg-canvas/95 px-4 py-[6vh] backdrop-blur-md"
    >
      <div className="flex h-fit w-full max-w-[760px] flex-col gap-2 rounded-3xl border border-white/10 bg-elevated p-4">
        <h2 className="px-3 pt-2 text-[22px] font-semibold tracking-tight text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}
