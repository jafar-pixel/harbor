import { PlaylistVodView } from "@/views/playlist-vod";

/** IPTV Movies & Series in Pro: USA titles only. */
export function BpIptvVod() {
  return (
    <section data-bp-shared-hub className="flex h-full min-h-0 flex-col">
      <PlaylistVodView active usaOnly />
    </section>
  );
}
