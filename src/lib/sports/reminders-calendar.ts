import type { CalendarItem } from "../calendar";
import type { SportsReminder } from "./reminder-state";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Games the viewer asked to be reminded about, as entries in the app Calendar on their local
 * day and kick-off time. A game still waiting for its start time stays off the calendar.
 */
export function sportsRemindersAsCalendarItems(reminders: SportsReminder[]): CalendarItem[] {
  return reminders
    .filter((r) => !r.awaitingStartTime && Number.isFinite(r.startMs))
    .map((r) => {
      const at = new Date(r.startMs);
      return {
        id: `sports:${r.id}`,
        type: "tv",
        name: r.name,
        poster: null,
        background: null,
        releaseDate: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
        releaseTime: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
        releaseAtMs: r.startMs,
        isAnime: false,
        overview: r.league,
        voteAverage: 0,
        sportsReminder: true,
      };
    });
}
