import { Bell, BellRing } from "lucide-react";
import { ensureDesktopNotifyPermission } from "@/lib/calendar";
import { useT, useUiLanguage } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { SportsGame } from "@/lib/sports/espn-types";
import { reminderId, saveSportsReminder, useSportsReminders } from "@/lib/sports/reminders";

/** Minutes before the start the app's notification goes out. */
const LEAD_MINUTES = 5;

/**
 * Remind me in one tap: the game goes on the app Calendar and on today's games in the player, and
 * the app notifies 5 minutes before it starts. Discord or Telegram get it too when connected.
 * A second tap cancels.
 */
export function SportsReminderButton({
  game,
  icon = false,
}: {
  game: SportsGame;
  /** A round bell for a poster's corner instead of the labelled button. */
  icon?: boolean;
}) {
  const t = useT();
  const locale = useUiLanguage();
  const { settings } = useSettings();
  const reminders = useSportsReminders();
  const id = reminderId(game);
  const existing = reminders.find((item) => item.id === id);
  if (
    game.dateOnly !== undefined ||
    game.state !== "pre" ||
    !Number.isFinite(game.startMs) ||
    game.startMs <= Date.now()
  )
    return null;
  const toggle = () => {
    if (existing) {
      saveSportsReminder(null, id);
      return;
    }
    const extras = (["discord", "telegram"] as const).filter((channel) =>
      channel === "discord" ? settings.webhooks.discordUrl : settings.webhooks.telegramUrl,
    );
    saveSportsReminder({
      id,
      name: game.context?.name || `${game.away.name} · ${game.home.name}`,
      league: game.league,
      startMs: game.startMs,
      leadMinutes: LEAD_MINUTES,
      channels: ["app", ...extras],
      sent: {},
      attempted: {},
      failed: [],
    });
    void ensureDesktopNotifyPermission();
  };
  if (icon)
    return (
      <button
        type="button"
        aria-pressed={!!existing}
        aria-label={t(existing ? "Reminder set" : "Remind me")}
        title={t(existing ? "Reminder set" : "Remind me")}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={`absolute end-3 top-3 z-[2] flex h-10 w-10 items-center justify-center rounded-full backdrop-blur transition-colors ${
          existing ? "bg-accent text-white" : "bg-black/55 text-white hover:bg-black/75"
        }`}
      >
        {existing ? <BellRing size={18} /> : <Bell size={18} />}
      </button>
    );
  return (
    <div className="sh-reminder">
      <button
        type="button"
        className="sh-button"
        aria-pressed={!!existing}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {existing ? <BellRing size={17} /> : <Bell size={17} />}{" "}
        {t(existing ? "Reminder set" : "Remind me")}
      </button>
      {existing && (
        <small>
          {t("On your calendar · notifies at {time}", {
            time: new Date(existing.startMs - existing.leadMinutes * 60_000).toLocaleTimeString(
              locale,
              { hour: "numeric", minute: "2-digit" },
            ),
          })}
        </small>
      )}
    </div>
  );
}
