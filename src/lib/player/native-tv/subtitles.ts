import { fetchAndParse } from "@/lib/subtitles/parser";
import { prepareSubtitle } from "@/lib/subtitles/prepare";
import { takePreparedSubtitle } from "@/lib/subtitles/prepared-registry";
import { subtitleTrackDownloadHeaders } from "@/lib/subtitles/provider-auth";
import { isSafeProviderSubtitleUrl } from "@/lib/subtitles/provider-url";
import { toVtt } from "@/lib/subtitles/serialize";
import type { SubtitleLoadMetadata } from "@/lib/subtitles/types";

/**
 * A subtitle for the TV app's player as WebVTT text: downloaded and read the way the desktop's
 * player does it (html5/bridge.ts ensureLoaded), so addon subtitles and subtitle sites, with their
 * logins, zip archives and text encodings, all work. Null when nothing readable came back.
 */
export async function loadSubtitleVtt(
  url: string,
  lang?: string,
  metadata?: SubtitleLoadMetadata,
): Promise<string | null> {
  const prepared = takePreparedSubtitle(url);
  if (prepared) {
    try {
      return prepared.cues.length ? toVtt(prepared.cues) : null;
    } finally {
      prepared.cleanup();
    }
  }
  const providerDerived = metadata?.providerDerived ?? Boolean(metadata?.provider);
  if (providerDerived && !isSafeProviderSubtitleUrl(url)) return null;
  if (/^https?:/i.test(url)) {
    const ready = await prepareSubtitle({
      url,
      format: metadata?.format,
      encoding: metadata?.encoding,
      language: lang,
      release: metadata?.release,
      filename: metadata?.rawFilename,
      requestHeaders: subtitleTrackDownloadHeaders(metadata?.downloadAuth, url, providerDerived),
    });
    try {
      return ready.cues.length ? toVtt(ready.cues) : null;
    } finally {
      ready.cleanup();
    }
  }
  const cues = await fetchAndParse(url, { ...metadata, lang });
  return cues.length ? toVtt(cues) : null;
}
