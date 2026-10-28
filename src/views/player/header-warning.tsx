import { isWeb } from "@/lib/platform";
import { useT } from "@/lib/i18n";

export function NoAudioWarning(props: {
  onUseMpv: () => void;
  onPickAnother: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  // The desktop app can switch to mpv; a browser can't, so there the way out is another stream.
  const web = isWeb();
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-32 z-30 mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/15 bg-black/75 px-6 py-5 text-center text-white backdrop-blur-xl">
      <p className="text-[14px] leading-snug">
        {web
          ? t(
              "No sound: this file's audio is Dolby or DTS, which a web browser can't play. Pick another stream, or watch it in the Windows or TV app.",
            )
          : t(
              "No audio: this stream's audio format (likely Dolby or DTS) is not supported by the HTML5 engine.",
            )}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={web ? props.onPickAnother : props.onUseMpv}
          className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-canvas transition-colors hover:bg-accent/90"
        >
          {web ? t("Pick another stream") : t("Use mpv engine")}
        </button>
        <button
          onClick={props.onDismiss}
          className="rounded-full border border-white/20 px-4 py-1.5 text-[13px] font-medium text-white/85 transition-colors hover:bg-white/10"
        >
          {t("Dismiss")}
        </button>
      </div>
    </div>
  );
}

export function HeaderWarning(props: { onPickAnother: () => void }) {
  const t = useT();
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-32 z-30 mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-white/15 bg-black/75 px-6 py-5 text-center text-white backdrop-blur-xl">
      <p className="text-[14px] leading-snug">
        {t(
          "This file is flagged as not web-playable. Try the mpv backend in Settings or pick another stream.",
        )}
      </p>
      <button
        onClick={props.onPickAnother}
        className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-canvas transition-colors hover:bg-accent/90"
      >
        {t("Pick another")}
      </button>
    </div>
  );
}
