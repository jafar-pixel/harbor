/**
 * Requests the Android TV app makes for the page (android-tv/, NativeFetch.kt), the way the
 * Windows app makes them natively: add-ons, debrid services and IPTV providers that send no CORS
 * header or answer over plain http, which a web page can't read. The TV runs each one on its own
 * threads and the page can cancel it, so a slow provider never holds up typing or scrolling.
 * Elsewhere (web, desktop) none of this is available and callers use their usual route.
 */

const ANSWER_ORIGIN = "https://jl-native-fetch.invalid/r/";
const DEFAULT_TIMEOUT_MS = 30_000;

type NativeFetchBridge = {
  isAvailable(): boolean;
  start?(json: string): string;
  cancel?(id: string): void;
};

type Waiter = { resolve: () => void; reject: (error: Error) => void };

const waiting = new Map<string, Waiter>();

function bridge(): NativeFetchBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as { JLNativeFetch?: NativeFetchBridge }).JLNativeFetch;
  try {
    return b && typeof b.start === "function" && b.isAvailable() ? b : null;
  } catch {
    return null;
  }
}

/** True inside the Android TV app, where [nativeFetch] can make the request. */
export function nativeFetchAvailable(): boolean {
  return bridge() !== null;
}

function listen(): void {
  const w = window as { __jlNativeFetchDone?: (id: string, error: string | null) => void };
  if (w.__jlNativeFetchDone) return;
  w.__jlNativeFetchDone = (id, error) => {
    const waiter = waiting.get(id);
    if (!waiter) return;
    waiting.delete(id);
    if (error) waiter.reject(new TypeError(`Failed to fetch: ${error}`));
    else waiter.resolve();
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

type Body = { body?: string; bodyBase64?: string };

/** The request body in a form the TV takes, or null for one it can't send (a form, a stream). */
function bodyOf(body: RequestInit["body"]): Body | null {
  if (body == null) return {};
  if (typeof body === "string") return { body };
  if (body instanceof URLSearchParams) return { body: body.toString() };
  if (body instanceof ArrayBuffer) return { bodyBase64: bytesToBase64(new Uint8Array(body)) };
  if (ArrayBuffer.isView(body))
    return {
      bodyBase64: bytesToBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)),
    };
  return null;
}

/** Whether [nativeFetch] can make this request exactly as the caller asked for it. */
export function nativeFetchCanSend(url: string, init?: RequestInit): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (init?.redirect && init.redirect !== "follow") return false;
  return bodyOf(init?.body) !== null;
}

function headersOf(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers as HeadersInit | undefined).forEach((value, name) => {
    out[name] = value;
  });
  if (init?.body instanceof URLSearchParams && !("content-type" in out))
    out["content-type"] = "application/x-www-form-urlencoded;charset=UTF-8";
  else if (typeof init?.body === "string" && !("content-type" in out))
    out["content-type"] = "text/plain;charset=UTF-8";
  return out;
}

/**
 * fetch() made by the TV. Rejects like fetch does: a TypeError when the request fails, an
 * AbortError when the caller's signal fires (the TV drops the request too), a TimeoutError when
 * no answer starts within [timeoutMs]. The body streams once the answer starts.
 */
export async function nativeFetch(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const b = bridge();
  if (!b?.start) throw new TypeError("Failed to fetch: the TV app's requests aren't available");
  const signal = init?.signal;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const body = bodyOf(init?.body);
  if (body === null) throw new TypeError("Failed to fetch: this request body can't be sent");
  listen();
  const id = b.start(
    JSON.stringify({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      headers: headersOf(init),
      timeoutMs,
      ...body,
    }),
  );
  if (!id) throw new TypeError("Failed to fetch: the TV app refused the request");

  await new Promise<void>((resolve, reject) => {
    const cleanups: Array<() => void> = [];
    const settle = (run: () => void) => {
      for (const c of cleanups) c();
      run();
    };
    const drop = (error: Error) => {
      waiting.delete(id);
      try {
        b.cancel?.(id);
      } catch {}
      settle(() => reject(error));
    };
    waiting.set(id, {
      resolve: () => settle(resolve),
      reject: (error) => settle(() => reject(error)),
    });
    // A little past the TV's own limit, which reports its own failure first.
    const timer = setTimeout(
      () => drop(new DOMException("The TV app's request timed out", "TimeoutError")),
      timeoutMs + 5_000,
    );
    cleanups.push(() => clearTimeout(timer));
    if (signal) {
      const onAbort = () => drop(new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", onAbort);
      cleanups.push(() => signal.removeEventListener("abort", onAbort));
    }
  });

  const answer = await fetch(`${ANSWER_ORIGIN}${id}`, { cache: "no-store", signal }).catch(
    (error: unknown) => {
      try {
        b.cancel?.(id);
      } catch {}
      throw error;
    },
  );
  if (answer.status === 404 && !answer.headers.has("x-harbor-final-url"))
    throw new TypeError("Failed to fetch: the TV app's answer was gone");
  // A fresh Response so callers see the provider's status and headers, not the hand-over address.
  const bodyless =
    init?.method?.toUpperCase() === "HEAD" || [204, 205, 304].includes(answer.status);
  return new Response(bodyless ? null : answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers: answer.headers,
  });
}

/**
 * An IPTV provider request (login, playlist, guide) made by the TV, or null outside the TV app.
 * Playlists can be very large, so the TV allows a long wait for the answer to start.
 */
export function nativeProviderFetch(
  url: string,
  userAgent: string,
  init?: RequestInit,
): Promise<Response> | null {
  if (!nativeFetchAvailable() || !nativeFetchCanSend(url, init)) return null;
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  headers.set("User-Agent", userAgent);
  return nativeFetch(url, { ...init, headers }, 60_000);
}

/**
 * True in the web app (a secure page with no native fetch) for a plain-http provider address:
 * the browser refuses that request outright, so a failed test says nothing about the login.
 */
export function browserBlocksProviderUrl(url: string): boolean {
  if (typeof window === "undefined" || "__TAURI_INTERNALS__" in window) return false;
  if (nativeFetchAvailable()) return false;
  return window.location.protocol === "https:" && /^http:\/\//i.test(url.trim());
}

/** Thrown when the web app can't reach a plain-http provider and no home relay is set up. */
export const BROWSER_BLOCKED_ERROR =
  "Blocked by the browser: this provider only uses a plain http link, which a secure web page can't load.";
