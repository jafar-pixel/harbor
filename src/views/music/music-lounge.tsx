import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Headphones,
  LogOut,
  Radio,
  Send,
  Sparkles,
  UserPlus,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useJlSession } from "@/lib/jl/account/client";
import { pauseDj, readPlayhead } from "@/lib/music/dj/playhead";
import { requestDj, useDj } from "@/lib/music/dj/session";
import { YT_PLAYING, loadYouTube, type YtPlayer } from "@/lib/music/dj/youtube";
import { inviteToLounge, myOpenLounges, type Lounge } from "@/lib/music/lounge/api";
import {
  LOUNGE_JOIN_EVENT,
  clearLoungeInvite,
  takeLoungeJoin,
  useLoungeInvites,
} from "@/lib/music/lounge/invites";
import {
  hostLounge,
  joinAsGuest,
  leaveCurrentLounge,
  resumeLounge,
  sendToLounge,
  useLounge,
} from "@/lib/music/lounge/session";
import { REACTIONS, loungePosition, needsSeek } from "@/lib/music/lounge/sync";
import { getMyHandle, listFriends, type MusicFriend } from "@/lib/music/social/api";
import { requestMusicTab } from "@/lib/music/social/inbox";
import { useSettings } from "@/lib/settings";
import "./music-friends.css";
import "./music-lounge.css";

const SYNC_MS = 1000;
const HERE_MS = 90_000;

/**
 * The Listening Lounge: a host plays their AI DJ set and friends and family hear the same song
 * at the same moment, react and request songs. Stays mounted while the Music Hub is open so a
 * guest keeps listening on other tabs.
 */
export function MusicLounge({ visible }: { visible: boolean }) {
  const t = useT();
  const session = useJlSession();
  const lounge = useLounge();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    void getMyHandle()
      .then((h) => h && setName((n) => n || h.display_name))
      .catch(() => {});
  }, [session]);

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  // An invite opened from the toast joins here.
  const nameRef = useRef(name);
  nameRef.current = name;
  useEffect(() => {
    const join = () => {
      const id = takeLoungeJoin();
      if (!id) return;
      clearLoungeInvite(id, false);
      void run(async () => {
        const who = nameRef.current || (await getMyHandle())?.display_name || "Guest";
        await joinAsGuest(id, who);
        pauseDj();
      });
    };
    join();
    window.addEventListener(LOUNGE_JOIN_EVENT, join);
    return () => window.removeEventListener(LOUNGE_JOIN_EVENT, join);
  }, [run]);

  if (!session) {
    return visible ? (
      <section className="music-friends-signin">
        <Headphones size={28} />
        <p>{t("Sign in to your JL Media Vision account to listen with friends.")}</p>
      </section>
    ) : null;
  }

  return (
    <section className="music-lounge music-friends" hidden={!visible}>
      {message && <p className="music-friends-message">{message}</p>}
      {lounge.lounge ? (
        <LoungeRoom />
      ) : (
        <LoungeLobby name={name} setName={setName} busy={busy} run={run} visible={visible} />
      )}
    </section>
  );
}

