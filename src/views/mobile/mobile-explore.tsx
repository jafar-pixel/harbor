import {
  BookOpen,
  CalendarDays,
  Clapperboard,
  Gamepad2,
  Headphones,
  Radio,
  Settings2,
  Sparkles,
  Trophy,
  Tv,
  Users,
} from "lucide-react";
import { useView, type View } from "@/lib/view";
import { useProfiles } from "@/lib/profiles";
import { useMobileAccess } from "./mobile-access";
import { useParental, type LockableTab } from "@/lib/parental";
import { useSportsEnabled } from "@/lib/sports/enabled";
import { useT } from "@/lib/i18n";

const hubs = [
  { view: "movies", label: "Movies", description: "Discover your next movie", icon: Clapperboard },
  { view: "shows", label: "Shows", description: "Series, seasons and episodes", icon: Tv },
  { view: "live", label: "Live TV", description: "Channels and program guide", icon: Radio },
  { view: "sports", label: "Sports", description: "Your teams, scores and games", icon: Trophy },
  {
    view: "music",
    label: "Music",
    description: "Your audio files and direct links",
    icon: Headphones,
  },
  { view: "games", label: "Games", description: "Browse your gaming library", icon: Gamepad2 },
  { view: "kids", label: "Kids", description: "A place for younger viewers", icon: Sparkles },
  {
    view: "calendar",
    label: "Calendar",
    description: "Keep up with upcoming releases",
    icon: CalendarDays,
  },
  { view: "ebook", label: "Books", description: "Find your next read", icon: BookOpen },
  { view: "manga", label: "Manga", description: "Browse series and chapters", icon: BookOpen },
] satisfies Array<{ view: View; label: string; description: string; icon: typeof Tv }>;

export function MobileExplore({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const { setView, openSettings } = useView();
  const { activeProfile } = useProfiles();
  const access = useMobileAccess();
  const { locked, hiddenTabs } = useParental();
  const sportsEnabled = useSportsEnabled();
  const kid = activeProfile?.kid;
  const visible = hubs.filter((hub) => {
    if (kid) return hub.view === "kids";
    const key =
      hub.view === "live"
        ? "liveTv"
        : hub.view === "manga" || hub.view === "ebook"
          ? "anime"
          : hub.view;
    return !locked || !hiddenTabs[key as LockableTab];
  });
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pb-6 pt-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          JL Media Vision
        </p>
        <h1 className="mt-2 font-display text-3xl text-ink">{t("Explore")}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t("Everything you enjoy, in one place.")}</p>
      </header>
      <div className="grid grid-cols-2 gap-3">
        {visible.map(({ view, label, description, icon: Icon }) => (
          <button
            key={view}
            type="button"
            onClick={() => {
              if (view === "sports" && !sportsEnabled) {
                access.run(() => {
                  openSettings("basics");
                  onOpen();
                });
              } else {
                setView(view);
                onOpen();
              }
            }}
            className="flex min-h-36 flex-col items-start gap-3 rounded-2xl border border-edge-soft bg-elevated/50 p-4 text-start transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
          >
            <Icon size={24} className="text-accent" />
            <span className="font-semibold text-ink">{t(label)}</span>
            <span className="text-xs leading-relaxed text-ink-muted">
              {t(view === "sports" && !sportsEnabled ? "Set up Sports in Settings" : description)}
            </span>
          </button>
        ))}
      </div>
      {!kid && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              access.run(() => {
                openSettings("account");
                onOpen();
              });
            }}
            className="flex items-center gap-3 rounded-xl border border-edge-soft p-4 text-start text-sm text-ink"
          >
            <Users size={20} />
            {t("Account")}
          </button>
          <button
            type="button"
            onClick={() => {
              access.run(() => {
                openSettings();
                onOpen();
              });
            }}
            className="flex items-center gap-3 rounded-xl border border-edge-soft p-4 text-start text-sm text-ink"
          >
            <Settings2 size={20} />
            {t("Settings")}
          </button>
        </div>
      )}
      {access.prompt}
    </section>
  );
}
