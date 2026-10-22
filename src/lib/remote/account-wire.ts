import type { RemoteCommand, RemoteSnapshot } from "./protocol";
const NAV = new Set(["up", "down", "left", "right", "select", "back"]);
export function validAccountCommand(value: unknown): value is RemoteCommand {
  if (!value || typeof value !== "object" || JSON.stringify(value).length > 8192) return false;
  const c = value as Record<string, unknown>;
  if (c.action === "nav") return typeof c.key === "string" && NAV.has(c.key);
  if (
    [
      "play",
      "pause",
      "togglePlayback",
      "prevEpisode",
      "nextEpisode",
      "openSearch",
      "blurText",
      "toggleSubtitles",
    ].includes(String(c.action))
  )
    return true;
  if (c.action === "seek")
    return (
      typeof c.positionSec === "number" && Number.isFinite(c.positionSec) && c.positionSec >= 0
    );
  if (c.action === "setVolume")
    return typeof c.volume === "number" && c.volume >= 0 && c.volume <= 1;
  if (c.action === "setMuted") return typeof c.muted === "boolean";
  if (c.action === "setText") return typeof c.value === "string" && c.value.length <= 2000;
  if (c.action === "submitText")
    return c.value === undefined || (typeof c.value === "string" && c.value.length <= 2000);
  if (c.action === "setSpeed")
    return typeof c.speed === "number" && c.speed >= 0.25 && c.speed <= 4;
  if (c.action === "setSleep")
    return typeof c.minutes === "number" && c.minutes >= 0 && c.minutes <= 1440;
  if (c.action === "openMeta" || c.action === "playMeta")
    return (
      typeof c.metaId === "string" &&
      c.metaId.length <= 512 &&
      ["movie", "series", "anime"].includes(String(c.metaType))
    );
  if (c.action === "openService")
    return typeof c.service === "string" && /^[a-z0-9_-]{1,40}$/i.test(c.service);
  if (c.action === "goView")
    return ["home", "movies", "series", "anime", "live", "library", "settings", "sports"].includes(
      String(c.view),
    );
  return false;
}
/** Account transport never broadcasts provider keys, configured URLs, library dumps or cast LAN addresses. */
export function accountRemoteSnapshot(snapshot: RemoteSnapshot): RemoteSnapshot {
  return {
    proto: snapshot.proto,
    idle: snapshot.idle,
    mediaId: snapshot.mediaId,
    mediaTitle: snapshot.mediaTitle,
    posterUrl: snapshot.posterUrl,
    episode: snapshot.episode,
    source: snapshot.source,
    positionSec: snapshot.positionSec,
    durationSec: snapshot.durationSec,
    playing: snapshot.playing,
    volume: snapshot.volume,
    muted: snapshot.muted,
    target: snapshot.target,
    castDevices: [],
    castDiscovering: false,
    hasPrevEpisode: snapshot.hasPrevEpisode,
    hasNextEpisode: snapshot.hasNextEpisode,
    subtitlesOn: snapshot.subtitlesOn,
    canToggleSubtitles: snapshot.canToggleSubtitles,
    textEntry: snapshot.textEntry,
    profile: snapshot.profile,
    profiles: [],
    updatedAt: snapshot.updatedAt,
  };
}
