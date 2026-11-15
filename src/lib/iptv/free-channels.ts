import type { PlaylistFormValue } from "./playlist-entry";

/**
 * Free, ad-supported live TV for an account with no provider of its own yet: the official
 * streams of Pluto TV, Samsung TV Plus, Plex and The Roku Channel, from the widely used public
 * lists at i.mjh.nz (channels and guide). Added as an ordinary playlist the viewer can remove.
 */
export type FreeChannelList = { id: string; name: string; url: string; epgUrl: string };

export const FREE_CHANNEL_LISTS: FreeChannelList[] = [
  {
    id: "pluto-us",
    name: "Pluto TV (free)",
    url: "https://i.mjh.nz/PlutoTV/us.m3u8",
    epgUrl: "https://i.mjh.nz/PlutoTV/us.xml.gz",
  },
  {
    id: "samsung-us",
    name: "Samsung TV Plus (free)",
    url: "https://i.mjh.nz/SamsungTVPlus/us.m3u8",
    epgUrl: "https://i.mjh.nz/SamsungTVPlus/us.xml.gz",
  },
  {
    id: "plex-us",
    name: "Plex Live TV (free)",
    url: "https://i.mjh.nz/Plex/us.m3u8",
    epgUrl: "https://i.mjh.nz/Plex/us.xml.gz",
  },
  {
    id: "roku",
    name: "The Roku Channel (free)",
    url: "https://i.mjh.nz/Roku/all.m3u8",
    epgUrl: "https://i.mjh.nz/Roku/all.xml.gz",
  },
];

export function freeChannelPlaylist(list: FreeChannelList): PlaylistFormValue {
  return {
    name: list.name,
    kind: "m3u",
    url: list.url,
    epgUrl: list.epgUrl,
    xtream: { server: "", username: "", password: "" },
  };
}
