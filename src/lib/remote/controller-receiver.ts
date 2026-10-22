import { useCallback, useSyncExternalStore } from "react";
import { useJlSession } from "@/lib/jl/account/client";
const EVENT = "jl:controller-receiver";
/** Device-local opt-in, separate from serving the desktop app on the LAN. */
export function useControllerReceiver() {
  const owner = useJlSession()?.userId ?? "";
  const key = "jl.remote.receiver.v1." + owner;
  const enabled = useSyncExternalStore(
    (notify) => {
      window.addEventListener(EVENT, notify);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener(EVENT, notify);
        window.removeEventListener("storage", notify);
      };
    },
    () => {
      try {
        return !!owner && localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const setEnabled = useCallback(
    (value: boolean) => {
      if (!owner) return;
      try {
        localStorage.setItem(key, value ? "1" : "0");
        window.dispatchEvent(new Event(EVENT));
      } catch {
        /* No permission is granted when storage is unavailable. */
      }
    },
    [owner, key],
  );
  return [enabled, setEnabled] as const;
}
