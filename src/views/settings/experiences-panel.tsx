import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useExperiences } from "@/lib/experiences/use-experiences";
import {
  EXPERIENCE_PLUGINS,
  HOLIDAYS,
  moveExperience,
  validBirthday,
  type ExperienceId,
  type ExperiencePreferences,
} from "@/lib/experiences/catalog";
import {
  ExperienceCollection,
  type ExperienceCollectionInfo,
} from "@/views/experiences/experience-collection";
import { Section } from "./shared";
import "@/views/experiences/experiences.css";

export function ExperiencesPanel() {
  const { preferences, save, profile, profileId } = useExperiences();
  return (
    <ProfileExperiences
      key={profileId}
      preferences={preferences}
      save={save}
      name={profile?.name ?? "Profile"}
    />
  );
}
function ProfileExperiences({
  preferences,
  save,
  name,
}: {
  preferences: ExperiencePreferences;
  save: (patch: Partial<ExperiencePreferences>) => void;
  name: string;
}) {
  const t = useT();
  const [month, setMonth] = useState(preferences.birthday.split("-")[0] ?? "");
  const [day, setDay] = useState(preferences.birthday.split("-")[1] ?? "");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<ExperienceCollectionInfo | null>(null);
  const commit = (patch: Partial<ExperiencePreferences>) => {
    save(patch);
    setMessage(t("Saved for {name}", { name }));
  };
  const showPreview = (id: ExperienceId) => {
    if (id === "birthday") {
      setPreview({
        title: t("Happy birthday, {name}!", { name }),
        description: t("Your favorites and watchlist, ready for your birthday."),
        birthday: true,
        preview: true,
      });
      return;
    }
    if (id === "gameday" || id === "playoffs") {
      setPreview({
        title: t(id === "gameday" ? "Your Game Day" : "The Postseason"),
        description: t("On game day, this banner opens your personalized Sports Hub."),
        sports: true,
        preview: true,
      });
      return;
    }
    if (id === "spooktober") {
      setPreview({
        title: "Spooktober",
        description: t(
          "The existing October festival includes films, music and midnight discoveries. Here is a sample film collection.",
        ),
        movies: ["tt0107688", "tt0101272", "tt0087800"],
        preview: true,
      });
      return;
    }
    const holiday = HOLIDAYS.find((h) => preferences.holidays.includes(h.id)) ?? HOLIDAYS[0];
    setPreview({
      title: t(holiday.title),
      description: t(holiday.description),
      movies: holiday.movies,
      preview: true,
    });
  };
  return (
    <Section
      title={t("Experiences")}
      subtitle={t("Seasonal plug-ins for {name}. These choices apply to this profile.", { name })}
    >
      <div className="space-y-5">
        <p className="text-sm text-ink-muted">
          {t(
            "Banners appear automatically when relevant. Preview them at any time. Move them into your preferred order.",
          )}
        </p>
        <ol className="space-y-3">
          {preferences.order.map((id, index) => {
            const plugin = EXPERIENCE_PLUGINS.find((p) => p.id === id)!;
            return (
              <li
                key={id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-edge-soft p-4"
              >
                <label className="flex min-h-11 min-w-[180px] flex-1 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={preferences.enabled[id]}
                    onChange={(e) =>
                      commit({ enabled: { ...preferences.enabled, [id]: e.target.checked } })
                    }
                  />
                  <span>
                    <strong className="block text-base">{t(plugin.name)}</strong>
                    <span className="mt-1 block text-sm text-ink-muted">
                      {t(plugin.description)}
                    </span>
                  </span>
                </label>
                <button
                  className="experience-action"
                  onClick={() => showPreview(id)}
                  aria-label={t("Preview {name}", { name: t(plugin.name) })}
                >
                  {t("Preview")}
                </button>
                {([-1, 1] as const).map((by) => (
                  <button
                    key={by}
                    className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-edge-soft disabled:opacity-30"
                    aria-label={t(by === -1 ? "Move {name} up" : "Move {name} down", {
                      name: t(plugin.name),
                    })}
                    disabled={by === -1 ? index === 0 : index === preferences.order.length - 1}
                    onClick={() => commit({ order: moveExperience(preferences.order, id, by) })}
                  >
                    {by === -1 ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                  </button>
                ))}
              </li>
            );
          })}
        </ol>
        <fieldset className="space-y-3 rounded-xl border border-edge-soft p-4">
          <legend className="px-2 font-semibold">{t("Birthday for {name}", { name })}</legend>
          <p className="text-sm text-ink-muted">
            {t(
              "Only month and day are stored. Leave blank to skip birthday celebrations. February 29 birthdays appear on February 29.",
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label>
              {t("Month")}{" "}
              <select
                aria-label={t("Birthday month")}
                className="min-h-11 rounded-lg bg-elevated px-3"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              >
                <option value="">—</option>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={String(m).padStart(2, "0")}>
                    {new Intl.DateTimeFormat(undefined, { month: "long" }).format(
                      new Date(2000, m - 1, 1),
                    )}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Day")}{" "}
              <select
                aria-label={t("Birthday day")}
                className="min-h-11 rounded-lg bg-elevated px-3"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              >
                <option value="">—</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={String(d).padStart(2, "0")}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="experience-action"
              onClick={() => {
                const birthday = `${month}-${day}`;
                if (!validBirthday(birthday)) {
                  setMessage(t("Choose a valid birthday month and day."));
                  return;
                }
                commit({ birthday });
              }}
            >
              {t("Save birthday")}
            </button>
            <button
              className="experience-action"
              onClick={() => {
                setMonth("");
                setDay("");
                commit({ birthday: "" });
              }}
            >
              {t("Clear birthday")}
            </button>
          </div>
        </fieldset>
        <fieldset className="rounded-xl border border-edge-soft p-4">
          <legend className="px-2 font-semibold">{t("Your holidays")}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {HOLIDAYS.map((h) => (
              <label key={h.id} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={preferences.holidays.includes(h.id)}
                  onChange={(e) =>
                    commit({
                      holidays: e.target.checked
                        ? [...preferences.holidays, h.id]
                        : preferences.holidays.filter((id) => id !== h.id),
                    })
                  }
                />
                {t(h.name)}
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-muted">
            {t(
              "Halloween is managed by the Spooktober switch above. Dates use this device's local calendar.",
            )}
          </p>
        </fieldset>
        <label className="flex flex-wrap items-center gap-3">
          {t("Home placement")}
          <select
            className="min-h-11 rounded-lg bg-elevated px-3"
            value={preferences.placement}
            onChange={(e) =>
              commit({ placement: e.target.value === "before-hero" ? "before-hero" : "after-hero" })
            }
          >
            <option value="before-hero">{t("Above the featured hero")}</option>
            <option value="after-hero">{t("Below the featured hero")}</option>
          </select>
        </label>
        <button className="experience-action" onClick={() => commit({ dismissed: [] })}>
          {t("Restore dismissed experience banners")}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-ink-muted">
          {message}
        </p>
      </div>
      {preview && <ExperienceCollection info={preview} onClose={() => setPreview(null)} />}
    </Section>
  );
}
