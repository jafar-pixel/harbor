/** YouTube's embeddable player, loaded once, for the AI DJ's two decks. */

export type YtPlayer = {
  loadVideoById(id: string): void;
  cueVideoById(id: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
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
