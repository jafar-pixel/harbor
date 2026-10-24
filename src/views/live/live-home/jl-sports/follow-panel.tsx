import { GraduationCap, Loader2, Search, Star, User, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  isFollowing,
  toggleFavoritePlayer,
  toggleFavoriteTeam,
  useJlFavoritePlayers,
  useJlSportsFavorites,
} from "@/lib/jl/sports/favorites";
import { toggleFollowCollege, useFollowedColleges } from "@/lib/jl/sports/college-follows";
import { collegeFavorite, collegeTeamId } from "@/lib/jl/sports/college-games";
import { collegeOfTeamId, loadColleges } from "@/lib/jl/sports/college-data";
import { divisionLabel, type College } from "@/lib/jl/sports/colleges";
import { logoUrl } from "@/lib/jl/sports/sidearm";
import { playerForFollow, searchTeamsAndPlayers } from "@/lib/jl/sports/people";
import { matchesTeamSearch } from "@/lib/sports/search-text";
import type { SportsPage } from "@/lib/jl/sports/pages";
import type { SportsSearchHit } from "@/lib/jl/sports/search-parse";
import { useView } from "@/lib/view";
import { JlDialog } from "./jl-dialog";
import { SportPrioritiesEditor } from "@/views/settings/sports-priorities";

const SEARCH_DELAY_MS = 350;
const MAX_SCHOOLS = 6;

/**
 * Schools from the NCAA directory whose games come from their own athletics site, so a school
 * ESPN doesn't carry (Gallaudet, say) can still be followed. Sport words are ignored.
 */
