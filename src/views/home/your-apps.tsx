import { useMemo, useState } from "react";
import { Check, Pencil, Settings2, Tv } from "lucide-react";
import { APP_TARGETS, openApp, type ExtraApp } from "@/lib/apps/launch";
import { useT } from "@/lib/i18n";
import { usePlaylists } from "@/lib/iptv/playlists-store";
import { SERVICES } from "@/lib/providers/streaming";
import { useSettings, type StreamingService } from "@/lib/settings";
import { useView } from "@/lib/view";

type AppId = StreamingService | ExtraApp;

const EXTRA_NAMES: Record<ExtraApp, { name: string; tint: string }> = {
  youtubetv: { name: "YouTube TV", tint: "#FF0000" },
  youtube: { name: "YouTube", tint: "#FF0000" },
  plex: { name: "Plex", tint: "#E5A00D" },
  samsungtvplus: { name: "Samsung TV Plus", tint: "#1428A0" },
};

/** Shown until the viewer picks their own. */
const POPULAR: AppId[] = [
  "netflix",
  "prime",
  "youtubetv",
  "disney",
  "max",
  "hulu",
  "peacock",
  "paramount",
  "plutotv",
  "tubi",
  "roku",
  "samsungtvplus",
];

const PICKED_KEY = "jl.home.apps.extra.v1";

function readExtras(): ExtraApp[] {
  try {
    const v = JSON.parse(localStorage.getItem(PICKED_KEY) ?? "null") as unknown;
    return Array.isArray(v) ? (v.filter((x) => x in EXTRA_NAMES) as ExtraApp[]) : [];
  } catch {
    return [];
  }
}

function nameOf(id: AppId): string {
  return id in EXTRA_NAMES
    ? EXTRA_NAMES[id as ExtraApp].name
    : SERVICES[id as StreamingService].name;
}

/**
 * "Your apps": the viewer's subscription apps (Netflix, Prime Video, YouTube TV...), opened from
 * Home. JL Media Vision is the hub and player on their TV or PC; the services play in their own
 * apps (the TV app opens them, a PC opens their website).
 */
export function YourApps() {
  const t = useT();
  const { settings, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const [extras, setExtras] = useState<ExtraApp[]>(readExtras);

  const picked = useMemo(() => {
    const services = (Object.keys(settings.streaming) as StreamingService[]).filter(
      (s) => settings.streaming[s] && APP_TARGETS[s],
    );
    return [...services, ...extras] as AppId[];
  }, [settings.streaming, extras]);
  const shown = picked.length ? picked : POPULAR;
  const all = useMemo(
    () =>
      [
        ...(Object.keys(SERVICES) as StreamingService[]).filter((s) => APP_TARGETS[s]),
        ...(Object.keys(EXTRA_NAMES) as ExtraApp[]),
      ] as AppId[],
    [],
  );

  const toggle = (id: AppId) => {
    if (id in EXTRA_NAMES) {
      const next = extras.includes(id as ExtraApp)
        ? extras.filter((x) => x !== id)
        : [...extras, id as ExtraApp];
      setExtras(next);
      try {
        localStorage.setItem(PICKED_KEY, JSON.stringify(next));
      } catch {
        /* kept for this session */
      }
      return;
    }
    const s = id as StreamingService;
    update({ streaming: { ...settings.streaming, [s]: !settings.streaming[s] } });
  };
  const isOn = (id: AppId) =>
    id in EXTRA_NAMES
      ? extras.includes(id as ExtraApp)
      : !!settings.streaming[id as StreamingService];

  return (
    <section aria-label={t("Your apps")} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-semibold tracking-tight text-ink">{t("Your apps")}</h2>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] font-semibold text-ink-muted outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-accent"
        >
          {editing ? <Check size={14} /> : <Pencil size={14} />}
          {editing ? t("Done") : t("Choose apps")}
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(editing ? all : shown).map((id) => {
          const service = id in EXTRA_NAMES ? null : SERVICES[id as StreamingService];
          const tint = service?.tint ?? EXTRA_NAMES[id as ExtraApp].tint;
          const on = isOn(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={editing ? on : undefined}
              onClick={() => (editing ? toggle(id) : openApp(APP_TARGETS[id]!, nameOf(id)))}
              title={nameOf(id)}
              className={`relative flex h-[84px] w-[150px] shrink-0 items-center justify-center rounded-2xl border px-4 outline-none transition-transform duration-150 focus-visible:scale-[1.04] focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97] ${
                editing && !on ? "border-edge-soft opacity-45" : "border-white/10"
              }`}
              style={{ background: `linear-gradient(135deg, ${tint}33, ${tint}0d)` }}
            >
              {service ? (
                <img
                  src={service.logo}
                  alt={service.name}
                  draggable={false}
                  className="max-h-[34px] max-w-[110px] object-contain"
                  style={service.logoFilter ? { filter: service.logoFilter } : undefined}
                />
              ) : (
                <span className="text-[15px] font-bold text-white">{nameOf(id)}</span>
              )}
              {editing && on && (
                <span className="absolute end-2 top-2 grid size-5 place-items-center rounded-full bg-accent text-black">
                  <Check size={13} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * "Set up your sources": a new account starts empty (its own container, like a Stremio account),
 * so Home says where its media comes from until it has a streaming service key or a TV playlist.
 */
export function SetupSources() {
  const t = useT();
  const { settings } = useSettings();
  const playlists = usePlaylists();
  const { openSettings } = useView();
  const hasSources =
    [settings.rdKey, settings.pmKey, settings.adKey, settings.tbKey, settings.dlKey].some(
      (k) => !!k?.trim(),
    ) || playlists.length > 0;
  if (hasSources) return null;
  return (
    <section
      aria-label={t("Set up your sources")}
      className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent/20 text-accent">
          <Tv size={24} />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] font-semibold tracking-tight text-ink">
            {t("Set up your sources")}
          </h2>
          <p className="max-w-[640px] text-[14px] leading-relaxed text-ink-muted">
            {t(
              "JL Media Vision plays your own media. Browse movies and shows now; to watch them, add your Real-Debrid or Premiumize account. For live TV, add your M3U or Xtream playlist, or start with free channels in Live TV.",
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openSettings("streaming")}
          className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13.5px] font-semibold text-black outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Settings2 size={15} />
          {t("Add Real-Debrid or Premiumize")}
        </button>
        <button
          type="button"
          onClick={() => openSettings("library")}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-[13.5px] font-semibold text-ink outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Tv size={15} />
          {t("Add an M3U or Xtream playlist")}
        </button>
      </div>
    </section>
  );
}
