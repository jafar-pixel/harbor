import { detectCountryFromGroup } from "./country-detect";
import type { VodLibrary } from "./vod";

/**
 * The country a provider files a movie or series under: its group ("USA | Movies", "FR VOD") or a
 * short tag in front of its title ("FR - Title"). Null when neither names one.
 */
export function vodCountry(item: { group: string | null; title: string }): string | null {
  const fromGroup = detectCountryFromGroup(item.group)?.code;
  if (fromGroup) return fromGroup;
  const tag = item.title.match(/^\s*([^\s-|:]{2,4})\s*[-|:]\s+\S/)?.[1];
  return tag ? (detectCountryFromGroup(tag)?.code ?? null) : null;
}

/** USA titles only: those filed under the US and those filed under no country at all. */
export function usaVodLibrary(library: VodLibrary): VodLibrary {
  const keep = (item: { group: string | null; title: string }) => {
    const code = vodCountry(item);
    return code === null || code === "US";
  };
  return { movies: library.movies.filter(keep), series: library.series.filter(keep) };
}
