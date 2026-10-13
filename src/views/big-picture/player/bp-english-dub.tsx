import { EnglishDubGlyph } from "@/components/player/english-dub-button";
import type { EnglishDubControl } from "@/views/player/hooks/use-english-dub";
import { useBpT } from "../bp-i18n";
import { BpRailChip } from "./bp-player-rail";

/** The English dub control as a rail chip: Select switches, and the chip stays lit while the audio is English. */
export function BpEnglishDubChip({ dub }: { dub: EnglishDubControl }) {
  const t = useBpT();
  return (
    <BpRailChip
      label={t("English dub")}
      restoreKey="panel:english-dub"
      icon={<EnglishDubGlyph size={21} busy={dub.busy} />}
      active={dub.active}
      onPress={dub.press}
    />
  );
}

/** The control's notice, on the stage so it stays readable while the chrome fades. */
export function BpEnglishDubNotice({ dub }: { dub: EnglishDubControl }) {
  if (!dub.notice) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[clamp(24px,5vh,64px)] flex justify-center px-[var(--bp-gutter)]">
      <div
        role="status"
        className={`rounded-full border bg-[var(--bp-void)]/85 px-[clamp(18px,1.6vw,30px)] py-[clamp(9px,1.2vh,16px)] text-[clamp(14px,1.9vh,22px)] font-semibold text-ink ${
          dub.notice.kind === "error" ? "border-red-400/40" : "border-[var(--bp-edge-2)]"
        }`}
      >
        {dub.notice.text}
      </div>
    </div>
  );
}
