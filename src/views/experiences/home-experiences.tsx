import { useState, type ReactNode } from "react";
import { ArrowRight, Cake, CalendarHeart, Trophy, X } from "lucide-react";
import { useView } from "@/lib/view";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useExperiences, useExperienceDate } from "@/lib/experiences/use-experiences";
import { useExperienceGames } from "@/lib/experiences/use-game-day";
import {
  HOLIDAYS,
  holidayInSeason,
  holidayOccurrence,
  isBirthday,
  isPostseason,
  localDateKey,
} from "@/lib/experiences/catalog";
import { ExperienceCollection, type ExperienceCollectionInfo } from "./experience-collection";
import "./experiences.css";

/** Where each plugin lives: Home keeps the personal ones, the rest sit in their own hub. */
export const HOME_PLUGINS = ["birthday", "spooktober"] as const;
export const SPORTS_PLUGINS = ["gameday", "playoffs"] as const;
export const MOVIES_PLUGINS = ["holidays"] as const;

export function HomeExperiences({
  active = true,
  spooktober,
  plugins,
  onSports,
}: {
  active?: boolean;
  spooktober?: ReactNode;
  /** The plugins this hub shows; all of them when left out. */
  plugins?: readonly string[];
  /** What the game-day cards open; the Sports view by default. */
  onSports?: () => void;
}) {
  const t = useT();
  const { preferences, save, profile, profileId } = useExperiences();
  const { settings } = useSettings();
  const { setView } = useView();
  const date = useExperienceDate();
  const shows = (plugin: string) => !plugins || plugins.includes(plugin);
  const games = useExperienceGames(
    active &&
      ((shows("gameday") && preferences.enabled.gameday) ||
        (shows("playoffs") && preferences.enabled.playoffs)),
    date,
  );
  const openSports = onSports ?? (() => setView("sports"));
  const [collection, setCollection] = useState<ExperienceCollectionInfo | null>(null);
  const day = localDateKey(date);
  const cards: Array<{
    id: string;
    plugin: string;
    title: string;
    description: string;
    action: () => void;
    content?: ReactNode;
  }> = [];
  if (shows("birthday") && preferences.enabled.birthday && isBirthday(preferences.birthday, date)) {
    const title = t("Happy birthday, {name}!", { name: profile?.name ?? t("you") });
    const description = t("Your day. Your favorites. A collection picked from your library.");
    cards.push({
      id: `birthday:${day}`,
      plugin: "birthday",
      title,
      description,
      action: () => setCollection({ title, description, birthday: true }),
    });
  }
  if (!settings.hideContent.sports && games.length) {
    if (shows("gameday") && preferences.enabled.gameday) {
      const lead = games[0];
      cards.push({
        id: `gameday:${day}`,
        plugin: "gameday",
        title: t("Your Game Day"),
        description: `${lead.away.name} · ${lead.home.name} — ${t("{count} games today", { count: games.length })}`,
        action: openSports,
      });
    }
    const playoffs = games.filter(isPostseason);
    if (shows("playoffs") && preferences.enabled.playoffs && playoffs.length)
      cards.push({
        id: `playoffs:${day}`,
        plugin: "playoffs",
        title: t("The Postseason"),
        description:
          playoffs[0].context?.name || `${playoffs[0].away.name} · ${playoffs[0].home.name}`,
        action: openSports,
      });
  }
  if (shows("holidays") && preferences.enabled.holidays)
    for (const holiday of HOLIDAYS) {
      if (!preferences.holidays.includes(holiday.id) || !holidayInSeason(holiday.id, date))
        continue;
      cards.push({
        id: holidayOccurrence(holiday.id, date),
        plugin: "holidays",
        title: t(holiday.title),
        description: t(holiday.description),
        action: () =>
          setCollection({
            title: t(holiday.title),
            description: t(holiday.description),
            movies: holiday.movies,
          }),
      });
    }
  if (spooktober && shows("spooktober"))
    cards.push({
      id: "spooktober",
      plugin: "spooktober",
      title: "Spooktober",
      description: "",
      action: () => {},
      content: spooktober,
    });
  const visible = cards
    .filter((card) => !preferences.dismissed.includes(card.id))
    .sort(
      (a, b) =>
        preferences.order.indexOf(a.plugin as (typeof preferences.order)[number]) -
        preferences.order.indexOf(b.plugin as (typeof preferences.order)[number]),
    );
  if (!visible.length) return null;
  return (
    <section
      className="experience-shelf"
      aria-label={t("Your experiences")}
      data-experience-profile={profileId}
    >
      {visible.map((card) =>
        card.content ? (
          <div key={card.id} className="min-w-0 self-center">
            {card.content}
          </div>
        ) : (
          <div key={card.id} className={`experience-card experience-${card.plugin}`}>
            <button className="experience-open" onClick={card.action}>
              <span className="experience-symbol" aria-hidden>
                {card.plugin === "birthday" ? (
                  <Cake size={36} />
                ) : card.plugin === "holidays" ? (
                  <CalendarHeart size={36} />
                ) : (
                  <Trophy size={36} />
                )}
              </span>
              <span className="experience-copy">
                <span className="experience-eyebrow">
                  {t("Made for {name}", { name: profile?.name ?? t("you") })}
                </span>
                <strong>{card.title}</strong>
                <span>{card.description}</span>
              </span>
              <ArrowRight className="experience-arrow" size={22} aria-hidden />
            </button>
            <button
              className="experience-dismiss"
              aria-label={t("Dismiss {name}", { name: card.title })}
              title={t(card.plugin === "holidays" ? "Hide for this season" : "Hide for today")}
              onClick={() => save({ dismissed: [...preferences.dismissed, card.id] })}
            >
              <X size={18} />
            </button>
          </div>
        ),
      )}
      {collection && (
        <ExperienceCollection
          key={profileId}
          info={collection}
          onClose={() => setCollection(null)}
        />
      )}
    </section>
  );
}
