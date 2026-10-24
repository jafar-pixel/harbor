import { Camera, ExternalLink, History, Newspaper, PlayCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  fetchBoxScore,
  fetchCalendar,
  fetchOpponentHistory,
  fetchScheduleLinks,
  fetchSchoolSports,
  fetchStory,
  findCollege,
} from "@/lib/jl/sports/college-data";
import { streamProvider } from "@/lib/jl/sports/college-games";
import type { SportsPage } from "@/lib/jl/sports/pages";
import { matchupText, slugForSport, type BoxScore } from "@/lib/jl/sports/sidearm";
import { useView } from "@/lib/view";
import { openInAppBrowser } from "@/lib/window";
import {
  Note,
  PageShell,
  SchoolMark,
  Spinner,
  fmtWhen,
  useLoad,
  useWatchStream,
} from "./college-ui";

const READY = <T,>(l: { state: string; value?: T }): T | null =>
  l.state === "ready" ? (l.value ?? null) : null;

/**
 * One game from a school's own site: the matchup and its stream, then the box score (line
 * score, scoring plays, team statistics), the recap and the series history with the opponent.
 */
export function SchoolGamePage({ page }: { page: Extract<SportsPage, { kind: "school-game" }> }) {
  const t = useT();
  const { openSportsPage } = useView();
  const watch = useWatchStream();

  const found = useLoad(() => findCollege(page.collegeId), [page.collegeId]);
  const college = READY(found);
  const site = college?.site ?? null;
  const calendar = useLoad(async () => (site ? fetchCalendar(site) : null), [site]);
  const event = READY(calendar)?.events.find((e) => e.id === page.eventId) ?? null;
  const sports = useLoad(async () => (site ? fetchSchoolSports(site) : []), [site]);
  const slug = event?.sport ? slugForSport(event.sport, READY(sports) ?? []) : null;
  const schedule = useLoad(
    async () => (site && slug ? fetchScheduleLinks(site, slug) : null),
    [site, slug],
  );
  const gameId = /^g:(\d+)$/.exec(page.eventId)?.[1];
  const links = gameId ? (READY(schedule)?.get(gameId) ?? null) : null;
  const box = useLoad(
    async () => (site && links?.boxScore ? fetchBoxScore(site, links.boxScore) : null),
    [site, links?.boxScore],
  );
  const history = useLoad(
    async () => (site && links?.history ? fetchOpponentHistory(site, links.history) : null),
    [site, links?.history],
  );
  const recap = useLoad(
    async () => (site && links?.recap ? fetchStory(site, links.recap) : null),
    [site, links?.recap],
  );

  if (found.state === "loading" || calendar.state === "loading") {
    return (
      <PageShell>
        <Spinner />
      </PageShell>
    );
  }
  if (!college || !event) {
    return (
      <PageShell>
        <Note>
          {t("This game couldn't be loaded right now. Check your connection and try again.")}
        </Note>
      </PageShell>
    );
  }

  const title = `${college.name} ${matchupText(event)}`;
  const boxScore = READY(box);
  const series = READY(history);
  const story = READY(recap);
  const button =
    "flex h-10 items-center gap-2 rounded-full border border-edge-soft px-4 text-[13px] font-medium text-ink-muted hover:text-ink";

  return (
    <PageShell>
      <section className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <SchoolMark college={college} size={88} />
          <span className="text-[13px] font-bold uppercase tracking-[0.2em] text-ink-subtle">
            {event.home === false ? t("at") : t("vs")}
          </span>
          {links?.opponentLogo ? (
            <img
              src={links.opponentLogo}
              alt=""
              className="h-[88px] w-[88px] rounded-2xl bg-elevated object-contain p-2"
            />
          ) : (
            <span className="flex h-[88px] w-[88px] items-center justify-center rounded-2xl bg-elevated text-[22px] font-black text-ink-subtle">
              {(event.opponent ?? "?").slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.2em] text-accent">
            {event.sport ?? t("Game")}
          </p>
          <h1 className="text-[28px] font-black leading-tight text-ink">{title}</h1>
          <p className="text-[13.5px] text-ink-muted">
            {[fmtWhen(event.start, event.allDay), event.location].filter(Boolean).join(" · ")}
          </p>
          {event.result && (
            <p className="text-[18px] font-bold text-ink">
              {event.result === "W" ? t("Won") : event.result === "L" ? t("Lost") : t("Tied")}{" "}
              {event.score}
            </p>
          )}
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {event.stream && (
          <button
            type="button"
            data-tv-initial-focus
            onClick={() => watch(event.stream ?? "", title, event.sport ?? undefined)}
            className="flex h-10 items-center gap-2 rounded-full bg-ink px-5 text-[13.5px] font-semibold text-canvas hover:opacity-90"
          >
            <PlayCircle size={16} />
            {t("Watch on {network}", { network: t(streamProvider(event.stream)) })}
          </button>
        )}
        {links?.recap && (
          <button
            type="button"
            className={button}
            onClick={() => openInAppBrowser(links.recap ?? "", title)}
          >
            <Newspaper size={14} /> {t("Recap")}
          </button>
        )}
        {links?.boxScore && (
          <button
            type="button"
            className={button}
            onClick={() => openInAppBrowser(links.boxScore ?? "", title)}
          >
            <ExternalLink size={14} /> {t("Full box score")}
          </button>
        )}
        {links?.photos && (
          <button
            type="button"
            className={button}
            onClick={() => openInAppBrowser(links.photos ?? "", title)}
          >
            <Camera size={14} /> {t("Photos")}
          </button>
        )}
        <button
          type="button"
          className={button}
          onClick={() =>
            openSportsPage({ kind: "college", collegeId: college.id, name: college.name })
          }
        >
          {t("{school} page", { school: college.name })}
        </button>
      </div>

      {story && (
        <section className="mt-8 flex max-w-3xl flex-col gap-3 rounded-2xl border border-edge-soft/55 bg-elevated p-5 md:flex-row">
          {story.image && (
            <img
              src={story.image}
              alt=""
              className="h-32 w-full rounded-xl object-cover md:w-52"
              loading="lazy"
            />
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
              {t("Recap")}
            </p>
            <h2 className="text-[17px] font-bold text-ink">{story.title}</h2>
            {story.summary && <p className="text-[13.5px] text-ink-muted">{story.summary}</p>}
          </div>
        </section>
      )}

      {boxScore && <BoxScoreView box={boxScore} />}

      {series && (
        <section className="mt-8 max-w-3xl">
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ink">
            <History size={16} className="text-accent" />
            {series.title || t("Series history")}
          </h2>
          <div className="flex flex-wrap gap-2">
            {series.items.map((item) => (
              <div
                key={item.label}
                className="flex min-w-[96px] flex-col rounded-xl border border-edge-soft/55 bg-elevated px-4 py-3"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                  {item.label}
                </span>
                <span className="text-[22px] font-black text-ink">{item.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!event.result && !series && (
        <p className="mt-8 text-[13px] text-ink-subtle">
          {t("The box score and recap appear here after the game.")}
        </p>
      )}
    </PageShell>
  );
}

function BoxScoreView({ box }: { box: BoxScore }) {
  const t = useT();
  const groups = [...new Set(box.stats.map((s) => s.group))];
  const cell = "px-3 py-2 text-center tabular-nums";
  return (
    <section className="mt-8 flex max-w-3xl flex-col gap-6">
      <div className="overflow-x-auto rounded-2xl border border-edge-soft/55 bg-elevated">
        <table className="w-full text-[13.5px] text-ink">
          <caption className="px-4 pt-3 text-start text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            {t("Box score")}
          </caption>
          <thead>
            <tr className="text-ink-subtle">
              <th className="px-4 py-2 text-start font-semibold">{t("Team")}</th>
              {box.periods.map((p) => (
                <th key={p} className={`${cell} font-semibold`}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {box.teams.map((team, i) => (
              <tr key={team} className="border-t border-edge-soft/55">
                <td className="px-4 py-2 font-semibold">{team}</td>
                {box.lines[i].map((v, j) => (
                  <td
                    key={j}
                    className={`${cell} ${j === box.lines[i].length - 1 ? "font-black" : ""}`}
                  >
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {box.scoring.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
            {t("Scoring summary")}
          </h3>
          <ol className="flex flex-col gap-1.5">
            {box.scoring.map((play, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-xl border border-edge-soft/55 bg-elevated px-4 py-2.5 text-[13px]"
              >
                <span className="w-20 shrink-0 text-ink-subtle">
                  {play.period} {play.time}
                </span>
                <span className="min-w-0 flex-1 text-ink">{play.play}</span>
                <span className="shrink-0 font-bold tabular-nums text-ink">
                  {play.away}–{play.home}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {box.stats.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-edge-soft/55 bg-elevated">
          <table className="w-full text-[13px] text-ink">
            <caption className="px-4 pt-3 text-start text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
              {t("Team stats")}
            </caption>
            <thead>
              <tr className="text-ink-subtle">
                <th className="px-4 py-2 text-start font-semibold" />
                <th className={`${cell} font-semibold`}>{box.teams[0]}</th>
                <th className={`${cell} font-semibold`}>{box.teams[1]}</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group}>
                {group && (
                  <tr className="border-t border-edge-soft/55">
                    <th
                      colSpan={3}
                      className="px-4 pb-1 pt-3 text-start text-[11px] font-bold uppercase tracking-[0.1em] text-accent"
                    >
                      {group}
                    </th>
                  </tr>
                )}
                {box.stats
                  .filter((s) => s.group === group)
                  .map((s) => (
                    <tr key={`${group}:${s.label}`}>
                      <td className="px-4 py-1.5 text-ink-muted">{s.label}</td>
                      <td className={cell}>{s.away}</td>
                      <td className={cell}>{s.home}</td>
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
}
