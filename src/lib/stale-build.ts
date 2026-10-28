/**
 * A new web deploy replaces the build's file names, so a tab opened before it can no longer
 * fetch the pieces it loads on demand ("Failed to fetch dynamically imported module"). Reloading
 * picks up the new build. The reload happens at most once a minute, so a real outage still shows
 * the error page instead of looping.
 */

const KEY = "jl.stale-build-reload";
const STALE_RE =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isStaleBuildError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return STALE_RE.test(text);
}

/** Reload once for a stale build. Returns false when it already tried within the last minute. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: reload anyway, once per page */
  }
  window.location.reload();
  return true;
}

/** Vite reports a failed on-demand load as `vite:preloadError`; reload instead of crashing. */
export function watchForStaleBuild(): void {
  if (typeof window === "undefined" || "__TAURI_INTERNALS__" in window) return;
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewBuild()) event.preventDefault();
  });
}
