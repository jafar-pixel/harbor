/**
 * Provider servers (IPTV logins, playlists, guides) mostly answer over plain http without CORS
 * headers, which a web page can't read. Inside the Android TV app (android-tv/, NativeFetch.kt)
 * the page asks this address instead and the app fetches the URL natively. Elsewhere it is null
 * and callers fetch the URL directly.
 */

const NATIVE_FETCH_ORIGIN = "https://jl-native-fetch.invalid/";

type NativeFetchBridge = { isAvailable(): boolean };

export function nativeFetchUrl(url: string, userAgent?: string): string | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as { JLNativeFetch?: NativeFetchBridge }).JLNativeFetch;
  try {
    if (!bridge?.isAvailable()) return null;
  } catch {
    return null;
  }
  const query = new URLSearchParams({ u: url });
  if (userAgent) query.set("ua", userAgent);
  return `${NATIVE_FETCH_ORIGIN}?${query}`;
}

/**
 * True in the web app (a secure page with no native fetch) for a plain-http provider address:
 * the browser refuses that request outright, so a failed test says nothing about the login.
 */
export function browserBlocksProviderUrl(url: string): boolean {
  if (typeof window === "undefined" || "__TAURI_INTERNALS__" in window) return false;
  if (nativeFetchUrl(url) !== null) return false;
  return window.location.protocol === "https:" && /^http:\/\//i.test(url.trim());
}

/** Thrown when the web app can't reach a plain-http provider and no home relay is set up. */
export const BROWSER_BLOCKED_ERROR =
  "Blocked by the browser: this provider only uses a plain http link, which a secure web page can't load.";
