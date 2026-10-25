import { useCallback, useEffect, useState } from "react";
import { Check, Inbox, Play, Trash2, UserPlus, Users, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useJlSession } from "@/lib/jl/account/client";
import { startFromSong } from "@/lib/music/dj/session";
import {
  HANDLE,
  acceptFriend,
  deleteSharedSong,
  getMyHandle,
  listFriends,
  markSongsRead,
  removeFriend,
  requestFriend,
  setMyHandle,
  type MusicFriend,
  type MusicHandle,
  type SharedSong,
} from "@/lib/music/social/api";
import { refreshInbox, requestMusicTab, useSongInbox } from "@/lib/music/social/inbox";
import { useSettings } from "@/lib/settings";
import "./music-friends.css";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Friends and family in the Music Hub: your handle, adding friends, requests, and the songs
 * friends have sent you (play one and the DJ carries on from it).
 */
export function MusicFriends({ active }: { active: boolean }) {
  const t = useT();
  const session = useJlSession();
  const { settings } = useSettings();
  const inbox = useSongInbox();
  const [handle, setHandle] = useState<MusicHandle | null | undefined>(undefined);
  const [draft, setDraft] = useState({ handle: "", name: "" });
  const [friends, setFriends] = useState<MusicFriend[]>([]);
  const [add, setAdd] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [h, f] = await Promise.all([getMyHandle(), listFriends()]);
      setHandle(h);
      setFriends(f);
      if (h) setDraft({ handle: h.handle, name: h.display_name });
    } catch (error) {
      setHandle(null);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    if (active && session) void reload();
  }, [active, session, reload]);

  // Opening the tab reads what's waiting.
  useEffect(() => {
    if (!active) return;
    const unread = inbox.songs.filter((s) => !s.read_at).map((s) => s.id);
    if (unread.length) void markSongsRead(unread).then(refreshInbox);
  }, [active, inbox.songs]);

  const run = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
      if (done) setMessage(done);
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const play = (s: SharedSong) => {
    void startFromSong(
      { artist: s.artist, title: s.title, why: s.note ?? "", videoId: s.video_id },
      settings.musicStyles ?? [],
      s.sender_name,
    );
    requestMusicTab("dj");
  };

  if (!session) {
    return (
      <section className="music-friends-signin">
        <Users size={28} />
        <p>{t("Sign in to your JL Media Vision account to add friends and share songs.")}</p>
      </section>
    );
  }

  const requests = friends.filter((f) => f.status === "pending" && f.incoming);
  const waiting = friends.filter((f) => f.status === "pending" && !f.incoming);
  const mine = friends.filter((f) => f.status === "accepted");

  return (
    <section className="music-friends">
      {message && <p className="music-friends-message">{message}</p>}

      <div className="music-friends-grid">
        <section className="music-friends-card">
          <h3>{handle ? t("You") : t("Pick your handle")}</h3>
          <p className="music-friends-muted">
            {handle
              ? t("Friends add you with @{handle}.", { handle: handle.handle })
              : t("Friends and family add you by this handle.")}
          </p>
          <form
            className="music-friends-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => setMyHandle(draft.handle, draft.name), t("Saved."));
            }}
          >
            <label>
              <span>@</span>
              <input
                value={draft.handle}
                maxLength={24}
                placeholder="handle"
                aria-label={t("Handle")}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    handle: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
                  }))
                }
              />
            </label>
            <input
              value={draft.name}
              maxLength={40}
              placeholder={t("Your name")}
              aria-label={t("Your name")}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <button
              type="submit"
              disabled={busy || !HANDLE.test(draft.handle) || !draft.name.trim()}
            >
              {t("Save")}
            </button>
          </form>
        </section>

        <section className="music-friends-card">
          <h3>{t("Add a friend")}</h3>
          <form
            className="music-friends-form"
            onSubmit={(e) => {
              e.preventDefault();
              const who = add.trim().replace(/^@/, "");
              setAdd("");
              void run(async () => {
                const result = await requestFriend(who);
                setMessage(
                  result === "accepted"
                    ? t("You're now friends with @{handle}.", { handle: who })
                    : t("Request sent to @{handle}.", { handle: who }),
                );
              });
            }}
          >
            <label>
              <span>@</span>
              <input
                value={add}
                maxLength={25}
                placeholder={t("their handle")}
                aria-label={t("Friend's handle")}
                onChange={(e) => setAdd(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ""))}
              />
            </label>
            <button type="submit" disabled={busy || !handle || !HANDLE.test(add.replace(/^@/, ""))}>
              <UserPlus size={15} /> {t("Add")}
            </button>
          </form>
          {!handle && <p className="music-friends-muted">{t("Pick your handle first.")}</p>}
        </section>
      </div>

      {requests.length > 0 && (
        <section>
          <h3 className="music-friends-h">{t("Friend requests")}</h3>
          <ul className="music-friends-list">
            {requests.map((f) => (
              <li key={f.user_id}>
                <Person f={f} />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => acceptFriend(f.user_id))}
                >
                  <Check size={15} /> {t("Accept")}
                </button>
                <button
                  type="button"
                  aria-label={t("Decline")}
                  disabled={busy}
                  onClick={() => void run(() => removeFriend(f.user_id))}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="music-friends-h">
          <Inbox size={15} /> {t("Sent to you")}
        </h3>
        {inbox.songs.length === 0 ? (
          <p className="music-friends-muted">{t("Songs friends send you show up here.")}</p>
        ) : (
          <ul className="music-friends-inbox">
            {inbox.songs.map((s) => (
              <li key={s.id} data-unread={!s.read_at}>
                {s.video_id ? (
                  <img
                    src={`https://i.ytimg.com/vi/${s.video_id}/mqdefault.jpg`}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="music-friends-thumb" />
                )}
                <div>
                  <strong>{s.title}</strong>
                  <span>
                    {s.artist} · {t("from {name}", { name: s.sender_name })} · {ago(s.created_at)}
                  </span>
                  {s.note && <em>“{s.note}”</em>}
                </div>
                <button type="button" onClick={() => play(s)}>
                  <Play size={15} /> {t("Play")}
                </button>
                <button
                  type="button"
                  aria-label={t("Delete")}
                  onClick={() => void deleteSharedSong(s.id).then(refreshInbox)}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="music-friends-h">
          <Users size={15} /> {t("Friends & family")}
        </h3>
        {mine.length === 0 && waiting.length === 0 ? (
          <p className="music-friends-muted">{t("No friends yet. Add someone by their handle.")}</p>
        ) : (
          <ul className="music-friends-list">
            {mine.map((f) => (
              <li key={f.user_id}>
                <Person f={f} />
                <button
                  type="button"
                  className="music-friends-remove"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        t("Remove {name} from your friends?", { name: f.display_name }),
                      )
                    )
                      void run(() => removeFriend(f.user_id));
                  }}
                >
                  {t("Remove")}
                </button>
              </li>
            ))}
            {waiting.map((f) => (
              <li key={f.user_id}>
                <Person f={f} />
                <span className="music-friends-muted">{t("Request sent")}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => removeFriend(f.user_id))}
                >
                  {t("Cancel")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function Person({ f }: { f: MusicFriend }) {
  return (
    <span className="music-friends-person">
      <span className="music-friends-avatar">{f.display_name.slice(0, 1).toUpperCase()}</span>
      <span>
        <strong>{f.display_name}</strong>
        <em>@{f.handle}</em>
      </span>
    </span>
  );
}
