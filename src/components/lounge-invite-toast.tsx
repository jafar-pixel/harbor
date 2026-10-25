import { useState } from "react";
import { Headphones, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { clearLoungeInvite, requestLoungeJoin, useLoungeInvites } from "@/lib/music/lounge/invites";
import { requestMusicTab } from "@/lib/music/social/inbox";
import { useView } from "@/lib/view";
import "@/views/music/music-friends.css";

/** "Jafar invited you to a Listening Lounge": shown anywhere in the app; Join opens the lounge. */
export function LoungeInviteToast() {
  const t = useT();
  const invites = useLoungeInvites();
  const { setView } = useView();
  const [hidden, setHidden] = useState<string[]>([]);
  const showing = invites.filter((i) => !hidden.includes(i.lounge_id)).slice(0, 2);
  if (!showing.length) return null;
  return (
    <div className="song-share-toasts lounge-invite-toasts" role="status" aria-live="polite">
      {showing.map((i) => (
        <div key={i.lounge_id} className="song-share-toast">
          <Headphones size={22} />
          <div>
            <strong>{t("{name} invited you to listen together", { name: i.host_name })}</strong>
            <span>{i.name}</span>
          </div>
          <button
            type="button"
            className="song-share-open"
            onClick={() => {
              setHidden((h) => [...h, i.lounge_id]);
              clearLoungeInvite(i.lounge_id, false);
              setView("music");
              requestMusicTab("lounge");
              requestLoungeJoin(i.lounge_id);
            }}
          >
            {t("Join")}
          </button>
          <button
            type="button"
            aria-label={t("Dismiss")}
            onClick={() => setHidden((h) => [...h, i.lounge_id])}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
