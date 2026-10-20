import { useState } from "react";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useParental } from "@/lib/parental";

/** Use the same PIN challenge as desktop before opening account or settings controls. */
export function useMobileAccess() {
  const { locked, unlock } = useParental();
  const [pending, setPending] = useState<(() => void) | null>(null);
  const run = (action: () => void) => {
    if (locked) setPending(() => action);
    else action();
  };
  const prompt = pending ? (
    <ParentalPinModal
      verify={unlock}
      mode={{
        kind: "unlock",
        onCancel: () => setPending(null),
        onUnlock: () => {
          setPending(null);
          pending();
        },
      }}
    />
  ) : null;
  return { run, prompt };
}