function useSchoolHits(q: string): College[] {
  const [colleges, setColleges] = useState<College[]>([]);
  useEffect(() => {
    let live = true;
    void loadColleges()
      .then((list) => {
        if (live) setColleges(list);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return useMemo(() => {
    if (q.length < 2) return [];
    return colleges
      .filter((c) =>
        matchesTeamSearch(
          {
            name: c.name,
            abbr: "",
            aliases: c.site ? [c.site] : [],
            leagueKey: "NCAAF",
            group: "football",
          },
          q,
        ),
      )
      .slice(0, MAX_SCHOOLS);
  }, [colleges, q]);
}

export function FollowPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const teams = useJlSportsFavorites();
  const players = useJlFavoritePlayers();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SportsSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const followedColleges = useFollowedColleges();

  const q = query.trim();
  const shown = q.length >= 2 ? hits : [];
  const schools = useSchoolHits(q);

  useEffect(() => {
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      setFailed(false);
      searchTeamsAndPlayers(q, controller.signal)
        .then(setHits)
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // Schools follow with the account (as "ncaa-<id>" teams), so they sync to every device.
  const toggleSchool = (college: College, following: boolean) => {
    const favorite = collegeFavorite(college);
    if (following) {
      if (isFollowing(teams, favorite.league, favorite.id)) toggleFavoriteTeam(favorite);
      if (followedColleges.some((c) => c.id === college.id)) toggleFollowCollege(college);
    } else toggleFavoriteTeam(favorite);
  };

  const follow = async (hit: SportsSearchHit) => {
    if (hit.kind === "team") {
      toggleFavoriteTeam({ league: hit.league, id: hit.id, name: hit.name });
      return;
    }
    if (isFollowing(players, hit.league, hit.id)) {
      const existing = players.find((p) => p.league === hit.league && p.id === hit.id);
      if (existing) toggleFavoritePlayer(existing);
      return;
    }
    setPending(`${hit.league}:${hit.id}`);
    try {
      toggleFavoritePlayer(await playerForFollow(hit));
    } finally {
      setPending(null);
    }
  };

  return (
    <JlDialog title={t("Teams & players")} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2.5 rounded-xl border border-edge bg-canvas px-3.5 focus-within:border-ink-subtle">
          <Search size={15} className="text-ink-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search a team, school or player")}
            spellCheck={false}
            autoComplete="off"
            className="h-11 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-subtle/60"
          />
          {searching && <Loader2 size={14} className="animate-spin text-ink-subtle" />}
        </label>
        {failed && (
          <p className="text-[12.5px] text-danger">{t("Search is unavailable right now.")}</p>
        )}
        {schools.length > 0 && (
          <ul className="flex flex-col gap-1.5" aria-label={t("Schools")}>
            {schools.map((college) => {
              const following =
                isFollowing(teams, "NCAAF", collegeTeamId(college)) ||
                followedColleges.some((c) => c.id === college.id);
              return (
                <li key={college.id}>
                  <button
                    onClick={() => toggleSchool(college, following)}
                    aria-pressed={following}
                    className="flex w-full items-center gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-3.5 py-2 text-start transition-colors hover:border-edge focus:border-ink-subtle focus:outline-none"
                  >
                    <SchoolLogo college={college} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13.5px] font-medium text-ink">
                        {college.name}
                      </span>
                      <span className="truncate text-[11.5px] text-ink-subtle">
                        {[
                          t("School"),
                          divisionLabel(college.division),
                          college.conference,
                          college.site,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <Star
                      size={15}
                      fill={following ? "currentColor" : "none"}
                      className={following ? "text-accent" : "text-ink-subtle"}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {shown.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {shown.map((hit) => {
              const key = `${hit.league}:${hit.id}`;
              const following =
                hit.kind === "team"
                  ? isFollowing(teams, hit.league, hit.id)
                  : isFollowing(players, hit.league, hit.id);
              return (
                <li key={`${hit.kind}:${key}`}>
                  <button
                    onClick={() => void follow(hit)}
                    disabled={pending === key}
                    aria-pressed={following}
                    className="flex w-full items-center gap-3 rounded-xl border border-edge-soft bg-canvas/40 px-3.5 py-2 text-start transition-colors hover:border-edge focus:border-ink-subtle focus:outline-none"
                  >
                    {hit.image ? (
                      <img
                        src={hit.image}
                        alt=""
                        loading="lazy"
                        className="h-8 w-8 shrink-0 rounded-full object-contain"
                      />
                    ) : (
                      <User size={18} className="shrink-0 text-ink-subtle" />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13.5px] font-medium text-ink">
                        {hit.name}
                      </span>
                      <span className="truncate text-[11.5px] text-ink-subtle">
                        {hit.league} · {hit.kind === "team" ? t("Team") : t("Player")} ·{" "}
                        {hit.subtitle}
                      </span>
                    </span>
                    {pending === key ? (
                      <Loader2 size={14} className="animate-spin text-ink-subtle" />
                    ) : (
                      <Star
                        size={15}
                        fill={following ? "currentColor" : "none"}
                        className={following ? "text-accent" : "text-ink-subtle"}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <FollowingList onClose={onClose} />
        <section className="flex flex-col gap-2 border-t border-edge-soft pt-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {t("My sports")}
          </h3>
          <SportPrioritiesEditor />
        </section>
      </div>
    </JlDialog>
  );
}

function FollowingList({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { openSportsPage } = useView();
  const open = (page: SportsPage) => {
    onClose();
    openSportsPage(page);
  };
  const teams = useJlSportsFavorites();
  const players = useJlFavoritePlayers();
  const colleges = useFollowedColleges();
  if (teams.length === 0 && players.length === 0 && colleges.length === 0) {
    return (
      <p className="text-[12.5px] text-ink-subtle">
        {t("Follow teams and players to keep their games in your Top 10 and the ticker.")}
      </p>
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {t("Following")}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {teams.map((f) => {
          const college = collegeOfTeamId(f.id);
          return (
            <Chip
              key={`t:${f.league}:${f.id}`}
              label={college ? `${college.name} · ${t("School")}` : `${f.name} · ${f.league}`}
              onOpen={() =>
                open(
                  college
                    ? { kind: "college", collegeId: college.id, name: college.name }
                    : { kind: "team", league: f.league, teamId: f.id, name: f.name },
                )
              }
              onRemove={() => toggleFavoriteTeam(f)}
            />
          );
        })}
        {colleges
          .filter((c) => !teams.some((f) => f.id === collegeTeamId(c)))
          .map((c) => (
            <Chip
              key={`c:${c.id}`}
              label={`${c.name} · ${t("School")}`}
              onOpen={() => open({ kind: "college", collegeId: c.id, name: c.name })}
              onRemove={() => toggleFollowCollege(c)}
            />
          ))}
        {players.map((p) => (
          <Chip
            key={`p:${p.league}:${p.id}`}
            label={[p.name, p.position, p.teamName].filter(Boolean).join(" · ")}
            onOpen={() =>
              open({ kind: "athlete", league: p.league, athleteId: p.id, name: p.name })
            }
            onRemove={() => toggleFavoritePlayer(p)}
          />
        ))}
      </div>
    </section>
  );
}

function Chip({
  label,
  onOpen,
  onRemove,
}: {
  label: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <span className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft py-1 pe-1 ps-3 text-[12px] text-accent">
      <button
        onClick={onOpen}
        className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {label}
      </button>
      <button
        onClick={onRemove}
        aria-label={t("Unfollow {team}", { team: label })}
        className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-accent/20"
      >
        <X size={11} />
      </button>
    </span>
  );
}

function SchoolLogo({ college }: { college: College }) {
  const [failed, setFailed] = useState(false);
  if (!college.site || failed)
    return <GraduationCap size={18} className="shrink-0 text-ink-subtle" />;
  return (
    <img
      src={logoUrl(college.site)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-8 w-8 shrink-0 rounded-full object-contain"
    />
  );
}
