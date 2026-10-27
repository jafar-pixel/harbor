import { useEffect, useState } from "react";
import { adoptJlLink, updateJlPassword } from "@/lib/jl/account/client";
import { useT } from "@/lib/i18n";

// Survives the reload that signing in to a different account triggers.
const PENDING_KEY = "jl.account.link";

function readPending(): string | null {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

function writePending(value: string | null): void {
  try {
    if (value) sessionStorage.setItem(PENDING_KEY, value);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* private mode: the password step just won't reappear after a reload */
  }
}

/**
 * Finishes account email links that open the web app: a password reset signs the person in and
 * asks for a new password, a confirmation link just signs them in. Supabase puts the session (or
 * an error such as an expired link) in the URL fragment.
 */
export function JlAccountLink() {
  const t = useT();
  const [pending, setPending] = useState<string | null>(readPending);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!/access_token=|error_description=/.test(hash)) return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const failure = params.get("error_description");
    if (failure) {
      setError(failure.replace(/\+/g, " "));
      return;
    }
    const type = params.get("type") ?? "";
    writePending(type);
    setPending(type);
    adoptJlLink(hash).catch((e: unknown) => {
      writePending(null);
      setPending(null);
      setError(e instanceof Error ? e.message : String(e));
    });
  }, []);

  if (error) {
    return (
      <LinkDialog title={t("That link didn't work")}>
        <p className="text-[14px] leading-relaxed text-ink-muted">
          {t("{message} Request a new email from the sign-in screen.", { message: error })}
        </p>
        <button
          onClick={() => setError(null)}
          className="h-11 rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas"
        >
          {t("OK")}
        </button>
      </LinkDialog>
    );
  }
  if (pending !== "recovery" && pending !== "invite") return null;
  return (
    <NewPasswordForm
      welcome={pending === "invite"}
      onDone={() => {
        writePending(null);
        setPending(null);
      }}
    />
  );
}

function NewPasswordForm({ onDone, welcome }: { onDone: () => void; welcome?: boolean }) {
  const t = useT();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (password.length < 6) {
      setError(t("Use at least 6 characters."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateJlPassword(password);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <LinkDialog title={welcome ? t("Welcome to the family") : t("Choose a new password")}>
      {welcome && (
        <p className="text-[14px] leading-relaxed text-ink-muted">
          {t(
            "You were invited to a JL Media Vision family. Choose a password for your account; your family's services are already set up.",
          )}
        </p>
      )}
      <input
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void save()}
        placeholder={t("New password")}
        className="h-11 rounded-xl border border-edge bg-canvas px-4 text-[14px] text-ink outline-none focus:border-ink-subtle"
      />
      {error && <p className="text-[13px] text-danger">{error}</p>}
      <button
        onClick={() => void save()}
        disabled={busy}
        className="h-11 rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas disabled:opacity-40"
      >
        {busy ? t("Saving…") : t("Save password")}
      </button>
    </LinkDialog>
  );
}

function LinkDialog({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-full max-w-[400px] flex-col gap-4 rounded-2xl border border-edge-soft bg-surface p-6"
      >
        <h2 className="font-display text-[22px] font-medium text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}
