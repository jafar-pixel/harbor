import { Compass, Tv } from "lucide-react";
import { useT, useUiLanguage } from "@/lib/i18n";
import { getLeagueLabel, type SportsGame, type SportsSide } from "@/lib/sports/espn";
import { hubLeague } from "@/lib/sports/hub-data";
import { SportsReminderButton } from "./reminder-button";
import { teamIdentity, TeamProfileLink } from "./team-profile-link";

/**
 * Under the Sports TV: the game on it, with both teams (rank, record, score) opening their team
 * pages, when and where it's on, Remind me and Explore event.
 */
export function HubGameDetails({
  game,
  onOpen,
}: {
  game: SportsGame;
  onOpen: (game: SportsGame) => void;
}) {
  const t = useT();
  const locale = useUiLanguage();
  const league = hubLeague(game.league);
  const status =
    game.state === "pre"
      ? new Date(game.startMs).toLocaleString(locale, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : game.detail;
  const facts = [
    league ? getLeagueLabel(league) : game.league,
    game.headline,
    game.context?.venue,
    game.network ?? game.broadcasts?.[0],
  ].filter(Boolean);
  return (
    <section
      aria-label={t("Game details")}
      className="rounded-2xl border border-edge-soft bg-elevated p-5 text-ink"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-muted">
        {game.state === "in" && (
          <span className="rounded bg-danger px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.14em] text-white">
            {t("Live")}
          </span>
        )}
        <span className="font-semibold text-ink">{status}</span>
        {facts.map((f) => (
          <span key={f}>· {f}</span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Side game={game} side="away" />
        <span className="text-[13px] font-semibold text-ink-subtle">
          {game.state === "pre" ? t("vs") : "–"}
        </span>
        <Side game={game} side="home" end />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button type="button" className="sh-button primary" onClick={() => onOpen(game)}>
          <Compass size={17} /> {t("Explore event")}
        </button>
        <SportsReminderButton game={game} />
        {game.network && (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted">
            <Tv size={15} /> {game.network}
          </span>
        )}
      </div>
    </section>
  );
}

function Side({
  game,
  side,
  end = false,
}: {
  game: SportsGame;
  side: "home" | "away";
  end?: boolean;
}) {
  const t = useT();
  const team: SportsSide = game[side];
  return (
    <TeamProfileLink
      team={teamIdentity(game, side)}
      className={`flex min-w-0 items-center gap-3 rounded-xl p-2 text-start transition-colors hover:bg-white/[0.06] ${
        end ? "flex-row-reverse text-end" : ""
      }`}
    >
      {team.logo ? (
        <img
          src={team.logo}
          alt=""
          draggable={false}
          className="h-14 w-14 shrink-0 object-contain"
        />
      ) : (
        <span className="h-14 w-14 shrink-0 rounded-full bg-white/10" />
      )}
      <span className="flex min-w-0 flex-col">
        <span dir="auto" className="truncate text-[16px] font-bold">
          {team.rank ? (
            <span className="me-1 text-[12px] text-ink-subtle">#{team.rank}</span>
          ) : null}
          {team.name}
        </span>
        <span className="text-[12px] text-ink-muted">
          {[team.record, t("Team page")].filter(Boolean).join(" · ")}
        </span>
      </span>
      {game.state !== "pre" && (
        <span className={`text-[26px] font-bold tabular-nums ${end ? "me-auto" : "ms-auto"}`}>
          {team.score}
        </span>
      )}
    </TeamProfileLink>
  );
}
