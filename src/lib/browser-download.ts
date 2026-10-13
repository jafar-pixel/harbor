/**
 * Saves a direct file link through the browser, for the web app where Offline downloads (a
 * desktop feature) aren't available. Real-Debrid and TorBox serve their links as attachments, so
 * the browser saves rather than plays them; `download` is only a hint on another origin.
 */
export function saveInBrowser(url: string, filename?: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.download = filename ?? "";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function offlineDownloadsAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
