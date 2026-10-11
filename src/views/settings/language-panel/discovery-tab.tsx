import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { Section, ToggleRow } from "../shared";
import { LanguagesPicker } from "../streaming-panel";
import { HomeLanguagePicker } from "../home-language-picker";

export function DiscoveryLanguageTab() {
  const { settings, update } = useSettings();
  const t = useT();
  return (
    <>
      <Section
        title={t("Home catalogs")}
        subtitle={t("Only show titles in these original languages on the Home rows. Leave all off to show everything.")}
      >
        <HomeLanguagePicker />
        <ToggleRow
          label={t("Favour titles from where you are")}
          sub={t(
            "Nudge the daily Home rows toward your region and languages so local releases surface instead of the same worldwide list. Turn it off to see the unweighted picks.",
          )}
          value={settings.feedLocaleBias}
          onChange={(v) => update({ feedLocaleBias: v })}
        />
      </Section>

      <Section
        title={t("Stream ranking")}
        subtitle={t("Sources in these languages sort to the top of the picker.")}
      >
        <LanguagesPicker
          value={settings.preferredLanguages}
          onChange={(langs) => update({ preferredLanguages: langs })}
        />
        <ToggleRow
          label={t("Only show streams in my languages")}
          sub={t("Hides streams with no detected preferred language. Multi-audio releases count as a match.")}
          value={settings.requirePreferredLanguage}
          onChange={(v) => update({ requirePreferredLanguage: v })}
        />
      </Section>
    </>
  );
}
