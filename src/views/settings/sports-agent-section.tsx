import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Bot, EyeOff, MapPin, Pin } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { usePlaylists } from "@/lib/iptv/playlists-store";
import { getCachedPlaylist, subscribePlaylists } from "@/lib/iptv/store";
import type { IptvChannel } from "@/lib/iptv/types";
import { claudeAccount } from "@/lib/claude";
import { AiSearchError } from "@/lib/ai-errors";
import { US_STATES } from "@/lib/sports/agent/classify";
import { namesForClaude, sortWithClaude } from "@/lib/sports/agent/ai-sort";
import {
  agentEdit,
  agentLabel,
  agentVersion,
  channelAreaFit,
  clearAgentLabels,
  setAgentEdit,
  subscribeAgent,
} from "@/lib/sports/agent/store";
import { Section } from "./shared";
import { SettingRow } from "./kit";

/** Every channel the app has loaded, from all the viewer's sources (nothing is fetched here). */
function useLoadedChannels(): IptvChannel[] {
  const sources = usePlaylists();
  const [version, setVersion] = useState(0);
  useEffect(() => subscribePlaylists(() => setVersion((v) => v + 1)), []);
  return useMemo(() => {
    void version;
    const out: IptvChannel[] = [];
    for (const s of sources) {
      const p = getCachedPlaylist(s.id);
      if (p && !p.loading) out.push(...p.channels);
    }
    return out;
  }, [sources, version]);
}

type Group = { key: string; title: string; channels: IptvChannel[] };

const KIND_TITLE: Record<string, string> = {
  network: "Networks",
  local: "Your local stations",
  team: "Team channels",
  event: "Event feeds",
};

/**
 * Settings › Sports › Sports agent: the viewer's area, Claude's sorting of their channels, and
 * the lists it made, where any channel can be pinned (picked first) or hidden (never picked).
 */
