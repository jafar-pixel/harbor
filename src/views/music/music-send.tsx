import { useEffect, useState } from "react";
import { Check, Send, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { listFriends, sendSong, type MusicFriend, type SongToShare } from "@/lib/music/social/api";
import { requestMusicTab } from "@/lib/music/social/inbox";
import "./music-friends.css";

/** "Send to a friend": pick friends, add a note, and the song lands in their inbox. */
export function SendSongDialog({ song, onClose }: { song: SongToShare; onClose: () => void }) {
  const t = useT();
  const [friends, setFriends] = useState<MusicFriend[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    listFriends()
      .then((all) => setFriends(all.filter((f) => f.status === "accepted")))
      .catch((error: unknown) => {
        setFriends([]);
        setMessage(error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const send = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await sendSong(picked, song, note);
      setSent(true);
      window.setTimeout(onClose, 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="music-send-scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="music-send"
        role="dialog"
        aria-modal="true"
        aria-label={t("Send to a friend")}
      >
        <header>
          <div>
            <h2>{t("Send to a friend")}</h2>
            <p>
              {song.title} · {song.artist}
            </p>
          </div>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {friends === null ? (
          <p className="music-send-muted">{t("Loading your friends…")}</p>
        ) : friends.length === 0 ? (
          <div className="music-send-empty">
            <p>{t("Add friends first. They'll get songs you send right in their Music inbox.")}</p>
            <button
              type="button"
              onClick={() => {
                onClose();
                requestMusicTab("friends");
              }}
            >
              {t("Add friends")}
            </button>
          </div>
        ) : (
          <ul className="music-send-friends">
            {friends.map((f) => {
              const on = picked.includes(f.user_id);
              return (
                <li key={f.user_id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setPicked((list) =>
                        on ? list.filter((id) => id !== f.user_id) : [...list, f.user_id],
                      )
                    }
                  >
                    <span className="music-send-avatar">
                      {f.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{f.display_name}</strong>
                      <em>@{f.handle}</em>
                    </span>
                    {on && <Check size={16} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!!friends?.length && (
          <>
            <textarea
              value={note}
              maxLength={280}
              rows={2}
              placeholder={t("Add a note (optional)")}
              onChange={(e) => setNote(e.target.value)}
            />
            <footer>
              {message && <p className="music-send-error">{message}</p>}
              <button
                type="button"
                className="music-send-go"
                disabled={!picked.length || busy || sent}
                onClick={() => void send()}
              >
                {sent ? <Check size={16} /> : <Send size={16} />}
                {sent ? t("Sent") : busy ? t("Sending…") : t("Send")}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
