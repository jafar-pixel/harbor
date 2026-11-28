import { useEffect, useState } from "react";
import { jlRpc, useJlSession } from "./client";

type Access = "signed-out" | "checking" | "allowed" | "denied" | "unavailable";

export function useJlProAccess(enabled = true): Access {
  const session = useJlSession();
  const userId = enabled ? session?.userId : undefined;
  const [result, setResult] = useState<{ userId: string; access: Access } | null>(null);

  useEffect(() => {
    if (!userId) {
      setResult(null);
      return;
    }
    let active = true;
    void jlRpc<boolean>("jl_has_pro_access").then(
      (allowed) => {
        if (active) setResult({ userId, access: allowed === true ? "allowed" : "denied" });
      },
      () => {
        if (active) setResult({ userId, access: "unavailable" });
      },
    );
    return () => {
      active = false;
    };
  }, [userId]);

  if (!userId) return "signed-out";
  return result?.userId === userId ? result.access : "checking";
}
