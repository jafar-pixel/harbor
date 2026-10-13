import { createContext, useContext } from "react";
import { Languages, LoaderCircle } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { EnglishDubControl } from "@/views/player/hooks/use-english-dub";
import { BigButton } from "./transport/big-button";
import { StremioBtn } from "./transport/stremio-btn";
import { Tooltip } from "./transport/tooltip";

// The control sits deep in the configurable transport, which builds its buttons from a layout
// rather than from props, so the player hands it its state through context.
const EnglishDubContext = createContext<EnglishDubControl | null>(null);
export const EnglishDubProvider = EnglishDubContext.Provider;

export function useEnglishDubControl(): EnglishDubControl | null {
  return useContext(EnglishDubContext);
}

export function EnglishDubGlyph({ size, busy }: { size: number; busy?: boolean }) {
  return (
    <span className="relative inline-flex">
      {busy ? (
        <LoaderCircle size={size} strokeWidth={1.9} className="animate-spin" />
      ) : (
        <Languages size={size} strokeWidth={1.9} />
      )}
      <span className="absolute -bottom-1.5 -end-2 rounded-[4px] bg-white px-[3px] text-[9px] font-bold leading-[13px] text-black">
        EN
      </span>
    </span>
  );
}

/** Highlighted while the audio is English; a press switches to English audio or an English dub source. */
export function EnglishDubButton({
  variant,
  editing,
}: {
  variant: "big" | "stremio";
  editing?: boolean;
}) {
  const t = useT();
  const dub = useEnglishDubControl();
  if (!editing && !dub?.visible) return null;
  const active = !editing && !!dub?.active;
  const busy = !editing && !!dub?.busy;
  const label = active ? t("English audio") : t("Switch to English audio");
  const onClick = editing ? undefined : dub?.press;
  if (variant === "stremio") {
    return (
      <Tooltip label={label}>
        <StremioBtn onClick={onClick} ariaLabel={label} active={active}>
          <EnglishDubGlyph size={26} busy={busy} />
        </StremioBtn>
      </Tooltip>
    );
  }
  return (
    <BigButton onClick={onClick} ariaLabel={label} tooltip={label} active={active}>
      <EnglishDubGlyph size={22} busy={busy} />
    </BigButton>
  );
}
