import { useRef, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import {
  AI_MODELS,
  CLAUDE_MODELS,
  DEFAULT_AI_MODEL,
  DEFAULT_CLAUDE_MODEL,
  GROQ_MODELS,
  migrateModelId,
  providerTabFor,
} from "@/lib/ai-models";
import { pruneToCatalog, useGroqCatalog, useOpenRouterCatalog } from "@/lib/ai-live-models";
import openrouterLogo from "@/assets/ai-logos/openrouter.png";
import groqLogo from "@/assets/ai-logos/groq.png";
import anthropicLogo from "@/assets/ai-logos/anthropic.png";
import jinaLogo from "@/assets/ai-logos/jina.png";
import { AiModelSelect } from "./ai-model-select";
import { Globe, Sparkles } from "./icons";
import { ExtLink, KeyField, Section, Segmented, ToggleRow } from "./shared";
import { SettingRow } from "./kit";

type ProviderTab = "openrouter" | "groq" | "anthropic";

export function AiSearchSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const keyDrafts = {
    openrouter: useState(settings.aiSearchKey),
    groq: useState(settings.aiGroqKey),
    anthropic: useState(settings.anthropicKey),
  };
  const [savedFlags, setSavedFlags] = useState<Record<ProviderTab, boolean>>({
    openrouter: false,
    groq: false,
    anthropic: false,
  });
  const timer = useRef<number | null>(null);
  const flash = (tab: ProviderTab) => {
    setSavedFlags((s) => ({ ...s, [tab]: true }));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSavedFlags((s) => ({ ...s, [tab]: false })), 1800);
  };

  const [openrouterKey, setOpenrouterKey] = keyDrafts.openrouter;
  const [groqKey, setGroqKey] = keyDrafts.groq;
  const [anthropicKey, setAnthropicKey] = keyDrafts.anthropic;
  const [jinaDraft, setJinaDraft] = useState(settings.jinaKey);
  const [customDraft, setCustomDraft] = useState("");
  const orCatalog = useOpenRouterCatalog();
  const groqCatalog = useGroqCatalog(settings.aiGroqKey);
  const openRouterModels = pruneToCatalog(AI_MODELS, orCatalog);
  const groqModels = pruneToCatalog(GROQ_MODELS, groqCatalog);

  const tab: ProviderTab = settings.aiSearchProvider;
  const defaultFor = (v: ProviderTab) =>
    v === "groq" ? groqModels[0].id : v === "anthropic" ? DEFAULT_CLAUDE_MODEL : DEFAULT_AI_MODEL;
  const setTab = (v: ProviderTab) => {
    if (v === tab) return;
    const modelIsForTab = providerTabFor(settings.aiSearchModel) === v;
    const nextModel = modelIsForTab ? settings.aiSearchModel : defaultFor(v);
    update({ aiSearchProvider: v, aiSearchModel: nextModel });
  };
  const setModel = (id: string) => update({ aiSearchModel: id, aiSearchProvider: tab });
  const renderedModel = migrateModelId(settings.aiSearchModel || defaultFor(tab));

  return (
    <>
      <Section title={t("AI search")}>
        <SettingRow
          icon={<Sparkles size={18} strokeWidth={2} />}
          label={t("Provider")}
          desc={t(
            "Type what you want in plain language and let a model find it. Bring your own API key from any of these services.",
          )}
        >
          <Segmented
            value={tab}
            onChange={(v) => setTab(v)}
            options={[
              { value: "openrouter", label: "OpenRouter" },
              { value: "groq", label: "Groq" },
              { value: "anthropic", label: "Claude" },
            ]}
          />
        </SettingRow>

        {tab === "anthropic" ? (
          <>
            <KeyField
              label={t("Claude · your Anthropic key")}
              placeholder={t("Anthropic API key (sk-ant-...)")}
              iconSrc={anthropicLogo}
              value={anthropicKey}
              onChange={setAnthropicKey}
              onSave={() => {
                update({ anthropicKey: anthropicKey.trim() });
                flash("anthropic");
              }}
              saved={savedFlags.anthropic}
              help={
                <>
                  {t(
                    "Claude runs AI search, episode and game search, and Ask JL in Music. Calls go from this device straight to Anthropic, billed to your key only.",
                  )}{" "}
                  {t("Get a key at")}{" "}
                  <ExtLink href="https://platform.claude.com/settings/keys">
                    platform.claude.com
                  </ExtLink>
                  .{" "}
                  {t(
                    "Signed in to JL Media Vision, the key follows your account to the TV, Windows and the web. It is never shared with family members.",
                  )}
                </>
              }
            />
            <AiModelSelect
              value={renderedModel}
              onChange={(v) => setModel(v)}
              models={CLAUDE_MODELS}
              defaultModel={DEFAULT_CLAUDE_MODEL}
            />
          </>
        ) : tab === "openrouter" ? (
          <>
            <KeyField
              label={t("AI Search · natural-language search")}
              placeholder={t("OpenRouter API key (sk-or-...)")}
              iconSrc={openrouterLogo}
              value={openrouterKey}
              onChange={setOpenrouterKey}
              onSave={() => {
                update({ aiSearchKey: openrouterKey.trim() });
                flash("openrouter");
              }}
              saved={savedFlags.openrouter}
              help={
                <>
                  {t(
                    'Adds an "Ask AI" button to search, so you can type things like a plain-language request.',
                  )}{" "}
                  {t("Get a key at")}{" "}
                  <ExtLink href="https://openrouter.ai/keys">openrouter.ai/keys</ExtLink>.{" "}
                  {t(
                    "It only runs when you tap that button, so it never costs anything unless you ask.",
                  )}
                </>
              }
            />
            <AiModelSelect
              value={renderedModel}
              onChange={(v) => setModel(v)}
              models={openRouterModels}
              defaultModel={DEFAULT_AI_MODEL}
            />
          </>
        ) : (
          <>
            <KeyField
              label={t("AI Search · Groq LPU inference")}
              placeholder={t("Groq API key (gsk-...)")}
              iconSrc={groqLogo}
              value={groqKey}
              onChange={setGroqKey}
              onSave={() => {
                update({ aiGroqKey: groqKey.trim() });
                flash("groq");
              }}
              saved={savedFlags.groq}
              help={
                <>
                  {t(
                    'Adds an "Ask AI" button to search, so you can type things like a plain-language request.',
                  )}{" "}
                  {t("Get a key at")}{" "}
                  <ExtLink href="https://console.groq.com/keys">console.groq.com/keys</ExtLink>.{" "}
                  {t(
                    "Groq runs open-source models on its LPU hardware with a generous free tier; every model listed below runs on the free tier.",
                  )}
                </>
              }
            />
            <AiModelSelect
              value={renderedModel}
              onChange={(v) => setModel(v)}
              models={groqModels}
              defaultModel={groqModels[0].id}
            />
          </>
        )}

        <SettingRow
          wide
          label={t("Custom model id")}
          desc={
            tab === "groq"
              ? t("Any model id from console.groq.com/docs/models works here.")
              : tab === "anthropic"
                ? t("Any Claude model id from Anthropic works here.")
                : t("Any model id from openrouter.ai/models works here, including :free variants.")
          }
        >
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const id = customDraft.trim();
              if (id) setModel(id);
            }}
          >
            <input
              type="text"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              placeholder={
                tab === "groq"
                  ? "llama-3.3-70b-versatile"
                  : tab === "anthropic"
                    ? DEFAULT_CLAUDE_MODEL
                    : "vendor/model-name:free"
              }
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              className="h-11 min-w-0 flex-1 rounded-[8px] bg-canvas px-3 font-mono text-[15.5px] text-ink placeholder:text-ink-subtle focus:outline-none transition-colors focus:bg-elevated"
            />
            <button
              type="submit"
              disabled={!customDraft.trim()}
              className="flex h-11 shrink-0 items-center rounded-[8px] bg-canvas px-4 text-[15px] font-semibold text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
            >
              {t("Use model")}
            </button>
          </form>
        </SettingRow>
      </Section>

      <Section title={t("Live web")}>
        <SettingRow
          wide
          icon={<Globe size={18} strokeWidth={2} />}
          label={t("Jina Reader")}
          desc={
            <>
              {t("Augments AI picks with current web results before asking the model. Powered by")}{" "}
              <ExtLink href="https://jina.ai/reader">Jina Reader</ExtLink>.{" "}
              {t("Works without a key at low volume; add a key for higher quotas.")}
            </>
          }
        />
        <ToggleRow
          label={t("Use live web context")}
          sub={t("Fetches DuckDuckGo results and feeds top hits into the model prompt.")}
          value={settings.aiWebSearch}
          onChange={(v) => update({ aiWebSearch: v })}
        />
        <KeyField
          label={t("Jina API key (optional)")}
          placeholder={t("jina_...")}
          iconSrc={jinaLogo}
          value={jinaDraft}
          onChange={setJinaDraft}
          onSave={() => update({ jinaKey: jinaDraft.trim() })}
          saved={false}
          help={
            <>
              {t("Get a key at")} <ExtLink href="https://jina.ai/reader">jina.ai/reader</ExtLink>{" "}
              {t("for higher rate limits; leave blank for the free anonymous tier.")}
            </>
          }
        />
      </Section>
    </>
  );
}