export function SportsAgentSection() {
  const t = useT();
  const { settings, update } = useSettings();
  const channels = useLoadedChannels();
  const version = useSyncExternalStore(subscribeAgent, agentVersion);
  const [state, setState] = useState(settings.sportsAreaState ?? "");
  const [city, setCity] = useState(settings.sportsAreaCity ?? "");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const { groups, rules, ai, left } = useMemo(() => {
    void version;
    const byKey = new Map<string, Group>();
    let rules = 0;
    let ai = 0;
    const seen = new Set<string>();
    for (const c of channels) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      const label = agentLabel(c.name);
      if (!label || label.kind === "other") continue;
      if (label.by === "ai") ai += 1;
      else rules += 1;
      if (label.kind === "local" && channelAreaFit(c.name) === 0) continue;
      const key =
        label.kind === "network"
          ? `network:${label.network}`
          : label.kind === "event"
            ? `event:${label.league ?? label.network ?? "Other"}`
            : label.kind;
      const title =
        label.kind === "network"
          ? (label.network ?? "")
          : label.kind === "event"
            ? `${label.league ?? label.network ?? t("Other")} · ${t(KIND_TITLE.event)}`
            : t(KIND_TITLE[label.kind]);
      const g = byKey.get(key) ?? { key, title, channels: [] };
      g.channels.push(c);
      byKey.set(key, g);
    }
    const order = (g: Group) =>
      g.key === "local" ? 0 : g.key === "team" ? 1 : g.key.startsWith("network") ? 2 : 3;
    return {
      groups: [...byKey.values()].sort(
        (a, b) => order(a) - order(b) || a.title.localeCompare(b.title),
      ),
      rules,
      ai,
      left: namesForClaude(channels).length,
    };
  }, [channels, version, t]);

  const account = claudeAccount();
  const sort = async () => {
    if (!account) return;
    setError(null);
    setProgress({ done: 0, total: left });
    try {
      await sortWithClaude(account, channels, setProgress);
    } catch (e) {
      setError(e instanceof AiSearchError ? e.message : t("Claude couldn't sort your channels."));
    } finally {
      setProgress(null);
    }
  };
  const saveArea = () =>
    update({ sportsAreaState: state.trim().toUpperCase(), sportsAreaCity: city.trim() });

  return (
    <Section
      title={t("Sports agent")}
      subtitle={t(
        "Sorts your providers' channels into sports lists and picks the right one for each game: your local station, the real network in the best quality your TV shows, or the feed named after the game. Channels that fail for you go last.",
      )}
    >
      <SettingRow
        wide
        icon={<MapPin size={18} strokeWidth={2} />}
        label={t("Your area")}
        desc={t(
          "Your state and city pick your own local ABC, CBS, FOX and NBC stations. Saved to your account only.",
        )}
      >
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveArea();
          }}
        >
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            aria-label={t("State")}
            className="h-11 rounded-[8px] bg-canvas px-3 text-[15px] text-ink focus:outline-none focus:bg-elevated"
          >
            <option value="">{t("State")}</option>
            {[...US_STATES].sort().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("City (e.g. Portland)")}
            aria-label={t("City")}
            className="h-11 min-w-0 flex-1 rounded-[8px] bg-canvas px-3 text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none focus:bg-elevated"
          />
          <button
            type="submit"
            className="flex h-11 shrink-0 items-center rounded-[8px] bg-canvas px-4 text-[15px] font-semibold text-ink-muted hover:text-ink"
          >
            {t("Save")}
          </button>
        </form>
      </SettingRow>

      <SettingRow
        wide
        icon={<Bot size={18} strokeWidth={2} />}
        label={t("Sort with Claude")}
        desc={
          account
            ? t(
                "{rules} channels sorted by rules and {ai} by Claude. {left} sports channels still unsorted; Claude sorts them with your Anthropic key, once.",
                { rules, ai, left },
              )
            : t(
                "{rules} channels sorted by rules. Add your Anthropic key in Settings › AI search › Claude to have Claude sort the {left} it can't place.",
                { rules, left },
              )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!account || !!progress || left === 0}
            onClick={() => void sort()}
            className="flex h-11 items-center rounded-[8px] bg-canvas px-4 text-[15px] font-semibold text-ink-muted hover:text-ink disabled:opacity-40"
          >
            {progress
              ? t("Sorting {done} of {total}…", progress)
              : left
                ? t("Sort {left} channels", { left })
                : t("All sorted")}
          </button>
          {ai > 0 && !progress && (
            <button
              type="button"
              onClick={clearAgentLabels}
              className="flex h-11 items-center rounded-[8px] px-3 text-[14px] text-ink-subtle hover:text-ink"
            >
              {t("Forget Claude's sorting")}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      </SettingRow>

      {groups.map((g) => (
        <div key={g.key} className="rounded-xl bg-canvas/40">
          <button
            type="button"
            aria-expanded={open === g.key}
            onClick={() => setOpen(open === g.key ? null : g.key)}
            className="flex w-full items-center justify-between px-4 py-3 text-start text-[15px] font-semibold text-ink"
          >
            <span>{g.title}</span>
            <span className="text-[13px] font-medium text-ink-subtle">{g.channels.length}</span>
          </button>
          {open === g.key && (
            <ul className="flex flex-col gap-1 px-2 pb-3">
              {g.channels.slice(0, 200).map((c) => {
                const edit = agentEdit(c.name);
                return (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                    <span
                      className={`min-w-0 flex-1 truncate text-[14px] ${edit === "hide" ? "text-ink-subtle line-through" : "text-ink"}`}
                    >
                      {c.name}
                    </span>
                    <button
                      type="button"
                      aria-pressed={edit === "pin"}
                      title={t("Pin: pick this channel first")}
                      onClick={() => setAgentEdit(c.name, edit === "pin" ? null : "pin")}
                      className={`flex h-9 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold ${edit === "pin" ? "bg-accent text-white" : "bg-canvas text-ink-muted hover:text-ink"}`}
                    >
                      <Pin size={14} /> {t("Pin")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={edit === "hide"}
                      title={t("Hide: never pick this channel")}
                      onClick={() => setAgentEdit(c.name, edit === "hide" ? null : "hide")}
                      className={`flex h-9 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold ${edit === "hide" ? "bg-danger text-white" : "bg-canvas text-ink-muted hover:text-ink"}`}
                    >
                      <EyeOff size={14} /> {t("Hide")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </Section>
  );
}
