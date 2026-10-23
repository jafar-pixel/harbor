import { useMemo, useState } from "react";
import { Download, ExternalLink, Plus, Trash2, X } from "lucide-react";

type ArtworkType = "hero" | "wallpaper" | "card" | "story" | "wordmark";
type Rights = "reference" | "permission_pending" | "licensed" | "owned";
type RecordItem = {
  id: string; sourceUrl: string; title: string; creator: string;
  team: string; kind: ArtworkType; rights: Rights; addedAt: string;
};
const STORAGE_KEY = "jl:sports:fanart-sources:v1";
const BOARD = "https://www.pinterest.com/skullsparks/college-football-graphics/";
const TEAMS = ["Oregon", "Ohio State", "Alabama", "Miami", "Penn State", "Seattle Seahawks", "Philadelphia Eagles", "Chicago Bears", "Detroit Lions", "Gallaudet"];
const TYPES: ArtworkType[] = ["hero", "wallpaper", "card", "story", "wordmark"];
const RIGHTS: Rights[] = ["reference", "permission_pending", "licensed", "owned"];

function load(): RecordItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((x) => x && typeof x.id === "string" && typeof x.sourceUrl === "string") : [];
  } catch { return []; }
}
function canonicalUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (!["https:", "http:"].includes(url.protocol)) return null;
    url.hash = ""; url.search = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}
function teamFromText(text: string): string {
  const q = text.toLowerCase();
  return TEAMS.find((team) => q.includes(team.toLowerCase())) ?? "Unassigned";
}
export function SportsFanartImporter({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState<RecordItem[]>(load);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [team, setTeam] = useState("Auto-detect");
  const [kind, setKind] = useState<ArtworkType>("hero");
  const [rights, setRights] = useState<Rights>("reference");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const filtered = useMemo(() => filter === "All" ? records : records.filter((r) => r.team === filter), [records, filter]);
  const save = (items: RecordItem[]) => {
    setRecords(items);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch { setError("Browser storage is unavailable. Export your records to preserve them."); }
  };
  const add = () => {
    const normalized = canonicalUrl(url);
    if (!normalized) { setError("Enter a valid HTTP or HTTPS source link."); return; }
    if (records.some((r) => canonicalUrl(r.sourceUrl) === normalized)) { setError("This source is already in your collection."); return; }
    const inferred = teamFromText(title + " " + normalized.replace(/[\-_]/g, " "));
    const item: RecordItem = {
      id: crypto.randomUUID(), sourceUrl: normalized, title: title.trim() || "Untitled artwork",
      creator: normalized.includes("pinterest.") ? "Verify original creator" : "Unknown",
      team: team === "Auto-detect" ? inferred : team, kind, rights, addedAt: new Date().toISOString(),
    };
    save([item, ...records]); setUrl(""); setTitle(""); setError("");
  };
  const update = (id: string, values: Partial<RecordItem>) => save(records.map((r) => r.id === id ? { ...r, ...values } : r));
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, board: BOARD, exportedAt: new Date().toISOString(), records }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = href; anchor.download = "jl-sports-fanart-sources.json"; anchor.click(); URL.revokeObjectURL(href);
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="Sports fanart sources" className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-edge bg-canvas text-ink shadow-2xl">
        <header className="flex items-center justify-between border-b border-edge px-5 py-4">
          <div><h2 className="text-lg font-semibold">Sports Hub · Fanart Sources</h2><p className="text-xs text-ink-muted">Collect sources, classify artwork, and review rights before publishing.</p></div>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-2 hover:bg-elevated"><X size={18}/></button>
        </header>
        <div className="space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-edge p-3 text-sm">
            <span>Reference board: <a className="underline" href={BOARD} target="_blank" rel="noopener noreferrer">SkullSparks College Football Graphics <ExternalLink size={12} className="inline"/></a></span>
            <button className="flex items-center gap-2 rounded-lg border border-edge px-3 py-2 hover:bg-elevated disabled:opacity-40" disabled={!records.length} onClick={exportJson}><Download size={15}/> Export JSON ({records.length})</button>
          </div>
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-edge bg-elevated/40 p-3 sm:grid-cols-2">
            <label className="text-xs">Pin or original artist URL<input className="mt-1 w-full rounded-lg border border-edge bg-canvas p-2 text-sm" placeholder="https://www.pinterest.com/pin/..." value={url} onChange={(e) => setUrl(e.target.value)}/></label>
            <label className="text-xs">Artwork title<input className="mt-1 w-full rounded-lg border border-edge bg-canvas p-2 text-sm" placeholder="Oregon game day graphic" value={title} onChange={(e) => setTitle(e.target.value)}/></label>
            <label className="text-xs">Team<select className="mt-1 w-full rounded-lg border border-edge bg-canvas p-2 text-sm" value={team} onChange={(e) => setTeam(e.target.value)}>{["Auto-detect", "Unassigned", ...TEAMS].map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="text-xs">Artwork slot<select className="mt-1 w-full rounded-lg border border-edge bg-canvas p-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value as ArtworkType)}>{TYPES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <label className="text-xs">Usage rights<select className="mt-1 w-full rounded-lg border border-edge bg-canvas p-2 text-sm" value={rights} onChange={(e) => setRights(e.target.value as Rights)}>{RIGHTS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
            <div className="flex items-end"><button onClick={add} className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-canvas"><Plus size={16}/> Add source</button></div>
          </div>
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          <p className="text-xs text-ink-muted">Links and metadata are saved in this browser only, not uploaded to Supabase. Automatic team detection uses text matching. Reference-only and pending artwork must not be published.</p>
          <label className="flex items-center gap-2 text-xs">Filter team <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-edge bg-canvas p-2">{["All", "Unassigned", ...TEAMS].map((t) => <option key={t}>{t}</option>)}</select></label>
          {filtered.length === 0 && <div className="rounded-xl border border-dashed border-edge p-8 text-center text-sm text-ink-muted">No sources collected yet. Add a Pinterest pin or artist link above.</div>}
          <div className="space-y-2">{filtered.map((item) => <div key={item.id} className="grid gap-2 rounded-xl border border-edge p-3 text-xs sm:grid-cols-[1fr_auto]">
            <div className="min-w-0"><div className="truncate font-semibold">{item.title}</div><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-ink-muted underline">{item.sourceUrl}</a></div>
            <button title="Remove source" aria-label={"Remove " + item.title} onClick={() => save(records.filter((r) => r.id !== item.id))} className="justify-self-end rounded-lg p-2 hover:bg-elevated"><Trash2 size={16}/></button>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <select aria-label="Team" className="rounded border border-edge bg-canvas p-1.5" value={item.team} onChange={(e) => update(item.id, {team: e.target.value})}>{["Unassigned", ...TEAMS].map((t) => <option key={t}>{t}</option>)}</select>
              <select aria-label="Artwork slot" className="rounded border border-edge bg-canvas p-1.5" value={item.kind} onChange={(e) => update(item.id, {kind: e.target.value as ArtworkType})}>{TYPES.map((s) => <option key={s}>{s}</option>)}</select>
              <select aria-label="Usage rights" className="rounded border border-edge bg-canvas p-1.5" value={item.rights} onChange={(e) => update(item.id, {rights: e.target.value as Rights})}>{RIGHTS.map((s) => <option key={s}>{s}</option>)}</select>
              <span className="self-center text-ink-muted">{item.rights === "licensed" || item.rights === "owned" ? "Rights marked for review" : "Reference only — not publishable"}</span>
            </div>
          </div>)}</div>
        </div>
      </section>
    </div>
  );
}
