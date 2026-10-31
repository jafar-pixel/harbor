type LiveSrc = {
  meta: { id?: string; type?: string };
  isLive?: boolean;
};

/**
 * The engine a stream plays in. Live channels use the browser player, the same one as the Live
 * TV and Sports TV previews, inside the app window with the app's controls. They are marked
 * notWebReady (playback-source.ts), which used to send them to mpv: on Windows that opened a
 * separate window over the app. A live channel whose sound the browser can't decode (Dolby
 * AC-3 on many sports feeds) moves to mpv, which the player then always embeds in the app.
 * Everything else follows the viewer's engine setting.
 */
export function chooseEngine(
  src: LiveSrc,
  setting: "auto" | "html5" | "mpv",
  autoFallbackTried: boolean,
  liveAudioFallback = false,
): "auto" | "html5" | "mpv" {
  if (isLivePlaybackSrc(src)) return liveAudioFallback ? "mpv" : "html5";
  return autoFallbackTried ? "mpv" : setting;
}

export function isLivePlaybackSrc(src: LiveSrc): boolean {
  if (src.isLive === true) return true;
  if (src.meta.id?.startsWith("iptv:") === true) return true;
  const type = src.meta.type ? String(src.meta.type).toLowerCase() : "";
  return type === "tv" || type === "channel";
}
