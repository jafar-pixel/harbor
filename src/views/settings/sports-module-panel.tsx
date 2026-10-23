import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Database, Images, ShieldCheck } from "lucide-react";
import { readVisionSession, type VisionSession } from "@/lib/sports/vision-session";

const FUNCTION_URL = "https://ajbjyjfiglzodbdcdapr.supabase.co/functions/v1/jl-sports-fanart-source";
const PROVIDERS = ["pinterest", "sportsdb", "collegefootballdata", "artist_feed", "manual_library"] as const;
type Provider = typeof PROVIDERS[number];
type Connector = { id: string; name: string; provider: Provider; source_url: string | null; enabled: boolean; sync_interval_hours: number; last_sync_at: string | null; last_error: string | null };
type AuthSession = VisionSession;
async function callRegistry(session: AuthSession, method: "GET" | "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>): Promise<{ items?: Connector[]; deleted?: boolean }> {
  const response = await fetch(FUNCTION_URL + "?resource=connectors", {
    method,
    headers: { apikey: session.publishableKey, Authorization: "Bearer " + session.accessToken, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({})) as { items?: Connector[]; error?: string; deleted?: boolean };
  if (!response.ok) throw new Error(data.error || "Cloud request failed (HTTP " + response.status + ")");
  return data;
}

export function SportsModulePanel() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [items, setItems] = useState<Connector[]>([]);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("artist_feed");
  const [url, setUrl] = useState("");
  const [hours, setHours] = useState(24);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async (auth: AuthSession) => {
    const response = await callRegistry(auth, "GET");
    setItems(response.items || []);
    setMessage("Backend source registry loaded.");
  }, []);
  useEffect(() => { let active = true; void readVisionSession().then(value => { if (active) setSession(value); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!session) return;
    void refresh(session).catch(e => setMessage(e instanceof Error ? e.message : "Cannot load sources"));
  }, [session, refresh]);
  const run = async (fn: (s: AuthSession) => Promise<void>) => {
    if (!session) return;
    setWorking(true); setMessage("");
    try { await fn(session); await refresh(session); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Operation failed"); }
    finally { setWorking(false); }
  };
  return <section className="space-y-5">
    <div className="rounded-2xl border border-edge-soft/60 bg-surface/35 p-5">
      <div className="flex items-center gap-3"><Images size={22}/><h2 className="text-lg font-semibold">Sports Module Setup · Artwork Sources</h2></div>
      <p className="mt-2 text-sm text-ink-muted">Configure backend connectors. Import workers run on the server; reference artwork is never automatically published.</p>
    </div>
    {!session ? <div className="rounded-xl border border-edge-soft/60 p-4 space-y-2">
      <p className="font-semibold">JL Vision cloud account not connected</p>
      <p className="text-sm text-ink-muted">Sports settings require an authenticated JL Vision Supabase session provided by the app's account bridge. A Stremio login is not accepted as a Supabase session.</p>
      <button className="rounded-lg border border-edge-soft/60 px-3 py-2 text-sm" onClick={() => { void readVisionSession().then(setSession); }}>Check account connection</button>
    </div> : <>
      <div className="rounded-xl border border-edge-soft/60 p-4 space-y-3">
        <h3 className="font-semibold">Add artwork source</h3>
        <input aria-label="Source name" className="w-full rounded-lg border border-edge bg-canvas p-2 text-sm" placeholder="Source name" value={name} onChange={e=>setName(e.target.value)} />
        <select aria-label="Provider" className="w-full rounded-lg border border-edge bg-canvas p-2 text-sm" value={provider} onChange={e=>setProvider(e.target.value as Provider)}>{PROVIDERS.map(p=><option key={p} value={p}>{p.replaceAll("_"," ")}</option>)}</select>
        <input aria-label="Source URL" className="w-full rounded-lg border border-edge bg-canvas p-2 text-sm" placeholder="https://authorized-source.example" value={url} onChange={e=>setUrl(e.target.value)} />
        <label className="flex items-center gap-3 text-sm">Sync interval (hours) <input type="number" min={1} max={168} className="w-24 rounded-lg border border-edge bg-canvas p-2" value={hours} onChange={e=>setHours(Number(e.target.value))} /></label>
        <button disabled={working || !name.trim() || !Number.isInteger(hours) || hours<1 || hours>168} onClick={()=>void run(async s=>{ await callRegistry(s,"POST",{name:name.trim(),provider,source_url:url.trim()||null,enabled:false,sync_interval_hours:hours});setName("");setUrl("");})} className="rounded-lg bg-ink px-4 py-2 text-sm text-canvas disabled:opacity-50">Save source</button>
      </div>
      <div className="space-y-2">{items.map(item=><div key={item.id} className="rounded-xl border border-edge-soft/60 p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong>{item.name}</strong><span>{item.provider}</span></div>
        <p className="truncate text-xs text-ink-muted">{item.source_url || "No source URL"}</p>
        <p className="text-xs text-ink-muted">Every {item.sync_interval_hours} hours · {item.last_sync_at ? "Last run "+item.last_sync_at : "Never synced"}{item.last_error ? " · "+item.last_error : ""}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button disabled={working} onClick={()=>void run(async s=>{await callRegistry(s,"PATCH",{id:item.id,enabled:!item.enabled});})} className="rounded-lg border border-edge px-3 py-1.5">{item.enabled ? "Disable" : "Enable"}</button>
          <button disabled={working} onClick={()=>void run(async s=>{await callRegistry(s,"DELETE",{id:item.id});})} className="rounded-lg border border-edge px-3 py-1.5">Remove</button>
        </div>
      </div>)}</div>
      <button className="rounded-lg border border-edge px-3 py-2 text-sm" disabled={working} onClick={()=>void run(async()=>{})}>Reload cloud sources</button>
    </>}
    {message && <p role="status" className="text-sm text-ink-muted">{message}</p>}
    <div className="rounded-xl border border-edge-soft/60 p-4">
      <p className="flex items-center gap-2 font-semibold"><Database size={17}/> JL Vision Supabase</p>
      <p className="mt-2 flex items-center gap-2 text-sm"><ShieldCheck size={16}/> Only approved, licensed artwork is publishable.</p>
      <a href="https://supabase.com/dashboard/project/ajbjyjfiglzodbdcdapr/functions" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 text-sm underline">Backend functions <ExternalLink size={14}/></a>
    </div>
  </section>;
}
