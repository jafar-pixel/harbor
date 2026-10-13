/**
 * The installed web app can't own stremio:// links, so it takes them as `?link=` instead: from
 * the share sheet (manifest.webmanifest's share_target) or a pasted address. A Debrid Media
 * Manager install link opens the addon installer; a title link opens or plays it like a cast.
 */
export function sharedLinkFrom(search: string): string | null {
  const p = new URLSearchParams(search);
  const raw = [p.get("link"), p.get("link_text")].find((v) => v && v.trim());
  if (!raw) return null;
  const match = raw.match(/(?:stremio|https?):\/\/\S+/i);
  const link = (match ? match[0] : raw).trim();
  if (/^stremio:\/\//i.test(link)) return link;
  if (/^https?:\/\/\S+\/manifest\.json(?:\?\S*)?$/i.test(link)) return link;
  return null;
}

let captured: string | null = null;

/** Read before the router boots, which may rewrite the address; the param is then dropped. */
export function captureSharedLink(): void {
  if (typeof window === "undefined") return;
  const link = sharedLinkFrom(window.location.search);
  if (!link) return;
  captured = link;
  const url = new URL(window.location.href);
  url.searchParams.delete("link");
  url.searchParams.delete("link_text");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

export function takeSharedLink(): string | null {
  const link = captured;
  captured = null;
  return link;
}
