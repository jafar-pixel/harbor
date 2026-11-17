import { useEffect } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { armKioskResume, kioskSupported, toggleKiosk, useKiosk } from "@/lib/kiosk";

/** The website's full screen ("kiosk mode") button in the top bar; hidden where it can't work. */
export function KioskButton() {
  const t = useT();
  const on = useKiosk();
  const supported = kioskSupported();
  useEffect(() => {
    if (supported) armKioskResume();
  }, [supported]);
  if (!supported) return null;
  const label = on ? t("Exit full screen") : t("Full screen");
  return (
    <button
      type="button"
      onClick={() => void toggleKiosk()}
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-full bg-elevated/70 text-ink-muted outline-none transition-colors hover:bg-elevated hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
    >
      {on ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
    </button>
  );
}
