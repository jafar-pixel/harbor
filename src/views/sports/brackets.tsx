import { useCallback, useEffect, useState } from "react";
import { Plus, Trophy, Users } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useJlSession } from "@/lib/jl/account/client";
import { buildTournament, type TournamentKind } from "@/lib/sports/brackets/engine";
import { createPool, joinPool, listPools, type BracketPool } from "@/lib/sports/brackets/pools";
import { BracketPoolView } from "./bracket-pool";
import { BRACKET_KINDS, BRACKET_TITLES, upcomingSeason } from "./bracket-meta";
import "./brackets.css";

const NAME_KEY = "harbor.brackets.displayName";

function savedName(email: string | null): string {
  try {
    const stored = localStorage.getItem(NAME_KEY);
    if (stored) return stored;
  } catch {
    // Storage can be unavailable; the email name is fine.
  }
  return email?.split("@")[0]?.slice(0, 40) || "Player";
}

function rememberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Not critical.
  }
}

export function Brackets({ active }: { active: boolean }) {
  const t = useT();
  const session = useJlSession();
  const [pools, setPools] = useState<BracketPool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"none" | "create" | "join">("none");

  const userId = session?.userId ?? null;
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setPools(await listPools());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [userId]);

  useEffect(() => {
    setPools(null);
    setOpenId(null);
    void refresh();
  }, [refresh]);

  if (!session) {
    return (
      <section className="br-empty">
        <Trophy size={36} />
        <h2>{t("Playoff brackets")}</h2>
        <p>
          {t(
            "Sign in to your JL Media Vision account to make brackets and play in pools with friends. Your brackets follow your account to every device.",
          )}
        </p>
      </section>
    );
  }

  if (openId) {
    return (
      <BracketPoolView
        poolId={openId}
        userId={session.userId}
        active={active}
        onBack={() => {
          setOpenId(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <section className="br-home">
      <header className="br-head">
        <div>
          <h2>{t("Brackets")}</h2>
          <p>{t("Pick every round, then compete with your pool as the real results come in.")}</p>
        </div>
        <div className="br-actions">
          <button
            className="br-btn br-btn-primary"
            aria-pressed={mode === "create"}
            onClick={() => setMode(mode === "create" ? "none" : "create")}
          >
            <Plus size={16} /> {t("New bracket")}
          </button>
          <button
            className="br-btn"
            aria-pressed={mode === "join"}
            onClick={() => setMode(mode === "join" ? "none" : "join")}
          >
            <Users size={16} /> {t("Join a pool")}
          </button>
        </div>
      </header>

      {mode === "create" && (
        <CreatePool
          email={session.email}
          onCreated={(pool) => {
            setMode("none");
            setOpenId(pool.id);
          }}
        />
      )}
      {mode === "join" && (
        <JoinPool
          email={session.email}
          onJoined={(id) => {
            setMode("none");
            setOpenId(id);
          }}
        />
      )}

      {error && <p className="br-error">{error}</p>}
      {pools === null && !error && <p className="br-muted">{t("Loading your brackets…")}</p>}
      {pools?.length === 0 && (
        <p className="br-muted">{t("No brackets yet. Start one or join a friend's pool.")}</p>
      )}
      {!!pools?.length && (
        <ul className="br-pools">
          {pools.map((pool) => (
            <li key={pool.id}>
              <button className="br-pool-card" onClick={() => setOpenId(pool.id)}>
                <Trophy size={20} />
                <span className="br-pool-name">{pool.name}</span>
                <span className="br-pool-meta">
                  {t(BRACKET_TITLES[pool.kind])} · {pool.season}
                  {pool.owner === session.userId ? ` · ${t("Owner")}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CreatePool({
  email,
  onCreated,
}: {
  email: string | null;
  onCreated: (pool: BracketPool) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<TournamentKind>("cfp");
  const [season, setSeason] = useState(() => upcomingSeason("cfp"));
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState(() => savedName(email));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const title = name.trim() || `${t(BRACKET_TITLES[kind])} ${season}`;
    const who = displayName.trim() || "Player";
    setBusy(true);
    setError(null);
    try {
      rememberName(who);
      onCreated(await createPool({ kind, season, name: title, displayName: who }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="br-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label>
        <span>{t("Tournament")}</span>
        <select
          value={kind}
          onChange={(e) => {
            const next = e.target.value as TournamentKind;
            setKind(next);
            setSeason(upcomingSeason(next));
          }}
        >
          {BRACKET_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(BRACKET_TITLES[k])} ({buildTournament(k).entrants.length} {t("teams")})
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("Season")}</span>
        <input
          type="number"
          min={2020}
          max={2100}
          value={season}
          onChange={(e) => setSeason(Number(e.target.value) || upcomingSeason(kind))}
        />
      </label>
      <label>
        <span>{t("Pool name")}</span>
        <input
          value={name}
          maxLength={80}
          placeholder={`${t(BRACKET_TITLES[kind])} ${season}`}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        <span>{t("Your name in the pool")}</span>
        <input
          value={displayName}
          maxLength={40}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <div className="br-form-foot">
        {error && <p className="br-error">{error}</p>}
        <button type="submit" className="br-btn br-btn-primary" disabled={busy}>
          {busy ? t("Creating…") : t("Create bracket")}
        </button>
      </div>
    </form>
  );
}

function JoinPool({ email, onJoined }: { email: string | null; onJoined: (id: string) => void }) {
  const t = useT();
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState(() => savedName(email));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const who = displayName.trim() || "Player";
    setBusy(true);
    setError(null);
    try {
      rememberName(who);
      onJoined(await joinPool(code, who));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="br-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label>
        <span>{t("Pool code")}</span>
        <input
          value={code}
          maxLength={8}
          placeholder="AB12CD34"
          className="br-code-input"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
        />
      </label>
      <label>
        <span>{t("Your name in the pool")}</span>
        <input
          value={displayName}
          maxLength={40}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <div className="br-form-foot">
        {error && <p className="br-error">{error}</p>}
        <button
          type="submit"
          className="br-btn br-btn-primary"
          disabled={busy || code.length !== 8}
        >
          {busy ? t("Joining…") : t("Join pool")}
        </button>
      </div>
    </form>
  );
}
