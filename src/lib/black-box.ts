/**
 * The Black Box: JL's own catalogs of Black film and television (Movies, Series, TV), listed in
 * Catalogs beside the addons' catalogs and pinnable to Home like them. They come from TMDB's
 * discover, filtered by TMDB's own keywords for Black-led and African American stories, with the
 * viewer's TMDB key (Settings). Without a key there is nothing to list, so the catalogs don't show.
 *
 * The keyword ids aren't written here: they are looked up by name on TMDB the first time a catalog
 * loads, and only exact name matches are used, so a renamed or missing keyword drops out instead of
 * pulling in something unrelated.
 */
import type { Meta } from "./cinemeta";
import {
  BLACK_BOX_KEYWORDS,
  blackBoxCatalogsFor,
  blackBoxDiscoverParams,
  exactKeywordIds,
  type BlackBoxKind,
  type KeywordHit,
} from "./black-box-core";
import { get } from "./providers/tmdb/tmdb-client";
import { tmdbDiscover } from "./providers/tmdb/tmdb-catalogs";
import { loadStoredSettings } from "./settings/load";

export { BLACK_BOX_BASE, isBlackBoxKind } from "./black-box-core";

let keywordIds: { key: string; ids: Promise<number[]> } | null = null;

function blackBoxKeywordIds(key: string): Promise<number[]> {
  if (keywordIds?.key === key) return keywordIds.ids;
  const ids = Promise.all(
    BLACK_BOX_KEYWORDS.map((name) =>
      get<{ results?: KeywordHit[] }>(key, "search/keyword", { query: name })
        .then((data) => data?.results ?? [])
        .catch(() => [] as KeywordHit[]),
    ),
  ).then((results) => exactKeywordIds(BLACK_BOX_KEYWORDS, results));
  keywordIds = { key, ids };
  // A failed lookup (offline, bad key) is asked again next time rather than kept.
  void ids.then((found) => {
    if (found.length === 0 && keywordIds?.ids === ids) keywordIds = null;
  });
  return ids;
}

/** One page of a Black Box catalog; empty without a TMDB key or when the keywords aren't found. */
export async function blackBoxPage(kind: BlackBoxKind, page: number): Promise<Meta[]> {
  const key = loadStoredSettings().tmdbKey?.trim() ?? "";
  if (!key) return [];
  const ids = await blackBoxKeywordIds(key);
  if (ids.length === 0) return [];
  const { type, params } = blackBoxDiscoverParams(kind, ids, page);
  return tmdbDiscover(key, type, params);
}

/** The Black Box's catalogs in Catalogs' shape, or none without a TMDB key. */
export function blackBoxCatalogs() {
  return blackBoxCatalogsFor(!!loadStoredSettings().tmdbKey?.trim());
}
