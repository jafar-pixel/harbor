import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { dismissArrival, requestMusicTab, useSongInbox } from "@/lib/music/social/inbox";
import { useView } from "@/lib/view";
import "@/views/music/music-friends.css";

/** "Jafar sent you a song": shown anywhere in the app; Open goes to the Music Hub's friends tab. */
export function SongShareToast() {
  const t = useT();
  const { arrivals } = useSongInbox();
  const { setView } = useView();
  if (!arrivals.length) return null;
  return (
    <div className="song-share-toasts" role="status" aria-live="polite">
      {arrivals.slice(0, 3).map((s) => (
        <div key={s.id} className="song-share-toast">
          {s.video_id && <img src={`https://i.ytimg.com/vi/${s.video_id}/mqdefault.jpg`} alt="" />}
          <div>
            <strong>{t("{name} sent you a song", { name: s.sender_name })}</strong>
            <span>
              {s.title} · {s.artist}
            </span>
          </div>
          <button
            type="button"
            className="song-share-open"
            onClick={() => {
              dismissArrival(s.id);
              setView("music");
              requestMusicTab("friends");
            }}
          >
            {t("Open")}
          </button>
          <button type="button" aria-label={t("Dismiss")} onClick={() => dismissArrival(s.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
