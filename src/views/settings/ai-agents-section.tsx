import { useEffect, useMemo, useState } from "react";
import { Bot, EyeOff, Film, Pin, Tv } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { usePlaylists } from "@/lib/iptv/playlists-store";
import { getCachedPlaylist, subscribePlaylists } from "@/lib/iptv/store";
import type { IptvChannel } from "@/lib/iptv/types";
import { claudeAccount } from "@/lib/claude";
import { AiSearchError } from "@/lib/ai-errors";
import { HOME_GENRES, cleanChannelName, type LiveGenre } from "@/lib/agents/live/genre";
import { liveNamesForClaude, RUN_LIMIT, sortLiveWithClaude } from "@/lib/agents/live/ai-sort";
import {
  clearLiveLabels,
  liveEdit,
  liveLabel,
  liveLabelCount,
  setLiveEdit,
  useLiveAgentVersion,
} from "@/lib/agents/live/store";
import { cachedPicks, makePicks } from "@/lib/agents/picks";
import { useContinueWatching } from "@/lib/continue-watching";
import { Section } from "./shared";
import { SettingRow } from "./kit";

const GENRE_LABEL: Record<string, string> = {
  news: "News",
  kids: "Kids",
  movies: "Movie channels",
  entertainment: "Entertainment",
  documentary: "Documentary",
  lifestyle: "Home, food & travel",
  music: "Music",
  spanish: "Spanish",
  faith: "Faith",
};

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

/**
 * Settings › AI › AI agents: the Live TV agent (sorts the viewer's channels by kind for Live TV
 * Home's rows, with pin and hide) and the Movies & Shows agent (tonight's picks). Both run with
 * the viewer's own Anthropic key; the Sports agent lives in Settings › Sports.
 */
