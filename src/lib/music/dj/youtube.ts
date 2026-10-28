/** YouTube's embeddable player, loaded once, for the AI DJ's two decks. */

export type YtPlayer = {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  setVolume(volume: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate?(rate: number): void;
  getAvailablePlaybackRates?(): number[];
  destroy(): void;
};

type YtApi = { Player: new (el: HTMLElement, options: Record<string, unknown>) => YtPlayer };
type YtWindow = Window & { YT?: YtApi; onYouTubeIframeAPIReady?: () => void };

let loading: Promise<YtApi> | undefined;

export function loadYouTube(): Promise<YtApi> {
  const w = window as YtWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (loading) return loading;
  loading = new Promise<YtApi>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady;
    const script = document.createElement("script");
    const deadline = window.setTimeout(() => {
      loading = undefined;
      script.remove();
      reject(new Error("The video player couldn't load."));
    }, 15_000);
    w.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(deadline);
      try {
        previous?.();
      } finally {
        if (w.YT) resolve(w.YT);
      }
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(deadline);
      loading = undefined;
      reject(new Error("The video player couldn't load."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/** Player states from the IFrame API. */
export const YT_ENDED = 0;
export const YT_PLAYING = 1;

/**
 * The player's iframe, made here instead of by the IFrame API so it can carry its own referrer
 * policy. The app sends no referrer anywhere (index.html, vercel.json), but YouTube now refuses
 * to play an embed that doesn't say which site it's on (error 153, strict on iPhone Safari), so
 * YouTube players alone send the site's origin, never the page address.
 */
export function youtubeFrame(
  mount: HTMLElement,
  vars: Record<string, string | number>,
  options: { videoId?: string; host?: string } = {},
): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  const query = new URLSearchParams({ enablejsapi: "1", origin: location.origin });
  for (const [key, value] of Object.entries(vars)) query.set(key, String(value));
  frame.src = `${options.host ?? "https://www.youtube.com"}/embed/${options.videoId ?? ""}?${query}`;
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
  frame.setAttribute("allowfullscreen", "");
  frame.style.cssText = "width:100%;height:100%;border:0";
  mount.replaceChildren(frame);
  return frame;
}
