import { useCallback, useEffect, useMemo, useState } from "react";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { normalizeExperiences, type ExperiencePreferences } from "./catalog";
import { nextSpooktoberDateCheck } from "@/lib/spooktober-season";

export function useExperiences() {
  const { activeProfile } = useProfiles();
  const { settings, update } = useSettings();
  const profileId = activeProfile?.id ?? "default";
  const all = settings.experienceProfiles;
  const preferences = useMemo(() => normalizeExperiences(all?.[profileId]), [all, profileId]);
  const save = useCallback(
    (patch: Partial<ExperiencePreferences>) => {
      update({
        experienceProfiles: {
          ...all,
          [profileId]: normalizeExperiences({ ...preferences, ...patch }),
        },
      });
    },
    [all, profileId, preferences, update],
  );
  return { preferences, save, profile: activeProfile, profileId };
}
export function useExperienceDate() {
  const [date, setDate] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      const now = new Date();
      setDate(now);
      timer = setTimeout(check, nextSpooktoberDateCheck(now));
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return date;
}