function LoungeLobby({
  name,
  setName,
  busy,
  run,
  visible,
}: {
  name: string;
  setName: (name: string) => void;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
  visible: boolean;
}) {
  const t = useT();
  const dj = useDj();
  const invites = useLoungeInvites();
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [open, setOpen] = useState<Lounge[]>([]);

  useEffect(() => {
    if (visible)
      void myOpenLounges()
        .then(setOpen)
        .catch(() => {});
  }, [visible]);

  const who = name.trim();
  const djOn = !!dj.vibe && dj.tracks.length > 0;

  return (
    <>
      <header className="music-lounge-hero">
        <Headphones size={30} />
        <div>
          <h2>{t("Listening Lounge")}</h2>
          <p>
            {t(
              "Listen together with friends and family: everyone hears the same song at the same moment.",
            )}
          </p>
        </div>
      </header>

      <label className="music-lounge-name">
        <span>{t("Your name in the lounge")}</span>
        <input
          value={name}
          maxLength={40}
          placeholder={t("Your name")}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      {invites.length > 0 && (
        <section>
          <h3 className="music-friends-h">{t("Invites")}</h3>
          <ul className="music-friends-list">
            {invites.map((i) => (
              <li key={i.lounge_id}>
                <span className="music-friends-person">
                  <span className="music-friends-avatar">
                    {i.host_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{i.name}</strong>
                    <em>{t("from {name}", { name: i.host_name })}</em>
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy || !who}
                  onClick={() =>
                    void run(async () => {
                      await joinAsGuest(i.lounge_id, who);
                      clearLoungeInvite(i.lounge_id, false);
                      pauseDj();
                    })
                  }
                >
                  {t("Join")}
                </button>
                <button
                  type="button"
                  aria-label={t("Decline")}
                  disabled={busy}
                  onClick={() => clearLoungeInvite(i.lounge_id, true)}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="music-friends-grid">
        <section className="music-friends-card">
          <h3>
            <Radio size={15} /> {t("Host a lounge")}
          </h3>
          <p className="music-friends-muted">
            {djOn
              ? t("Your lounge plays your AI DJ set: {vibe}.", { vibe: dj.vibe?.name ?? "" })
              : t("Your lounge plays whatever your AI DJ plays. Pick a vibe there first.")}
          </p>
          <form
            className="music-friends-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                hostLounge(
                  title.trim() || t("{name}'s Lounge", { name: who }),
                  dj.vibe?.name ?? null,
                  who,
                ),
              );
            }}
          >
            <input
              value={title}
              maxLength={80}
              placeholder={who ? t("{name}'s Lounge", { name: who }) : t("Lounge name")}
              aria-label={t("Lounge name")}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit" disabled={busy || !who}>
              {t("Open lounge")}
            </button>
          </form>
          {!djOn && (
            <button
              type="button"
              className="music-lounge-link"
              onClick={() => requestMusicTab("dj")}
            >
              <Sparkles size={14} /> {t("Go to AI DJ")}
            </button>
          )}
        </section>

        <section className="music-friends-card">
          <h3>
            <Users size={15} /> {t("Join with a code")}
          </h3>
          <p className="music-friends-muted">{t("Ask the host for their 6-character code.")}</p>
          <form
            className="music-friends-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await joinAsGuest(code, who);
                pauseDj();
              });
            }}
          >
            <input
              className="music-lounge-code-input"
              value={code}
              maxLength={6}
              placeholder="ABC123"
              aria-label={t("Lounge code")}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            <button type="submit" disabled={busy || !who || code.length !== 6}>
              {t("Join")}
            </button>
          </form>
        </section>
      </div>

      {open.length > 0 && (
        <section>
          <h3 className="music-friends-h">{t("Your open lounges")}</h3>
          <ul className="music-friends-list">
            {open.map((l) => (
              <li key={l.id}>
                <span className="music-friends-person">
                  <span className="music-friends-avatar">
                    <Headphones size={15} />
                  </span>
                  <span>
                    <strong>{l.name}</strong>
                    <em>{l.code}</em>
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy || !who}
                  onClick={() => void run(() => resumeLounge(l, who))}
                >
                  {t("Resume")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function LoungeRoom() {
  const t = useT();
  const state = useLounge();
  const { settings } = useSettings();
  const lounge = state.lounge as Lounge;
  const host = state.role === "host";
  const [copied, setCopied] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [text, setText] = useState("");
  const [asked, setAsked] = useState<number[]>([]);

  const now = Date.now();
  const here = state.members.filter((m) => now - Date.parse(m.last_seen) <= HERE_MS);
  const requests = state.events
    .filter((e) => e.kind === "request")
    .slice(-8)
    .reverse();
  const feed = state.events.filter((e) => e.kind !== "reaction").slice(-40);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lounge.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the code is on screen to read out.
    }
  };

  const close = () => {
    if (!host || window.confirm(t("Close the lounge for everyone?"))) void leaveCurrentLounge();
  };

  return (
    <div className="music-lounge-room">
      <header className="music-lounge-bar">
        <div>
          <h2>{lounge.name}</h2>
          <p>
            {host ? t("You're hosting") : t("Listening together")}
            {lounge.vibe ? ` · ${lounge.vibe}` : ""}
          </p>
        </div>
        <button type="button" className="music-lounge-code" onClick={() => void copy()}>
          <span>{t("Code")}</span>
          <strong>{lounge.code}</strong>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        {host && (
          <button type="button" onClick={() => setInviting(true)}>
            <UserPlus size={15} /> {t("Invite")}
          </button>
        )}
        <button type="button" onClick={close}>
          <LogOut size={15} /> {host ? t("Close") : t("Leave")}
        </button>
      </header>

      {state.closed && <p className="music-friends-message">{t("The host closed the lounge.")}</p>}
      {state.error && <p className="music-friends-message">{state.error}</p>}

      <div className="music-lounge-stage">
        {host ? <HostStage lounge={lounge} /> : <GuestStage lounge={lounge} />}
        <div className="music-lounge-bursts" aria-hidden="true">
          {state.bursts.map((b) => (
            <span key={b.id} style={{ left: `${10 + ((b.id * 37) % 80)}%` }}>
              {b.body}
            </span>
          ))}
        </div>
      </div>

      <div className="music-lounge-reactions" role="group" aria-label={t("React")}>
        {REACTIONS.map((r) => (
          <button key={r} type="button" onClick={() => void sendToLounge("reaction", r)}>
            {r}
          </button>
        ))}
      </div>

      <div className="music-lounge-panels">
        <section className="music-friends-card">
          <h3>{host ? t("Requests") : t("Request a song")}</h3>
          {!host && (
            <p className="music-friends-muted">
              {t("Name a song, an artist or a vibe. The host's DJ picks it up.")}
            </p>
          )}
          {requests.length === 0 ? (
            <p className="music-friends-muted">{t("No requests yet.")}</p>
          ) : (
            <ul className="music-lounge-requests">
              {requests.map((r) => (
                <li key={r.id}>
                  <span>
                    <strong>{r.body}</strong>
                    <em>{r.display_name}</em>
                  </span>
                  {host && (
                    <button
                      type="button"
                      disabled={asked.includes(r.id)}
                      onClick={() => {
                        setAsked((a) => [...a, r.id]);
                        void requestDj(
                          `A listener asked for: ${r.body}`,
                          settings.musicStyles ?? [],
                        );
                      }}
                    >
                      {asked.includes(r.id) ? <Check size={14} /> : <Sparkles size={14} />}
                      {asked.includes(r.id) ? t("Asked") : t("Ask the DJ")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="music-friends-card music-lounge-chat">
          <h3>
            <Users size={15} /> {t("{count} here", { count: String(here.length) })}
          </h3>
          <div className="music-lounge-people">
            {here.map((m) => (
              <span key={m.user_id} title={m.display_name} className="music-friends-avatar">
                {m.display_name.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          <ul className="music-lounge-feed" aria-live="polite">
            {feed.map((e) => (
              <li key={e.id} data-kind={e.kind}>
                <strong>{e.display_name}</strong>{" "}
                {e.kind === "request" ? t("requested {song}", { song: e.body }) : e.body}
              </li>
            ))}
          </ul>
          <form
            className="music-friends-form"
            onSubmit={(e) => {
              e.preventDefault();
              const body = text;
              setText("");
              void sendToLounge(host ? "chat" : "request", body);
            }}
          >
            <input
              value={text}
              maxLength={200}
              placeholder={host ? t("Say something") : t("Request a song or say something")}
              aria-label={host ? t("Message") : t("Request")}
              onChange={(e) => setText(e.target.value)}
            />
            {!host && (
              <button
                type="button"
                disabled={!text.trim()}
                onClick={() => {
                  const body = text;
                  setText("");
                  void sendToLounge("chat", body);
                }}
              >
                {t("Chat")}
              </button>
            )}
            <button type="submit" aria-label={t("Send")} disabled={!text.trim()}>
              <Send size={15} /> {host ? t("Send") : t("Request")}
            </button>
          </form>
        </section>
      </div>

      {inviting && <InviteDialog lounge={lounge} onClose={() => setInviting(false)} />}
    </div>
  );
}

function NowCard({ lounge, note }: { lounge: Lounge; note: string }) {
  return (
    <div className="music-lounge-now">
      {lounge.now_video_id ? (
        <img src={`https://i.ytimg.com/vi/${lounge.now_video_id}/hqdefault.jpg`} alt="" />
      ) : (
        <span className="music-lounge-now-empty">
          <Headphones size={34} />
        </span>
      )}
      <div>
        <strong>{lounge.now_title ?? ""}</strong>
        <span>{lounge.now_artist ?? ""}</span>
        <em>{note}</em>
      </div>
    </div>
  );
}

/** The host hears the DJ decks; this shows what guests are hearing. */
function HostStage({ lounge }: { lounge: Lounge }) {
  const t = useT();
  const playing = !!readPlayhead();
  return (
    <>
      <NowCard
        lounge={lounge}
        note={
          playing
            ? lounge.paused_at
              ? t("Paused for everyone")
              : t("Everyone hears this from your AI DJ")
            : t("Start your AI DJ and the lounge hears it too.")
        }
      />
      {!playing && (
        <button type="button" className="music-lounge-tune" onClick={() => requestMusicTab("dj")}>
          <Sparkles size={16} /> {t("Go to AI DJ")}
        </button>
      )}
    </>
  );
}

/** A guest's player, kept on the host's song and position. */
function GuestStage({ lounge }: { lounge: Lounge }) {
  const t = useT();
  const offset = useLounge().offset;
  const mount = useRef<HTMLDivElement>(null);
  const player = useRef<YtPlayer | null>(null);
  const loaded = useRef<string | null>(null);
  const live = useRef({ lounge, offset });
  live.current = { lounge, offset };
  const [tuned, setTuned] = useState(false);
  const [volume, setVolume] = useState(90);
  const [failed, setFailed] = useState<string | null>(null);

  const sync = useCallback(() => {
    const p = player.current;
    const { lounge: l, offset: o } = live.current;
    if (!p) return;
    if (!l.now_video_id || l.ended) {
      p.pauseVideo();
      return;
    }
    const target = loungePosition(
      {
        startedAt: l.started_at ? Date.parse(l.started_at) : null,
        pausedAt: l.paused_at ? Date.parse(l.paused_at) : null,
      },
      Date.now() + o,
    );
    if (loaded.current !== l.now_video_id) {
      loaded.current = l.now_video_id;
      p.loadVideoById(l.now_video_id);
      p.seekTo(target, true);
      if (l.paused_at) p.pauseVideo();
      return;
    }
    if (l.paused_at) {
      if (p.getPlayerState() === YT_PLAYING) p.pauseVideo();
      if (needsSeek(p.getCurrentTime(), target)) p.seekTo(target, true);
      return;
    }
    if (p.getPlayerState() !== YT_PLAYING) p.playVideo();
    else if (needsSeek(p.getCurrentTime(), target)) p.seekTo(target, true);
  }, []);

  const tuneIn = async () => {
    setFailed(null);
    try {
      const api = await loadYouTube();
      const host = mount.current;
      if (!host || player.current) return setTuned(true);
      const el = document.createElement("div");
      host.replaceChildren(el);
      await new Promise<void>((resolve) => {
        player.current = new api.Player(el, {
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            origin: location.origin,
          },
          events: {
            onReady: () => resolve(),
            onError: () => setFailed(t("This song can't play here. The next one will.")),
          },
        });
      });
      player.current?.setVolume(volume);
      setTuned(true);
      sync();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    if (!tuned) return;
    const id = window.setInterval(sync, SYNC_MS);
    return () => window.clearInterval(id);
  }, [tuned, sync]);

  // A new song clears the last song's error.
  useEffect(() => setFailed(null), [lounge.now_video_id]);

  useEffect(
    () => () => {
      player.current?.destroy();
      player.current = null;
    },
    [],
  );

  return (
    <>
      <div className="music-lounge-player" data-on={tuned}>
        <div ref={mount} />
      </div>
      {!tuned && (
        <div className="music-lounge-cover">
          <NowCard
            lounge={lounge}
            note={lounge.now_video_id ? t("Playing now") : t("Waiting for the host to start")}
          />
          <button type="button" className="music-lounge-tune" onClick={() => void tuneIn()}>
            <Headphones size={16} /> {t("Tune in")}
          </button>
        </div>
      )}
      {tuned && (
        <div className="music-lounge-guestbar">
          <span>
            <strong>{lounge.now_title ?? t("Waiting for the host to start")}</strong>
            {lounge.now_artist && <em>{lounge.now_artist}</em>}
            {lounge.paused_at && <em>{t("Paused by the host")}</em>}
            {failed && <em>{failed}</em>}
          </span>
          <label>
            <Volume2 size={15} />
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              aria-label={t("Volume")}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                player.current?.setVolume(v);
              }}
            />
          </label>
        </div>
      )}
    </>
  );
}

function InviteDialog({ lounge, onClose }: { lounge: Lounge; onClose: () => void }) {
  const t = useT();
  const [friends, setFriends] = useState<MusicFriend[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
      await inviteToLounge(lounge.id, picked);
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
      <div className="music-send" role="dialog" aria-modal="true" aria-label={t("Invite friends")}>
        <header>
          <div>
            <h2>{t("Invite friends")}</h2>
            <p>{t("Or share the code {code}", { code: lounge.code })}</p>
          </div>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {friends === null ? (
          <p className="music-send-muted">{t("Loading your friends…")}</p>
        ) : friends.length === 0 ? (
          <div className="music-send-empty">
            <p>{t("Add friends first, or share the code with family.")}</p>
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
          <footer>
            {message && <p className="music-send-error">{message}</p>}
            <button
              type="button"
              className="music-send-go"
              disabled={!picked.length || busy || sent}
              onClick={() => void send()}
            >
              {sent ? <Check size={16} /> : <UserPlus size={16} />}
              {sent ? t("Invited") : busy ? t("Inviting…") : t("Invite")}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
