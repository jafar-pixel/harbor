import { useEffect, useState } from "react";
import {
  Check,
  Headphones,
  Inbox,
  Laptop,
  Mail,
  Monitor,
  Play,
  Smartphone,
  Trash2,
  Tv,
  Users,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useJlSession } from "@/lib/jl/account/client";
import { pauseDj } from "@/lib/music/dj/playhead";
import { enterAsGuest } from "@/lib/music/lounge/session";
import { playNow } from "@/lib/music/player/store";
import {
  acceptFriend,
  deleteSharedSong,
  getMyHandle,
  markSongsRead,
  removeFriend,
  type SharedSong,
} from "@/lib/music/social/api";
import {
  inviteFriendByEmail,
  joinFriendLounge,
  useFriendsLive,
  type FriendPlaying,
  type LiveFriend,
} from "@/lib/music/social/friends-live";
import { refreshInbox, requestMusicTab, useSongInbox } from "@/lib/music/social/inbox";
import "./music-friends.css";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const DEVICE_ICON = { desktop: Monitor, web: Laptop, android: Tv } as const;

/**
 * Friends, simply: invite someone by email, then see what each friend is playing on which
 * device and who's chilling in a Listening Lounge (join with one tap). Songs friends sent you
 * play in the shared player.
 */
export function MusicFriends({ active }: { active: boolean }) {
  const t = useT();
  const session = useJlSession();
  const inbox = useSongInbox();
  const { data, error, reload } = useFriendsLive(active && !!session);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  // Opening the tab reads what's waiting.
  useEffect(() => {
    if (!active) return;
    const unread = inbox.songs.filter((s) => !s.read_at).map((s) => s.id);
    if (unread.length) void markSongsRead(unread).then(refreshInbox);
  }, [active, inbox.songs]);

  if (!session)
    return (
      <section className="music-friends-signin">
        <Users size={28} />
        <p>{t("Sign in to your JL Media Vision account to add friends.")}</p>
      </section>
    );

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const invite = () =>
    void run(async () => {
      setLink(null);
      const out = await inviteFriendByEmail(email.trim());
      setEmail("");
      if (out.status === "link" && out.link) {
        setLink(out.link);
        setMessage(t("Their account is ready. Send them this link to join:"));
      } else
        setMessage(
          out.status === "emailed"
            ? t("Invite sent. You're friends as soon as they join.")
            : out.status === "accepted"
              ? t("You're now friends.")
              : out.status === "already"
                ? t("You're already friends.")
                : t("Friend request sent."),
        );
    });

  const join = (f: LiveFriend) =>
    void run(async () => {
      const name = (await getMyHandle().catch(() => null))?.display_name || "Guest";
      const { loungeId } = await joinFriendLounge(f.lounge!.id, name);
      await enterAsGuest(loungeId, name);
      pauseDj();
      requestMusicTab("lounge");
    });

  const playShared = (s: SharedSong) =>
    playNow({
      source: "song",
      title: s.title,
      artist: s.artist,
      art: s.video_id ? `https://i.ytimg.com/vi/${s.video_id}/hqdefault.jpg` : null,
      videoId: s.video_id,
    });

  const friends = data?.friends ?? [];
  const listening = friends.filter((f) => f.playing.length || f.lounge);
  const quiet = friends.filter((f) => !f.playing.length && !f.lounge);

  return (
    <section className="music-friends">
      <form
        className="music-friends-invite"
        onSubmit={(e) => {
          e.preventDefault();
          invite();
        }}
      >
        <div>
          <h2>
            <Mail size={20} /> {t("Invite a friend")}
          </h2>
          <p className="music-friends-muted">
            {t("Enter their email. New people get an invite to join JL Media Vision.")}
          </p>
        </div>
        <label className="sr-only" htmlFor="friend-email">
          {t("Friend's email")}
        </label>
        <input
          id="friend-email"
          type="email"
          value={email}
          placeholder="name@example.com"
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={busy || !email.includes("@")}>
          {t("Send invite")}
        </button>
      </form>
      {message && (
        <p className="music-friends-message">
          {message}
          {link && (
            <>
              {" "}
              <a href={link} target="_blank" rel="noreferrer">
                {t("Invite link")}
              </a>
            </>
          )}
        </p>
      )}
      {error && <p className="music-friends-message">{error}</p>}

      {(data?.requests.length ?? 0) > 0 && (
        <section>
          <h3 className="music-friends-h">{t("Friend requests")}</h3>
          <ul className="music-friends-list">
            {data!.requests.map((r) => (
              <li key={r.userId}>
                <span className="music-friends-person">
                  <span className="music-friends-avatar">{r.name.slice(0, 1).toUpperCase()}</span>
                  <strong>{r.name}</strong>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => acceptFriend(r.userId))}
                >
                  <Check size={14} /> {t("Accept")}
                </button>
                <button
                  type="button"
                  aria-label={t("Decline")}
                  disabled={busy}
                  onClick={() => void run(() => removeFriend(r.userId))}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="music-friends-h">{t("Listening now")}</h3>
        {!data ? (
          <p className="music-friends-muted">{t("Loading…")}</p>
        ) : listening.length === 0 ? (
          <p className="music-friends-muted">
            {friends.length
              ? t("None of your friends are listening right now.")
              : t("Invite friends by email and see what they're playing here.")}
          </p>
        ) : (
          <div className="music-friends-live">
            {listening.map((f) => (
              <article key={f.userId} className="music-friends-live-card">
                <header>
                  <span className="music-friends-avatar">{f.name.slice(0, 1).toUpperCase()}</span>
                  <strong>{f.name}</strong>
                  {f.lounge && (
                    <span className="music-friends-badge">
                      <Headphones size={12} /> {f.lounge.hosting ? t("Hosting") : t("In a lounge")}
                    </span>
                  )}
                </header>
                {f.playing.map((p) => (
                  <Playing key={`${p.device_name}-${p.updated_at}`} p={p} />
                ))}
                {f.lounge && (
                  <button
                    type="button"
                    className="music-friends-join"
                    disabled={busy}
                    onClick={() => join(f)}
                  >
                    <Headphones size={15} /> {t("Join {name}", { name: f.lounge.name })}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {quiet.length > 0 && (
        <section>
          <h3 className="music-friends-h">{t("Friends")}</h3>
          <ul className="music-friends-list">
            {quiet.map((f) => (
              <li key={f.userId}>
                <span className="music-friends-person">
                  <span className="music-friends-avatar">{f.name.slice(0, 1).toUpperCase()}</span>
                  <span>
                    <strong>{f.name}</strong>
                    <em>{t("Not listening")}</em>
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={t("Remove {name}", { name: f.name })}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t("Remove {name} from your friends?", { name: f.name })))
                      void run(() => removeFriend(f.userId));
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(data?.sent.length ?? 0) > 0 && (
        <p className="music-friends-muted">
          {t("Waiting for: {names}", { names: data!.sent.map((s) => s.name).join(", ") })}
        </p>
      )}

      <section>
        <h3 className="music-friends-h">
          <Inbox size={15} /> {t("Songs sent to you")}
        </h3>
        {inbox.songs.length === 0 ? (
          <p className="music-friends-muted">{t("Nothing yet.")}</p>
        ) : (
          <ul className="music-friends-inbox">
            {inbox.songs.map((s) => (
              <li key={s.id}>
                {s.video_id ? (
                  <img src={`https://i.ytimg.com/vi/${s.video_id}/mqdefault.jpg`} alt="" />
                ) : (
                  <span className="music-friends-avatar">♪</span>
                )}
                <span>
                  <strong>{s.title}</strong>
                  <span>
                    {s.artist} · {t("from {name}", { name: s.sender_name })} · {ago(s.created_at)}
                  </span>
                  {s.note && <em>“{s.note}”</em>}
                </span>
                <button type="button" aria-label={t("Play")} onClick={() => playShared(s)}>
                  <Play size={15} />
                </button>
                <button
                  type="button"
                  aria-label={t("Delete")}
                  onClick={() => void deleteSharedSong(s.id).then(refreshInbox)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function Playing({ p }: { p: FriendPlaying }) {
  const t = useT();
  const Icon = DEVICE_ICON[p.device_kind] ?? Smartphone;
  return (
    <div className="music-friends-playing">
      {p.art ? <img src={p.art} alt="" /> : <span className="music-friends-noart">♪</span>}
      <span>
        <strong>{p.title}</strong>
        <span>{p.artist}</span>
        <em>
          <Icon size={12} /> {p.device_name}
          {p.paused ? ` · ${t("paused")}` : ""}
        </em>
      </span>
      {p.video_id && (
        <button
          type="button"
          aria-label={t("Play this too")}
          onClick={() =>
            playNow({
              source: "youtube",
              title: p.title,
              artist: p.artist,
              art: p.art,
              videoId: p.video_id,
            })
          }
        >
          <Play size={15} />
        </button>
      )}
    </div>
  );
}
