import { ExternalLink, Database, Images, ShieldCheck } from "lucide-react";

const SOURCE_TYPES = [
  { name: "Pinterest", detail: "Official authorized board API; third-party boards require access", status: "Authorization required" },
  { name: "SportsDB / CollegeFootballData", detail: "Team IDs, logos and metadata from configured sports providers", status: "Provider integration" },
  { name: "Artist & studio feeds", detail: "Licensed creator-provided asset feeds or uploads", status: "Supported source category" },
  { name: "Your artwork library", detail: "Approved fanart from the existing Supabase publication catalog", status: "Existing database" },
];

export function SportsModulePanel() {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-edge-soft/60 bg-surface/35 p-5">
        <div className="flex items-center gap-3"><Images size={22}/><h2 className="text-lg font-semibold">Sports artwork sources</h2></div>
        <p className="mt-2 text-sm text-ink-muted">Fanart discovery is a backend plugin, not a viewer-side importer. Multiple source connectors can feed the same rights-reviewed team artwork catalog.</p>
      </div>
      <div className="grid gap-3">
        {SOURCE_TYPES.map((source) => (
          <div className="rounded-xl border border-edge-soft/60 bg-elevated/30 p-4" key={source.name}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{source.name}</h3>
              <span className="rounded-full border border-edge-soft/60 px-2.5 py-1 text-xs text-ink-muted">{source.status}</span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">{source.detail}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-edge-soft/60 p-4">
        <div className="flex items-center gap-2 font-medium"><Database size={17}/> Storage & sync</div>
        <p className="mt-2 text-sm text-ink-muted">JL Vision Supabase hosts the backend function and sports_fanart_sources table. Authorized sources save metadata centrally; approved images remain separate. A verified authenticated session and publisher approval are required to operate it.</p>
        <p className="mt-3 flex items-center gap-2 text-sm"><ShieldCheck size={16}/> Reference-only artwork is never automatically published.</p>
      </div>
      <p className="text-xs text-ink-muted">Source configuration is managed on the server. This screen describes available providers but does not collect API keys or claim that unconfigured providers are active. The backend connector and live synchronization must be verified separately.</p>
      <a href="https://supabase.com/dashboard/project/ajbjyjfiglzodbdcdapr/functions" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm underline underline-offset-4">Open backend functions <ExternalLink size={14}/></a>
    </section>
  );
}
