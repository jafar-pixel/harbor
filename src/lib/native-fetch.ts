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
