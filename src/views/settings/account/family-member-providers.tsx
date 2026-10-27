import { useEffect, useState } from "react";
import { MEMBER_PROVIDERS, memberProviderNames, setMemberProvider } from "@/lib/jl/account/family";
import { materializePlaylistEntry, newPlaylistId } from "@/lib/iptv/playlist-entry";
import { useT } from "@/lib/i18n";
import { TextField } from "@/views/account/fields";
import { SButton } from "../ui";

const NOTE = "text-[13px] leading-relaxed text-ink-muted";

/**
 * The owner sets up a family member's own providers. Keys are written to the member's account
 * and are never read back here: the panel only shows which ones are set.
 */
export function FamilyMemberProviders({ userId, name }: { userId: string; name: string }) {
  const t = useT();
  const [set, setSet] = useState<Set<string> | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [m3u, setM3u] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);

  const load = () =>
    memberProviderNames(userId)
      .then((names) => setSet(new Set(names)))
      .catch(() => setSet(new Set()));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const save = async (key: string, value: string, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await setMemberProvider(userId, key, value);
      setNotice({ text: done, failed: false });
      setDrafts((d) => ({ ...d, [key]: "" }));
      await load();
    } catch {
      setNotice({ text: t("That didn't save. Try again."), failed: true });
    } finally {
      setBusy(false);
    }
  };

  if (!set) return <p className={NOTE}>{t("Loading…")}</p>;

  const row = (key: string, label: string, editor: React.ReactNode, value: string) =>
    set.has(key) ? (
      <div key={key} className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 text-[15px] text-ink">
          {t(label)} · <span className="text-ink-muted">{t("set up")}</span>
        </span>
        <SButton
          variant="danger"
          disabled={busy}
          onClick={() =>
            void save(key, "", t("Removed. {name} uses the family's again.", { name }))
          }
        >
          {t("Remove")}
        </SButton>
      </div>
    ) : (
      <div key={key} className="flex max-w-[480px] flex-col gap-2">
        {editor}
        <div>
          <SButton
            disabled={busy || !value.trim()}
            onClick={() => void save(key, value.trim(), t("Saved to {name}'s account.", { name }))}
          >
            {t("Save")}
          </SButton>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-edge-soft p-4">
      <p className={NOTE}>
        {t(
          "Add {name}'s own providers if they have them. Theirs are used instead of yours. Leave one empty and they use the family's.",
          { name },
        )}
      </p>
      {MEMBER_PROVIDERS.map((p) =>
        row(
          p.key,
          p.label,
          <TextField
            label={t(p.label)}
            value={drafts[p.key] ?? ""}
            onChange={(v) => setDrafts((d) => ({ ...d, [p.key]: v }))}
          />,
          drafts[p.key] ?? "",
        ),
      )}
      {set.has("iptvPlaylists") ? (
        row("iptvPlaylists", "IPTV playlist", null, "")
      ) : (
        <div className="flex max-w-[480px] flex-col gap-2">
          <TextField
            label={t("IPTV playlist (M3U link)")}
            value={m3u}
            onChange={setM3u}
            placeholder="http://…/get.php?username=…"
          />
          <p className={NOTE}>{t("Added beside the family's playlists.")}</p>
          <div>
            <SButton
              disabled={busy || !/^https?:\/\//i.test(m3u.trim())}
              onClick={() => {
                const entry = materializePlaylistEntry(newPlaylistId(), {
                  name: t("{name}'s IPTV", { name }),
                  kind: "m3u",
                  url: m3u.trim(),
                  epgUrl: "",
                  xtream: { server: "", username: "", password: "" },
                });
                void save(
                  "iptvPlaylists",
                  JSON.stringify([entry]),
                  t("Saved to {name}'s account.", { name }),
                ).then(() => setM3u(""));
              }}
            >
              {t("Save")}
            </SButton>
          </div>
        </div>
      )}
      {notice && (
        <p
          role={notice.failed ? "alert" : "status"}
          className={`text-[13px] ${notice.failed ? "text-danger" : "text-ink-muted"}`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