export function AiAgentsSection() {
  const t = useT();
  const { settings } = useSettings();
  const channels = useLoadedChannels();
  const version = useLiveAgentVersion();
  const account = claudeAccount();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<LiveGenre | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickMsg, setPickMsg] = useState<string | null>(null);
  const cw = useContinueWatching(undefined, 20);

  const { groups, sorted, left } = useMemo(() => {
    void version;
    const byGenre = new Map<LiveGenre, IptvChannel[]>();
    const seen = new Set<string>();
    let sorted = 0;
    for (const c of channels) {
      if (!c.name || seen.has(c.name)) continue;
      seen.add(c.name);
      const label = liveLabel(c.name, c.group);
      if (!label) continue;
      sorted += 1;
      if (!HOME_GENRES.includes(label.genre)) continue;
      const list = byGenre.get(label.genre) ?? [];
      list.push(c);
      byGenre.set(label.genre, list);
    }
    return {
      groups: HOME_GENRES.filter((g) => byGenre.has(g)).map((g) => ({
        genre: g,
        channels: byGenre.get(g)!,
      })),
      sorted,
      left: liveNamesForClaude(channels).length,
    };
  }, [channels, version]);

  const sort = async () => {
    if (!account) return;
    setError(null);
    setProgress({ done: 0, total: Math.min(left, RUN_LIMIT) });
    try {
      await sortLiveWithClaude(account, channels, setProgress);
    } catch (e) {
      setError(e instanceof AiSearchError ? e.message : t("Claude couldn't sort your channels."));
    } finally {
      setProgress(null);
    }
  };

  const refreshPicks = async () => {
    if (!account) return;
    setPicking(true);
    setPickMsg(null);
    try {
      const watching = cw.map((c) => c.name).filter(Boolean);
      const [m, s] = await Promise.all([
        makePicks(account, "movie", settings.tmdbKey, watching),
        makePicks(account, "series", settings.tmdbKey, watching),
      ]);
      setPickMsg(
        t("New picks: {m} movies and {s} shows. They show on Live TV Home.", {
          m: m.length,
          s: s.length,
        }),
      );
    } catch (e) {
      setPickMsg(e instanceof AiSearchError ? e.message : t("Claude couldn't make picks."));
    } finally {
      setPicking(false);
    }
  };
  const havePicks = !!(cachedPicks("movie") || cachedPicks("series"));

  return (
    <Section
      title={t("AI agents")}
      subtitle={t(
        "Agents that sort and pick for you with your own Anthropic key. The Sports agent is in Settings › Sports.",
      )}
    >
      <SettingRow
        wide
        icon={<Tv size={18} strokeWidth={2} />}
        label={t("Live TV agent")}
        desc={
          account
            ? t(
                "{sorted} channels sorted into News, Kids, Movies and more for Live TV Home. {left} still unsorted; Claude sorts up to {limit} per run, once each.",
                { sorted, left, limit: RUN_LIMIT },
              )
            : t(
                "{sorted} channels sorted by rules. Add your Anthropic key above to have Claude sort the {left} it can't place.",
                { sorted, left },
              )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!account || !!progress || left === 0}
            onClick={() => void sort()}
            className="flex h-11 items-center gap-2 rounded-[8px] bg-canvas px-4 text-[15px] font-semibold text-ink-muted hover:text-ink disabled:opacity-40"
          >
            <Bot size={16} />
            {progress
              ? t("Sorting {done} of {total}…", progress)
              : left
                ? t("Sort {n} channels", { n: Math.min(left, RUN_LIMIT) })
                : t("All sorted")}
          </button>
          {!progress && liveLabelCount() > 0 && (
            <button
              type="button"
              onClick={clearLiveLabels}
              className="flex h-11 items-center rounded-[8px] px-3 text-[14px] text-ink-subtle hover:text-ink"
            >
              {t("Forget Claude's sorting")}
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      </SettingRow>

      {groups.map((g) => (
        <div key={g.genre} className="rounded-xl bg-canvas/40">
          <button
            type="button"
            aria-expanded={open === g.genre}
            onClick={() => setOpen(open === g.genre ? null : g.genre)}
            className="flex w-full items-center justify-between px-4 py-3 text-start text-[15px] font-semibold text-ink"
          >
            <span>{t(GENRE_LABEL[g.genre] ?? g.genre)}</span>
            <span className="text-[13px] font-medium text-ink-subtle">{g.channels.length}</span>
          </button>
          {open === g.genre && (
            <ul className="flex flex-col gap-1 px-2 pb-3">
              {g.channels.slice(0, 200).map((c) => {
                const edit = liveEdit(c.name);
                return (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                    <span
                      title={c.name}
                      className={`min-w-0 flex-1 truncate text-[14px] ${edit === "hide" ? "text-ink-subtle line-through" : "text-ink"}`}
                    >
                      {cleanChannelName(c.name)}
                    </span>
                    <button
                      type="button"
                      aria-pressed={edit === "pin"}
                      title={t("Pin: show this channel first")}
                      onClick={() => setLiveEdit(c.name, edit === "pin" ? null : "pin")}
                      className={`flex h-9 items-center gap-1 rounded-full px-3 text-[12.5px] font-semibold ${edit === "pin" ? "bg-accent text-white" : "bg-canvas text-ink-muted hover:text-ink"}`}
                    >
                      <Pin size={14} /> {t("Pin")}
                    </button>
                    <button
                      type="button"
                      aria-pressed={edit === "hide"}
                      title={t("Hide: leave this channel out of Live TV Home")}
                      onClick={() => setLiveEdit(c.name, edit === "hide" ? null : "hide")}
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

      <SettingRow
        wide
        icon={<Film size={18} strokeWidth={2} />}
        label={t("Movies & Shows agent")}
        desc={
          account
            ? t(
                "Once a day Claude picks ten movies and ten shows for tonight from this week's popular titles, weighed against what you've been watching, with a line on why. They show on Live TV Home.",
              )
            : t("Add your Anthropic key above to get Claude's picks for tonight.")
        }
      >
        <button
          type="button"
          disabled={!account || picking}
          onClick={() => void refreshPicks()}
          className="flex h-11 items-center gap-2 rounded-[8px] bg-canvas px-4 text-[15px] font-semibold text-ink-muted hover:text-ink disabled:opacity-40"
        >
          <Bot size={16} />
          {picking ? t("Picking…") : havePicks ? t("New picks now") : t("Pick for tonight")}
        </button>
        {pickMsg && <p className="mt-2 text-[13px] text-ink-muted">{pickMsg}</p>}
      </SettingRow>
    </Section>
  );
}
