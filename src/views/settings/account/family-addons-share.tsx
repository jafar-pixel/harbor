import { useEffect, useState } from "react";
import { familyAddonsShared, setFamilyAddonsShared } from "@/lib/jl/account/family-addons";
import { useT } from "@/lib/i18n";
import { SButton } from "../ui";

const NOTE = "text-[13px] leading-relaxed text-ink-muted";

/**
 * Owner: clone this device's add-ons to the family, so members get the same Movies and Shows
 * sources as the owner's logins. Off until the owner turns it on, since add-on links can carry
 * the owner's service keys.
 */
export function FamilyAddonsShare() {
  const t = useT();
  const [shared, setShared] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    familyAddonsShared()
      .then((on) => live && setShared(on))
      .catch(() => live && setShared(false));
    return () => {
      live = false;
    };
  }, []);

  const toggle = async () => {
    if (shared === null) return;
    setBusy(true);
    setNotice(null);
    try {
      await setFamilyAddonsShared(!shared);
      setShared(!shared);
      setNotice(
        !shared
          ? t("Your add-ons are shared. Family members get them the next time their app syncs.")
          : t("Your add-ons are no longer shared. They're removed from family members' apps."),
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t("That didn't work. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex max-w-[480px] flex-col gap-3">
      <span className="text-[15px] font-medium text-ink">{t("Share my add-ons")}</span>
      <p className={NOTE}>
        {t(
          "Clone the add-ons on this device (Torrentio, Comet and others) to everyone in your family, so Movies and Shows work for them like they do for you. Add-on links can include your service keys, and members can see them.",
        )}
      </p>
      <div>
        <SButton onClick={() => void toggle()} disabled={busy || shared === null}>
          {shared ? t("Stop sharing add-ons") : t("Share my add-ons")}
        </SButton>
      </div>
      {notice && <p className={NOTE}>{notice}</p>}
    </div>
  );
}
