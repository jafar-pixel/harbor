import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { HarborLoader } from "@/components/harbor-loader";
import { useT } from "@/lib/i18n";
import { PRODUCT_NAME } from "@/lib/i18n/brand";
import { phoneCannotShow } from "@/lib/remote/play-target";
import { pickerLayerKey, useView } from "@/lib/view";
import { useRegisterSheet } from "./mobile-sheet-lock";

const PlayPicker = lazy(() =>
  import("@/views/play-picker").then((m) => ({ default: m.PlayPicker })),
);
const PlayerView = lazy(() => import("@/views/player").then((m) => ({ default: m.PlayerView })));

/**
 * When the phone plays a title itself, the shared picker and player draw full
 * screen over the phone shell, the same views and view stack the desktop uses.
 */
export function MobilePlaybackLayer() {
  const t = useT();
  const { picker, player, topKind, canGoBack, goBack } = useView();
  const playerActive = !!player && !player.sportsDocked && !player.pipDocked;
  useRegisterSheet(!!picker || playerActive);

  const [notice, setNotice] = useState<string | null>(null);
  const prevKind = useRef(topKind);
  useEffect(() => {
    const from = prevKind.current;
    prevKind.current = topKind;
    if (!phoneCannotShow(from, topKind)) return;
    if (canGoBack) goBack();
    setNotice(
      t("That opens in {product} on a computer. Set it up there, then play again.", {
        product: PRODUCT_NAME,
      }),
    );
  }, [topKind, canGoBack, goBack, t]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <>
      {picker && (
        <div data-mobile-playback="picker" className="fixed inset-0 z-[80] bg-canvas">
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center">
                <HarborLoader size="lg" />
              </div>
            }
          >
            <PlayPicker
              key={pickerLayerKey(picker)}
              meta={picker.meta}
              episode={picker.episode}
              autoPlay={picker.intent === "download" ? false : picker.autoPlay}
              attempt={picker.attempt}
              intent={picker.intent}
              seasonEpisodes={picker.seasonEpisodes}
              resume={picker.resume}
              playerActive={playerActive}
            />
          </Suspense>
        </div>
      )}
      {player && (
        // The player positions itself full screen and hides itself while in picture-in-picture.
        <Suspense fallback={null}>
          <PlayerView
            key={player.meta.id.startsWith("iptv:") ? "player-live" : `player-${player.meta.id}`}
            src={player}
          />
        </Suspense>
      )}
      {notice && (
        <div
          role="alert"
          className="pointer-events-none fixed inset-x-0 top-0 z-[110] flex justify-center px-4"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <div className="flex max-w-[440px] items-start gap-2.5 rounded-2xl bg-ink px-4 py-3 text-[13.5px] font-semibold leading-snug text-canvas shadow-[0_8px_28px_-8px_rgba(0,0,0,0.6)] animate-fade-in">
            <MonitorSmartphone size={17} strokeWidth={2.2} className="mt-px shrink-0" />
            {notice}
          </div>
        </div>
      )}
    </>
  );
}
