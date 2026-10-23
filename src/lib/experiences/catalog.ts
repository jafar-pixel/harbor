import type { SportsGame } from "../sports/espn.ts";

export const EXPERIENCE_PLUGINS = [
  {
    id: "gameday",
    name: "Game Day",
    description: "Today's games from your sports, with followed teams first.",
  },
  {
    id: "birthday",
    name: "Birthday",
    description: "Celebrate this profile with its saved favorites and watchlist.",
  },
  {
    id: "holidays",
    name: "Holidays",
    description: "Seasonal movie collections for the holidays you choose.",
  },
  {
    id: "playoffs",
    name: "Playoffs & championships",
    description: "Postseason games from your selected sports.",
  },
  {
    id: "spooktober",
    name: "Spooktober",
    description: "Films, music and midnight discoveries every October.",
  },
] as const;
export type ExperienceId = (typeof EXPERIENCE_PLUGINS)[number]["id"];
export const HOLIDAYS = [
  {
    id: "thanksgiving",
    name: "Thanksgiving (US)",
    title: "Gather Together",
    description: "A holiday weekend of family, food and familiar favorites.",
    movies: ["tt0093748", "tt0113321", "tt1621039", "tt0432283"],
  },
  {
    id: "christmas",
    name: "Christmas",
    title: "Christmas at Home",
    description: "Snowy adventures, holiday laughter and Christmas classics.",
    movies: ["tt0319343", "tt0099785", "tt0038650", "tt0338348", "tt4729430"],
  },
  {
    id: "new-year",
    name: "New Year's",
    title: "A Fresh Start",
    description: "New beginnings and films to welcome the year.",
    movies: ["tt0098635", "tt2194499", "tt0359950", "tt2948356"],
  },
  {
    id: "valentine",
    name: "Valentine's Day",
    title: "Love on Screen",
    description: "Love stories, grand gestures and second chances.",
    movies: ["tt0125439", "tt0414387", "tt0108160", "tt2582846"],
  },
  {
    id: "independence",
    name: "Independence Day (US)",
    title: "Summer Movie Night",
    description: "Big adventures for the Fourth of July.",
    movies: ["tt0116629", "tt0082971", "tt0083866", "tt0120737"],
  },
] as const;
export type HolidayId = (typeof HOLIDAYS)[number]["id"];
export type ExperiencePreferences = {
  enabled: Record<ExperienceId, boolean>;
  birthday: string;
  holidays: HolidayId[];
  order: ExperienceId[];
  placement: "before-hero" | "after-hero";
  dismissed: string[];
};
export const DEFAULT_EXPERIENCES: ExperiencePreferences = {
  enabled: { gameday: true, birthday: true, holidays: true, playoffs: true, spooktober: true },
  birthday: "",
  holidays: ["thanksgiving", "christmas", "new-year"],
  order: ["birthday", "gameday", "playoffs", "holidays", "spooktober"],
  placement: "after-hero",
  dismissed: [],
};
export function validBirthday(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{2}-\d{2}$/.test(value)) return false;
  const [month, day] = value.split("-").map(Number);
  const test = new Date(2000, month - 1, day);
  return test.getMonth() === month - 1 && test.getDate() === day;
}
export function normalizeExperiences(value: unknown): ExperiencePreferences {
  const raw = value && typeof value === "object" ? (value as Partial<ExperiencePreferences>) : {};
  const ids = EXPERIENCE_PLUGINS.map((p) => p.id);
  const order = Array.isArray(raw.order)
    ? raw.order.filter((id): id is ExperienceId => ids.includes(id))
    : [];
  return {
    enabled: Object.fromEntries(
      ids.map((id) => [
        id,
        typeof raw.enabled?.[id] === "boolean" ? raw.enabled[id] : DEFAULT_EXPERIENCES.enabled[id],
      ]),
    ) as ExperiencePreferences["enabled"],
    birthday: validBirthday(raw.birthday) ? raw.birthday : "",
    holidays: Array.isArray(raw.holidays)
      ? [
          ...new Set(
            raw.holidays.filter((id): id is HolidayId => HOLIDAYS.some((h) => h.id === id)),
          ),
        ]
      : [...DEFAULT_EXPERIENCES.holidays],
    order: [...new Set([...order, ...DEFAULT_EXPERIENCES.order])],
    placement: raw.placement === "before-hero" ? "before-hero" : "after-hero",
    dismissed: Array.isArray(raw.dismissed)
      ? raw.dismissed
          .filter((id): id is string => typeof id === "string" && id.length < 100)
          .slice(-100)
      : [],
  };
}
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function isBirthday(birthday: string, date: Date): boolean {
  return validBirthday(birthday) && localDateKey(date).slice(5) === birthday;
}
export function holidayInSeason(id: HolidayId, date: Date): boolean {
  const month = date.getMonth() + 1,
    day = date.getDate();
  if (id === "christmas") return month === 12 && day <= 25;
  if (id === "new-year") return (month === 12 && day >= 26) || (month === 1 && day === 1);
  if (id === "valentine") return month === 2 && day <= 14;
  if (id === "independence") return month === 7 && day <= 4;
  const first = new Date(date.getFullYear(), 10, 1).getDay();
  const thanksgiving = 1 + ((4 - first + 7) % 7) + 21;
  return month === 11 && day >= thanksgiving - 7 && day <= thanksgiving + 3;
}
export function holidayOccurrence(id: HolidayId, date: Date): string {
  const year =
    id === "new-year" && date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear();
  return `holiday:${id}:${year}`;
}
export function gameIsToday(game: SportsGame, date: Date): boolean {
  return (
    game.state === "in" ||
    (game.dateOnly ?? localDateKey(new Date(game.startMs))) === localDateKey(date)
  );
}
export function isPostseason(game: SportsGame): boolean {
  if (typeof game.postseason === "boolean") return game.postseason;
  return /\b(playoffs?|postseason|bowl|championship|finals|world series)\b/i.test(
    [game.context?.name, game.context?.round, game.detail].join(" "),
  );
}
export function moveExperience(
  order: ExperienceId[],
  id: ExperienceId,
  by: -1 | 1,
): ExperienceId[] {
  const next = [...order],
    at = next.indexOf(id),
    to = at + by;
  if (at < 0 || to < 0 || to >= next.length) return next;
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}
