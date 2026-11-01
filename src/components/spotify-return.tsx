import { useEffect } from "react";
import { takeSpotifyReturn } from "@/lib/music/spotify-web/auth";
import { takeYouTubeReturn } from "@/lib/music/youtube-web/auth";
import { useView } from "@/lib/view";

/** Back from Spotify's or Google's (YouTube) sign in on the web app: open the Music Hub. */
export function SpotifyReturn() {
  const { setView } = useView();
  useEffect(() => {
    // Both are read once; call both so neither return is left behind.
    const spotify = takeSpotifyReturn();
    const youtube = takeYouTubeReturn();
    if (spotify || youtube) setView("music");
  }, [setView]);
  return null;
}
