import { AiAgentsSection } from "../ai-agents-section";
import { AiSearchSection } from "../ai-search-section";
import { SearchShortcutsSection } from "../search-shortcuts-section";

export function AiTab() {
  return (
    <>
      <SearchShortcutsSection />
      <AiSearchSection />
      <AiAgentsSection />
    </>
  );
}
