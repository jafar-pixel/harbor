import type { StreamingService } from "../settings";
import { openUrl } from "../window";

/**
 * Opening a viewer's subscription apps (Netflix, Prime Video, YouTube TV...) from JL Media
 * Vision, which is the hub and player on their TV or PC rather than a replacement for them.
 * On the TV app (Shield, Fire TV, Google TV) the real app opens through the app's JLApps bridge,
 * or its store page when it isn't installed; on the PC app and the website, its website.
 */

export type AppTarget = {
  /** Android TV / Fire TV packages to try, best first. */
  packages: string[];
  /** The service's website, for PCs, phones and the web. */
  url: string;
};

/** Services that aren't in the streaming list but are common TV apps. */
export type ExtraApp = "youtubetv" | "youtube" | "plex" | "samsungtvplus";

export const APP_TARGETS: Partial<Record<StreamingService | ExtraApp, AppTarget>> = {
  netflix: {
    packages: ["com.netflix.ninja", "com.netflix.mediaclient"],
    url: "https://www.netflix.com",
  },
  prime: {
    packages: ["com.amazon.amazonvideo.livingroom", "com.amazon.avod.thirdpartyclient"],
    url: "https://www.primevideo.com",
  },
  disney: { packages: ["com.disney.disneyplus"], url: "https://www.disneyplus.com" },
  hulu: { packages: ["com.hulu.livingroomplus", "com.hulu.plus"], url: "https://www.hulu.com" },
  max: { packages: ["com.wbd.stream", "com.hbo.hbonow"], url: "https://play.max.com" },
  apple: {
    packages: ["com.apple.atve.androidtv.appletv", "com.apple.atve.amazon.appletv"],
    url: "https://tv.apple.com",
  },
  paramount: { packages: ["com.cbs.ott", "com.cbs.app"], url: "https://www.paramountplus.com" },
  peacock: { packages: ["com.peacocktv.peacockandroid"], url: "https://www.peacocktv.com" },
  crunchyroll: { packages: ["com.crunchyroll.crunchyroid"], url: "https://www.crunchyroll.com" },
  tubi: { packages: ["com.tubitv"], url: "https://tubitv.com" },
  plutotv: { packages: ["tv.pluto.android"], url: "https://pluto.tv" },
  roku: { packages: [], url: "https://therokuchannel.roku.com" },
  fubo: { packages: ["com.fubo.firetv.screen", "tv.fubo.mobile"], url: "https://www.fubo.tv" },
  youtubetv: {
    packages: ["com.google.android.youtube.tvunplugged"],
    url: "https://tv.youtube.com",
  },
  youtube: {
    packages: ["com.google.android.youtube.tv", "com.amazon.firetv.youtube"],
    url: "https://www.youtube.com",
  },
  plex: { packages: ["com.plexapp.android"], url: "https://app.plex.tv" },
  samsungtvplus: { packages: [], url: "https://www.samsungtvplus.com" },
};

type AppsBridge = { open(packages: string, name: string, url: string): boolean };

function bridge(): AppsBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { JLApps?: AppsBridge }).JLApps;
  return b && typeof b.open === "function" ? b : null;
}

/** Opens a service's app (TV) or website (anywhere else). */
export function openApp(target: AppTarget, name: string): void {
  const tv = bridge();
  if (tv) {
    try {
      // The TV app tries each package, then the store, then the website.
      if (tv.open(target.packages.join(","), name, target.url)) return;
    } catch {
      /* an app build without the bridge falls through to the website */
    }
  }
  openUrl(target.url);
}
