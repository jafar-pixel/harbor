import { useEffect, useRef, useState } from "react";
import { useJlSession } from "@/lib/jl/account/client";
import { useJlLink } from "@/lib/jl/account/sync";
import { restoreJlAddonBackup, saveJlAddonBackup } from "@/lib/jl/account/addon-backup-client";
import { useT } from "@/lib/i18n";
import { SButton } from "../ui";

export function AddonBackupCard() {
  const t = useT();
  const session = useJlSession();
  const link = useJlLink();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const operation = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const transfer = async (restore: boolean) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setNotice("");
    setFailed(false);
    try {
      const count = await (restore ? restoreJlAddonBackup() : saveJlAddonBackup());
      if (!mounted.current) return;
      setNotice(
        restore
          ? count
            ? t("Added {count} addons. Your existing installations were kept.", { count })
            : t("All saved addons are already installed.")
          : t(
              "Saved {count} addons to your JL account. Restore them on another device using the same JL profile.",
              { count },
            ),
      );
    } catch {
      if (!mounted.current) return;
      setFailed(true);
      setNotice(
        t(
          "Addons could not be transferred. Check your connection and JL profile, then try again. Your installed addons were kept.",
        ),
      );
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] leading-relaxed text-ink-muted">
        {t(
          "Save configured addons, including private manifest links, encrypted in your JL account. On another device, select the same JL profile and restore. Saving replaces this profile's previous backup. Restore keeps existing installations. Local-only addons may need setup on the other device.",
        )}
      </p>
      {(!session || !link) && (
        <p className="text-[13px] text-ink-muted">
          {t("Sign in and link this device to a JL profile to transfer addons.")}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <SButton disabled={busy || !session || !link} onClick={() => void transfer(false)}>
          {t("Save addons")}
        </SButton>
        <SButton disabled={busy || !session || !link} onClick={() => void transfer(true)}>
          {t("Restore addons")}
        </SButton>
      </div>
      {busy && (
        <p role="status" className="text-[13px] text-ink-muted">
          {t("Transferring addons…")}
        </p>
      )}
      {notice && (
        <p
          role={failed ? "alert" : "status"}
          className={`text-[13px] ${failed ? "text-danger" : "text-ink-muted"}`}
        >
          {notice}
        </p>
      )}
    </div>
  );
}
