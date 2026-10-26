import { useEffect } from "react";
import { takeSpotifyReturn } from "@/lib/music/spotify-web/auth";
import { useView } from "@/lib/view";

/** Back from Spotify's sign in on the web app: open the Music Hub, where the Spotify tab waits. */
export function SpotifyReturn() {
  const { setView } = useView();
  useEffect(() => {
    if (takeSpotifyReturn()) setView("music");
  }, [setView]);
  return null;
}
