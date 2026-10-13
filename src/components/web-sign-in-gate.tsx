import { useEffect, type ReactNode } from "react";
import { JlAccountForm } from "@/components/jl-account-form";
import { jlAccountsConfigured, useJlSession } from "@/lib/jl/account/client";
import { isRemoteRoute, isTvApp, isWeb } from "@/lib/platform";

/**
 * The web app (watch.jl-stream.com) opens only for a signed-in JL account: it reaches the owner's
 * services and relay, so a stranger with the address sees a sign-in page and nothing else. The
 * desktop app and the TV app keep their own optional sign-in, and the phone remote (/remote,
 * /setup) pairs with a desktop by code instead.
 */
export function WebSignInGate({
  children,
  onReady,
}: {
  children: ReactNode;
  onReady?: () => void;
}) {
  const session = useJlSession();
  const gated = isWeb() && !isTvApp() && !isRemoteRoute() && jlAccountsConfigured() && !session;
  useEffect(() => {
    if (gated) onReady?.();
  }, [gated, onReady]);
  if (!gated) return children;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-10">
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <div className="flex items-center gap-3">
          <img src="/brand/app-icon-192.png" alt="" className="h-12 w-12 rounded-xl" />
          <h1 className="font-display text-[28px] font-medium tracking-tight text-ink">
            JL Media Vision
          </h1>
        </div>
        <JlAccountForm intro="Sign in with your JL Media Vision account to continue." />
      </div>
    </main>
  );
}
