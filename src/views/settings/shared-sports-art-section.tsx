import { ImageOff, Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { jlAccountsConfigured, useJlSession } from "@/lib/jl/account/client";
import { useT } from "@/lib/i18n";
import { useVisionVersion, vision } from "@/lib/jl/sports/vision";
import { Section } from "./shared";

const PAGE_SIZE = 24;

export function SharedSportsArtSection() {
  const t = useT();
  const session = useJlSession();
  useVisionVersion();
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("");
  const [page, setPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (session) void vision.load();
  }, [session]);

  const teams = vision.teams();
  const leagues = [...new Set(teams.map((team) => team.league))].sort();
  const search = query.trim().toLowerCase();
  const filtered = teams.filter(
    (team) =>
      (!league || team.league === league) &&
      (!search ||
        [team.name, team.mascot, team.conference, team.league]
          .join(" ")
          .toLowerCase()
          .includes(search)),
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const stored = teams.filter((team) => team.logoPath).length;
  const status = vision.status();

  const refresh = async () => {
    setRefreshing(true);
    try {
      await vision.load(true);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Section
      title={t("Shared sports artwork")}
      subtitle={t(
        "Your backend team-logo library. Browse by league, check availability, and refresh this device from the shared catalog. Artwork retrieval runs in the backend.",
      )}
    >
      {!jlAccountsConfigured() ? (
        <p className="text-sm text-ink-muted">
          {t("JL accounts are not configured in this build.")}
        </p>
      ) : !session ? (
        <p className="text-sm text-ink-muted">
          {t("Sign in to your JL account to load the shared sports library.")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-ink-muted">
              {t("{stored} of {total} team logos stored", { stored, total: teams.length })}
            </p>
            <button
              type="button"
              disabled={refreshing || status === "loading"}
              onClick={() => void refresh()}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-edge-soft px-4 text-sm font-semibold text-ink hover:border-edge disabled:opacity-50"
            >
              {refreshing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              {t("Refresh library")}
            </button>
          </div>
          {(status === "loading" || refreshing) && (
            <p role="status" className="text-sm text-ink-muted">
              {t("Loading shared artwork…")}
            </p>
          )}
          {status === "error" && (
            <p role="alert" className="text-sm text-danger">
              {t("The shared library could not be refreshed. Check your connection and try again.")}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-edge-soft px-3">
              <Search size={16} className="shrink-0 text-ink-subtle" />
              <input
                type="search"
                aria-label={t("Search shared sports teams")}
                placeholder={t("Search teams")}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
              />
            </label>
            <select
              aria-label={t("Filter artwork by league")}
              value={league}
              onChange={(event) => {
                setLeague(event.target.value);
                setPage(0);
              }}
              className="min-h-11 rounded-xl border border-edge-soft bg-canvas px-3 text-sm text-ink"
            >
              <option value="">{t("All leagues")}</option>
              {leagues.map((item) => (
                <option key={item} value={item}>
                  {item.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {visible.map((team) => {
              const logo = vision.logoUrl(team.key);
              return (
                <article
                  key={team.key}
                  className="flex flex-col gap-2 rounded-xl border border-edge-soft bg-canvas/30 p-3"
                >
                  <div className="flex h-20 items-center justify-center rounded-lg bg-elevated/40">
                    {logo ? (
                      <img
                        src={logo}
                        alt={team.name}
                        loading="lazy"
                        className="h-16 w-16 object-contain"
                      />
                    ) : (
                      <ImageOff size={24} className="text-ink-subtle" />
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-ink">{team.name}</h3>
                  <p className="text-xs uppercase text-ink-subtle">{team.league}</p>
                  <p className="text-xs text-ink-muted">
                    {logo
                      ? t("Logo available")
                      : team.logoPath
                        ? t("Stored; preview unavailable")
                        : t("Logo not stored")}
                  </p>
                </article>
              );
            })}
          </div>
          {status === "ready" && filtered.length === 0 && (
            <p className="text-sm text-ink-muted">{t("No teams match this search.")}</p>
          )}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
                className="min-h-11 rounded-xl border border-edge-soft px-4 text-sm text-ink disabled:opacity-40"
              >
                {t("Previous")}
              </button>
              <span className="text-sm text-ink-muted">
                {t("Page {page} of {pages}", { page: currentPage + 1, pages: lastPage + 1 })}
              </span>
              <button
                type="button"
                disabled={currentPage === lastPage}
                onClick={() => setPage(currentPage + 1)}
                className="min-h-11 rounded-xl border border-edge-soft px-4 text-sm text-ink disabled:opacity-40"
              >
                {t("Next")}
              </button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
