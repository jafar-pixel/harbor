// Keep in sync with REDIRECT_PORT and redirect_uri in src-tauri/src/music/spotify/auth.rs.
export const SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8898/login";
export const SPOTIFY_DASHBOARD_URL = "https://developer.spotify.com/dashboard";

/** Replace backend setup instructions with localized, actionable form guidance. */
export function spotifySetupErrorKey(error: string): string | null {
  if (error.includes("Spotify needs your own client id")) return "music.spotifySetup.missingSaved";
  if (error.includes("Spotify rejected that client id")) return "music.spotifySetup.rejected";
  return null;
}

/**
 * JL Media Vision's own Spotify app. A client id is public (sign in uses PKCE, no secret), so
 * listeners sign in with their own Spotify account. Spotify still only admits the accounts added
 * under the app's User Management until the app gets extended quota.
 * Keep in sync with JL_SPOTIFY_CLIENT_ID in src-tauri/src/music/spotify/auth.rs.
 */
export const JL_SPOTIFY_CLIENT_ID =
  (import.meta.env.VITE_JL_SPOTIFY_CLIENT_ID as string | undefined)?.trim() ||
  "739d5262cbb44453ba1f933230eef197";

/** Where Spotify sends the browser back after sign in on the web app. */
export const SPOTIFY_WEB_CALLBACK_PATH = "/spotify-callback";
