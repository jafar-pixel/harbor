import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useJlSession } from "@/lib/jl/account/client";
import { monogram } from "@/lib/jl/sports/team-look";
import { useCfbdVisionLinks } from "@/lib/jl/sports/use-cfbd";
import { espnLeagueOf, useVisionVersion, vision } from "@/lib/jl/sports/vision";
import type { VisionTeam } from "@/lib/jl/sports/vision-branding";
import { useView } from "@/lib/view";

/** The JL team database's leagues for each Harbor league key. */
export const VISION_LEAGUES: Record<string, string[]> = {
  NFL: ["nfl"],
  NBA: ["nba"],
  MLB: ["mlb"],
  NHL: ["nhl"],
  NCAAF: ["ncaa-fbs", "ncaa-diii"],
};

/** Teams of a Harbor league in the JL team database, by name. */
export function visionTeamsOf(leagueKey: string): VisionTeam[] {
  const leagues = VISION_LEAGUES[leagueKey];
  if (!leagues) return [];
  return vision
    .teams()
    .filter((team) => leagues.includes(team.league))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every team of a league from the JL team database, with its approved logo and colours: filter by
 * conference or division, search by name or mascot, and open the team's page (record, schedule,
 * roster) in one click.
 */
export function VisionTeams({ leagueKey, label }: { leagueKey: string; label: string }) {
  const t = useT();
  const session = useJlSession();
  const { openSportsPage } = useView();
  useVisionVersion();
  useCfbdVisionLinks();
  const all = visionTeamsOf(leagueKey);
  const [conference, setConference] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const conferences = useMemo(() => {
    const names = new Map(vision.groups().map((g) => [g.slug, g.name] as const));
    const seen = new Map<string, string>();
    for (const team of all)
      seen.set(team.conference, names.get(team.conference) ?? team.conference);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const active =
    conference && conferences.some(([slug]) => slug === conference) ? conference : null;
  const q = query.trim().toLowerCase();
  const shown = all.filter(
    (team) =>
      (!active || team.conference === active) &&
      (!q || team.name.toLowerCase().includes(q) || team.mascot?.toLowerCase().includes(q)),
  );

  const open = (team: VisionTeam) => {
    const espn = espnLeagueOf(leagueKey);
    const id = espn ? vision.providerId(team.key, "espn", espn) : null;
    if (id) {
      openSportsPage({ kind: "team", league: leagueKey, teamId: id, name: team.name });
      return;
    }
    const college = vision.providerId(team.key, "ncaa", "college");
    if (college) {
      openSportsPage({ kind: "college", collegeId: `ncaa:${college}`, name: team.name });
      return;
    }
    openSportsPage({ kind: "conferences", group: team.conference, team: team.key });
  };

  if (!session)
    return (
      <p className="text-[14px] text-ink-muted">
        {t("Sign in to your JL account to see every team.")}
      </p>
    );
  if (!all.length)
    return (
      <p className="text-[14px] text-ink-muted">
        {vision.status() === "error"
          ? t("The team database couldn't be reached. It will try again shortly.")
          : t("Loading teams…")}
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[22px] font-semibold text-ink">
          {t("{league} teams", { league: label })}{" "}
          <span className="text-[15px] font-medium text-ink-subtle">{shown.length}</span>
        </h2>
        <label className="flex h-10 w-full max-w-[300px] items-center gap-2 rounded-full border border-edge-soft bg-elevated/40 px-4 focus-within:border-edge">
          <Search size={16} className="text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search teams")}
            aria-label={t("Search teams")}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-subtle"
          />
        </label>
      </div>
      {conferences.length > 1 && (
        <div
          role="group"
          aria-label={t("Conference")}
          className="hot-sport-strip harbor-scroll flex gap-2 overflow-x-auto pb-1"
        >
          <button
            className="shrink-0 whitespace-nowrap"
            aria-pressed={!active}
            onClick={() => setConference(null)}
          >
            {t("All")}
          </button>
          {conferences.map(([slug, name]) => (
            <button
              key={slug}
              className="shrink-0 whitespace-nowrap"
              aria-pressed={active === slug}
              onClick={() => setConference(slug)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {shown.map((team) => (
          <li key={team.key}>
            <TeamCard team={team} onOpen={() => open(team)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeamCard({ team, onOpen }: { team: VisionTeam; onOpen: () => void }) {
  const theme = vision.theme(team.key);
  const logo = vision.logoUrl(team.key);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex aspect-[3/4] w-full flex-col items-center justify-between gap-2 overflow-hidden rounded-2xl border border-edge-soft bg-elevated/70 p-4 text-center transition-colors hover:border-edge hover:bg-elevated"
      style={
        theme
          ? {
              backgroundImage: `linear-gradient(180deg, #${theme.primary}33, transparent 70%)`,
              boxShadow: `inset 0 -4px 0 #${theme.primary}`,
            }
          : undefined
      }
    >
      <span className="flex flex-1 items-center justify-center">
        {logo && !failed ? (
          <img
            src={logo}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
            className="max-h-[90px] max-w-[90px] object-contain"
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-canvas/60 text-[22px] font-black text-ink">
            {monogram(team.name)}
          </span>
        )}
      </span>
      <span className="flex flex-col">
        <span className="line-clamp-2 text-[13.5px] font-semibold text-ink">{team.name}</span>
        {team.mascot && <span className="text-[11.5px] text-ink-subtle">{team.mascot}</span>}
      </span>
    </button>
  );
}
