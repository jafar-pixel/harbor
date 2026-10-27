import { useState } from "react";
import { useJlSession } from "@/lib/jl/account/client";
import {
  cancelFamilyInvite,
  createFamily,
  createFamilyInvite,
  deleteFamily,
  joinFamily,
  leaveFamily,
  normalizeInviteCode,
  removeFamilyMember,
  useFamily,
} from "@/lib/jl/account/family";
import { syncJlKeysNow } from "@/lib/jl/account/keys-sync";
import { useT } from "@/lib/i18n";
import { TextField } from "@/views/account/fields";
import { SButton } from "../ui";

const NOTE = "text-[13px] leading-relaxed text-ink-muted";

/**
 * Family: share this account's Real-Debrid, TorBox and IPTV logins with family members who sign
 * in with their own JL accounts, or join a family with an invite code.
 */
export function FamilyCard() {
  const t = useT();
  const session = useJlSession();
  const { family, loading, error, reload } = useFamily();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const run = async (action: () => Promise<unknown>, done?: string, failed?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      if (done) setNotice({ text: done, failed: false });
      reload();
      // Shared keys arrive or leave on this device straight away.
      syncJlKeysNow();
    } catch {
      setNotice({
        text: failed ?? t("That didn't work. Check your connection and try again."),
        failed: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    await run(
      () => joinFamily(code, name || session?.email?.split("@")[0] || ""),
      t("You joined the family. Its services are set up on this device."),
      t("That invite code isn't valid. Ask for a new one; codes last 7 days and work once."),
    );
    setCode("");
  };

  if (!session) {
    return <p className={NOTE}>{t("Sign in to your JL account to create or join a family.")}</p>;
  }
  if (loading && !family) return <p className={NOTE}>{t("Loading your family…")}</p>;
  if (error && !family) {
    return (
      <div className="flex flex-col gap-3">
        <p className={NOTE}>{t("Your family couldn't be loaded.")}</p>
        <SButton onClick={reload}>{t("Try again")}</SButton>
      </div>
    );
  }

  const status = notice && (
    <p
      role={notice.failed ? "alert" : "status"}
      className={`text-[13px] ${notice.failed ? "text-danger" : "text-ink-muted"}`}
    >
      {notice.text}
    </p>
  );

  if (!family) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <p className={NOTE}>
            {t(
              "Share your Real-Debrid, TorBox and IPTV logins with your family. Each person signs in with their own JL account and keeps their own profiles, library and history. JL Media Vision sets no limit; your services manage their own connections.",
            )}
          </p>
          <div>
            <SButton
              variant="primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () => createFamily("Family"),
                  t("Your family is ready. Invite someone below."),
                )
              }
            >
              {t("Create a family")}
            </SButton>
          </div>
        </div>
        <div className="flex max-w-[420px] flex-col gap-3">
          <p className={NOTE}>{t("Got an invite code? Join a family to use its services.")}</p>
          <TextField
            label={t("Invite code")}
            value={code}
            onChange={(v) => setCode(normalizeInviteCode(v).slice(0, 8))}
            placeholder="ABCD2345"
            maxLength={9}
          />
          <TextField
            label={t("Your name in the family")}
            value={name}
            onChange={setName}
            maxLength={40}
            onEnter={() => code.length === 8 && void join()}
          />
          <div>
            <SButton disabled={busy || code.length !== 8} onClick={() => void join()}>
              {t("Join family")}
            </SButton>
          </div>
        </div>
        {status}
      </div>
    );
  }

  if (family.role === "member") {
    return (
      <div className="flex flex-col gap-3">
        <p className={NOTE}>
          {t(
            "You're in {name}. You use the family's Real-Debrid, TorBox and IPTV logins. A key you enter yourself in Settings is used instead of the family's.",
            { name: family.name },
          )}
        </p>
        <div>
          <SButton
            variant="danger"
            disabled={busy}
            onClick={() =>
              void run(
                leaveFamily,
                t("You left the family. Its services were removed from this device."),
              )
            }
          >
            {t("Leave family")}
          </SButton>
        </div>
        {status}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className={NOTE}>
        {t(
          "Everyone in your family uses your Real-Debrid, TorBox and IPTV logins, and sees them in their settings. When you change a key, it changes for them too.",
        )}
      </p>
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-medium text-ink">
          {family.members.length
            ? t("Members ({n})", { n: family.members.length })
            : t("No one has joined yet.")}
        </span>
        {family.members.map((m) => (
          <div key={m.userId} className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{m.name}</span>
            <SButton
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(
                  () => removeFamilyMember(m.userId),
                  t("{name} was removed and no longer uses your services.", { name: m.name }),
                )
              }
            >
              {t("Remove")}
            </SButton>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[15px] font-medium text-ink">{t("Invite codes")}</span>
        <p className={NOTE}>
          {t(
            "Send a code to a family member. On their device: Settings, Account, JL account, Family, then Join family. Each code works once and lasts 7 days.",
          )}
        </p>
        {family.invites.map((inv) => (
          <div key={inv.code} className="flex flex-wrap items-center gap-3">
            <code className="rounded-md bg-elevated px-2.5 py-1 font-mono text-[16px] tracking-[0.18em] text-ink">
              {inv.code}
            </code>
            <SButton
              onClick={() => {
                void navigator.clipboard?.writeText(inv.code).catch(() => {});
                setNotice({ text: t("Code copied."), failed: false });
              }}
            >
              {t("Copy")}
            </SButton>
            <SButton
              variant="danger"
              disabled={busy}
              onClick={() => void run(() => cancelFamilyInvite(inv.code))}
            >
              {t("Cancel")}
            </SButton>
          </div>
        ))}
        <div className="flex flex-wrap gap-3">
          <SButton variant="primary" disabled={busy} onClick={() => void run(createFamilyInvite)}>
            {t("New invite code")}
          </SButton>
          <SButton
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (
                !window.confirm(t("Delete your family? Everyone in it stops using your services."))
              )
                return;
              void run(deleteFamily, t("Your family was deleted."));
            }}
          >
            {t("Delete family")}
          </SButton>
        </div>
      </div>
      {status}
    </div>
  );
}
