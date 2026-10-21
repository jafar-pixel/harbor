import { useJlLink } from "@/lib/jl/account/sync";
import { useJlSyncStatus } from "@/lib/jl/account/sync-status";
import { ROW_ACTION_PRIMARY, ROW_DESC, SettingRow } from "../kit";
import { SButton } from "../ui";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Fingerprint, LogIn, LogOut, UserRound } from "../icons";
import { AuthModal } from "@/components/auth-modal";
import { useAuth } from "@/lib/auth";
import { tvFocus } from "@/lib/keyboard-navigation";
import { navOwnsFocus } from "@/lib/keyboard-navigation/geometry";
import { useT } from "@/lib/i18n";

const AccountDialog = lazy(() =>
  import("@/views/live/live-home/jl-sports/account-dialog").then((m) => ({
    default: m.AccountDialog,
  })),
);

export function StremioCard() {
  const t = useT();
  const { user, signOut } = useAuth();
  const link = useJlLink();
  const syncStatus = useJlSyncStatus();
  const [showSync, setShowSync] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const signInRef = useRef<HTMLButtonElement>(null);
  const returnRing = useRef(false);

  useEffect(() => {
    if (user || !returnRing.current) return;
    returnRing.current = false;
    if (signInRef.current) tvFocus(signInRef.current);
  }, [user]);

  const onSignOut = () => {
    const active = document.activeElement;
    returnRing.current = active instanceof HTMLElement && navOwnsFocus(active);
    signOut();
  };

  const maskedEmail = useMemo(() => {
    if (!user?.email) return "";
    const [local, domain] = user.email.split("@");
    if (!domain) return "*****";
    return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 4))}@${domain}`;
  }, [user]);

  if (!user) {
    return (
      <>
        <SettingRow
          icon={<LogIn size={18} strokeWidth={2} />}
          label={t("Not signed in")}
          desc={t(
            "Sign in with your JL Media Vision account. Your local library and addons remain available.",
          )}
        >
          <button
            ref={signInRef}
            type="button"
            onClick={() => setShowAuth(true)}
            className={ROW_ACTION_PRIMARY}
          >
            {t("Sign in")}
          </button>
        </SettingRow>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </>
    );
  }

  return (
    <>
      <SettingRow
        icon={<UserRound size={18} strokeWidth={2} />}
        label={t("Signed in")}
        desc={
          <span className="font-mono text-ink" dir="ltr">
            {reveal ? user.email : maskedEmail}
          </span>
        }
      >
        <SButton onClick={() => setReveal((v) => !v)}>{reveal ? t("Hide") : t("Reveal")}</SButton>
      </SettingRow>

      <SettingRow
        icon={<Fingerprint size={18} strokeWidth={2} />}
        label={t("JL account ID")}
        desc={t("Your stable JL account identifier.")}
      >
        <span className={`break-all font-mono ${ROW_DESC}`} dir="ltr">
          {user._id}
        </span>
      </SettingRow>

      <SettingRow
        icon={<UserRound size={18} strokeWidth={2} />}
        label={
          link
            ? t("Syncing with {profile}", { profile: link.name })
            : t("Choose a profile to start sync")
        }
        desc={
          <span role="status">
            {link
              ? t(syncStatus.message)
              : t(
                  "Sign-in is complete. Link this device to your existing JL profile to sync addons and library.",
                )}
          </span>
        }
      >
        <SButton onClick={() => setShowSync(true)}>{t("Manage sync")}</SButton>
      </SettingRow>
      {showSync && (
        <Suspense fallback={<p role="status">{t("Loading settings")}</p>}>
          <AccountDialog onClose={() => setShowSync(false)} />
        </Suspense>
      )}

      <SettingRow
        icon={<LogOut size={18} strokeWidth={2} />}
        label={t("Sign out of JL Media Vision")}
        desc={t("Stops account sync and returns to this device's local profiles.")}
      >
        <SButton variant="danger" onClick={onSignOut}>
          {t("Sign out")}
        </SButton>
      </SettingRow>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
