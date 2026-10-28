import { parseThemeJson, saveCustomTheme, type CustomTheme } from "@/lib/custom-themes";
import { safeFetch } from "@/lib/safe-fetch";
import { scanTheme } from "@/lib/theme-scan";

/**
 * Themes from GitHub: any public repository (or a folder in one) holding JL Media Vision / Harbor
 * theme files (.json). Repositories you add are remembered on this device. Themes are read from
 * raw.githubusercontent.com, checked by the same safety scan as community downloads, then saved
 * like any other theme.
 */

export type GitHubSource = { owner: string; repo: string; branch: string | null; path: string };

export type GitHubTheme = {
  /** Path inside the repository. */
  path: string;
  url: string;
  theme: CustomTheme;
};

const SOURCES_KEY = "jl.theme.github-sources.v1";

/** JL Media Vision's own theme library, always listed first. */
export const JL_THEMES_SOURCE: GitHubSource = {
  owner: "jafar-pixel",
  repo: "harbor",
  branch: "claude/determined-planck-b1p158",
  path: "community-themes",
};
export const isJlSource = (s: GitHubSource) => sourceLabel(s) === sourceLabel(JL_THEMES_SOURCE);
/** The most theme files read from one repository, so a huge repo can't stall the page. */
const MAX_FILES = 60;

/** "owner/repo", "owner/repo/folder", or a github.com URL (repo, tree or blob). */
export function parseGitHubSource(input: string): GitHubSource | null {
  let text = input.trim().replace(/\.git$/, "");
  text = text.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  const raw = /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i.exec(
    input.trim(),
  );
  if (raw) return { owner: raw[1], repo: raw[2], branch: raw[3], path: raw[4] };
  const parts = text.split("/").filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => /^[\w.-]+$/.test(p))) return null;
  const [owner, repo, kind, branch, ...rest] = parts;
  if ((kind === "tree" || kind === "blob") && branch)
    return { owner, repo, branch, path: rest.join("/") };
  return { owner, repo, branch: null, path: parts.slice(2).join("/") };
}

export const sourceLabel = (s: GitHubSource) => `${s.owner}/${s.repo}${s.path ? `/${s.path}` : ""}`;

export function readGitHubSources(): GitHubSource[] {
  let saved: GitHubSource[] = [];
  try {
    const v = JSON.parse(localStorage.getItem(SOURCES_KEY) ?? "[]") as unknown;
    saved = Array.isArray(v) ? (v as GitHubSource[]).filter((s) => s?.owner && s?.repo) : [];
  } catch {
    /* nothing saved */
  }
  return [JL_THEMES_SOURCE, ...saved.filter((s) => !isJlSource(s))];
}

export function writeGitHubSources(list: GitHubSource[]): void {
  try {
    localStorage.setItem(SOURCES_KEY, JSON.stringify(list.filter((s) => !isJlSource(s))));
  } catch {
    /* storage blocked: kept for this visit */
  }
}

async function json<T>(url: string): Promise<T> {
  const r = await safeFetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (r.status === 404)
    throw new Error("That repository or folder wasn't found (it must be public).");
  if (r.status === 403 || r.status === 429)
    throw new Error("GitHub is limiting requests right now. Try again in a few minutes.");
  if (!r.ok) throw new Error(`GitHub answered ${r.status}.`);
  return (await r.json()) as T;
}

/** Every theme file in the source, read and checked. Files that aren't themes are skipped. */
export async function listGitHubThemes(source: GitHubSource): Promise<GitHubTheme[]> {
  const { owner, repo } = source;
  const branch =
    source.branch ??
    (await json<{ default_branch: string }>(`https://api.github.com/repos/${owner}/${repo}`))
      .default_branch;
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
  let paths: string[];
  if (source.path.toLowerCase().endsWith(".json")) paths = [source.path];
  else {
    const tree = await json<{ tree: { path: string; type: string }[] }>(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    );
    const prefix = source.path ? `${source.path.replace(/\/+$/, "")}/` : "";
    paths = tree.tree
      .filter(
        (e) =>
          e.type === "blob" &&
          e.path.toLowerCase().endsWith(".json") &&
          e.path.startsWith(prefix) &&
          !/(^|\/)(package(-lock)?|tsconfig|composer|manifest)\.json$/i.test(e.path),
      )
      .map((e) => e.path)
      .slice(0, MAX_FILES);
  }
  const found = await Promise.all(
    paths.map(async (path) => {
      const url = base + path.split("/").map(encodeURIComponent).join("/");
      try {
        const r = await safeFetch(url);
        if (!r.ok) return null;
        const parsed = parseThemeJson(await r.text());
        return parsed.ok ? { path, url, theme: parsed.theme } : null;
      } catch {
        return null;
      }
    }),
  );
  return found.filter((t): t is GitHubTheme => !!t);
}

/** Save a GitHub theme to your themes, after the safety scan. */
export function installGitHubTheme(item: GitHubTheme): CustomTheme {
  const scan = scanTheme({ css: item.theme.css, js: item.theme.js, html: item.theme.html });
  if (scan.verdict === "block") {
    const f = scan.findings.find((x) => x.severity === "block");
    throw new Error(
      `Blocked for your safety: this theme's code looks unsafe (${f?.rule ?? "malicious pattern"}).`,
    );
  }
  if (!saveCustomTheme(item.theme))
    throw new Error("Storage is full, so this theme could not be saved. Remove some themes first.");
  return item.theme;
}
