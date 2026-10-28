import { useT } from "@/lib/i18n";
import { GitHubThemes } from "./github-themes";
import type { StoreTab } from "./store-tabs";

/**
 * Community themes. Harbor's own theme server has shut down ("Harbor is Sunsetting"), so the
 * library is JL Media Vision's own theme collection on GitHub, plus any public repositories of
 * theme files you add.
 */
export function CommunityStore(_props: { initialTab?: StoreTab } = {}) {
  const t = useT();
  return (
    <section className="flex flex-col gap-4">
      <p className="ps-[9px] text-[14.5px] leading-relaxed text-ink-muted">
        {t(
          "Themes from the JL Media Vision collection. Add any public GitHub repository of theme files to browse it too.",
        )}
      </p>
      <GitHubThemes />
    </section>
  );
}
