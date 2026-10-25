import { useSyncExternalStore } from "react";
import { readPlayhead } from "../dj/playhead";
import {
  createLounge,
  endLounge,
  getLounge,
  joinLounge,
  leaveLounge,
  listEvents,
  listMembers,
  markSeen,
  me,
  postEvent,
  serverNow,
  setNowPlaying,
  type Lounge,
  type LoungeEvent,
  type LoungeMember,
} from "./api";
import { clockOffset } from "./sync";

/**
 * The lounge you're in. Every couple of seconds it reads the lounge (what's on), new events
 * (reactions, requests, chat) and, now and then, who's here. A host also writes what the DJ
 * decks are playing so guests can line up.
 */

export type LoungeState = {
  lounge: Lounge | null;
  role: "host" | "guest" | null;
  name: string;
  members: LoungeMember[];
  events: LoungeEvent[];
  /** Reactions that came in since you joined, for the floating emoji. */
  bursts: { id: number; body: string }[];
  /** Add to this device's clock to get the server's. */
  offset: number;
  closed: boolean;
  error: string | null;
};

const POLL_MS = 2000;
const MEMBERS_EVERY = 5;
const SEEN_EVERY = 15;
const DRIFT_MS = 1500;
const BURST_MS = 3200;

let state: LoungeState = {
  lounge: null,
  role: null,
  name: "",
  members: [],
  events: [],
  bursts: [],
  offset: 0,
  closed: false,
  error: null,
};
const listeners = new Set<() => void>();
let timer = 0;
let ticks = 0;
let lastEvent: number | null = null;
let busy = false;
let run = 0;

function set(next: Partial<LoungeState>) {
  state = { ...state, ...next };
  for (const fn of listeners) fn();
}

export const loungeState = () => state;
export function useLounge(): LoungeState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    loungeState,
    loungeState,
  );
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function measureOffset(): Promise<number> {
  try {
    const sent = Date.now();
    const server = await serverNow();
    return clockOffset(sent, server, Date.now());
  } catch {
    return 0;
  }
}

/** The host's decks → the lounge row, when the song, pause or position changed. */
async function publish(lounge: Lounge): Promise<void> {
  const head = readPlayhead();
  const now = Date.now() + state.offset;
  const startedAt = head ? Math.round(now - head.position * 1000) : null;
  const pausedAt = head?.paused ? now : null;
  const published = lounge.started_at ? Date.parse(lounge.started_at) : null;
  const same =
    (head?.videoId ?? null) === lounge.now_video_id &&
    !!head?.paused === !!lounge.paused_at &&
    (head === null ||
      (published !== null && startedAt !== null && Math.abs(published - startedAt) <= DRIFT_MS));
  if (same) return;
  await setNowPlaying(lounge.id, {
    videoId: head?.videoId ?? null,
    artist: head?.artist ?? null,
    title: head?.title ?? null,
    startedAt,
    pausedAt,
  });
}

async function poll(id: number): Promise<void> {
  const lounge = state.lounge;
  if (!lounge || busy) return;
  busy = true;
  try {
    const fresh = await getLounge(lounge.id);
    if (id !== run) return;
    if (!fresh || fresh.ended) {
      stopPolling();
      set({ closed: true, lounge: fresh ?? lounge });
      return;
    }
    if (state.role === "host") await publish(fresh);
    const events = await listEvents(fresh.id, lastEvent);
    if (id !== run) return;
    const next: Partial<LoungeState> = { lounge: fresh, error: null };
    if (events.length) {
      const animate = lastEvent !== null;
      lastEvent = events[events.length - 1].id;
      next.events = [...state.events, ...events].slice(-80);
      if (animate) {
        const bursts = events
          .filter((e) => e.kind === "reaction")
          .map((e) => ({ id: e.id, body: e.body }));
        if (bursts.length) {
          next.bursts = [...state.bursts, ...bursts].slice(-24);
          window.setTimeout(() => {
            const gone = new Set(bursts.map((b) => b.id));
            set({ bursts: state.bursts.filter((b) => !gone.has(b.id)) });
          }, BURST_MS);
        }
      }
    }
    if (ticks % MEMBERS_EVERY === 0) next.members = await listMembers(fresh.id);
    if (ticks % SEEN_EVERY === 0) void markSeen(fresh.id).catch(() => {});
    ticks += 1;
    if (id === run) set(next);
  } catch (error) {
    if (id === run) set({ error: message(error) });
  } finally {
    busy = false;
  }
}

function tick() {
  if (document.visibilityState === "visible" || state.role === "host") void poll(run);
}

function startPolling() {
  stopPolling();
  ticks = 0;
  lastEvent = null;
  const id = run;
  void poll(id);
  timer = window.setInterval(tick, POLL_MS);
}

function stopPolling() {
  window.clearInterval(timer);
  timer = 0;
}

async function enter(loungeId: string, name: string, role: "host" | "guest"): Promise<void> {
  const id = ++run;
  const [lounge, offset] = await Promise.all([getLounge(loungeId), measureOffset()]);
  if (id !== run) return;
  if (!lounge) throw new Error("No open lounge with that code.");
  set({
    lounge,
    role,
    name,
    offset,
    members: [],
    events: [],
    bursts: [],
    closed: false,
    error: null,
  });
  startPolling();
}

/** Open a lounge and host it with what the DJ is playing. */
export async function hostLounge(title: string, vibe: string | null, name: string): Promise<void> {
  const lounge = await createLounge(title, vibe);
  await joinLounge(lounge.id, name);
  await enter(lounge.id, name, "host");
}

/** Pick up a lounge you opened earlier. */
export async function resumeLounge(lounge: Lounge, name: string): Promise<void> {
  await joinLounge(lounge.id, name);
  await enter(lounge.id, name, "host");
}

/** Join by code, or by id from an invite. */
export async function joinAsGuest(codeOrId: string, name: string): Promise<void> {
  const id = await joinLounge(codeOrId, name);
  const lounge = await getLounge(id);
  await enter(id, name, lounge?.host === me() ? "host" : "guest");
}

/** A host closes the lounge for everyone; a guest just leaves. */
export async function leaveCurrentLounge(): Promise<void> {
  const { lounge, role } = state;
  run++;
  stopPolling();
  set({
    lounge: null,
    role: null,
    members: [],
    events: [],
    bursts: [],
    closed: false,
    error: null,
  });
  if (!lounge) return;
  try {
    if (role === "host") await endLounge(lounge.id);
    else await leaveLounge(lounge.id);
  } catch {
    // Already closed, or offline; nothing more to undo here.
  }
}

export async function sendToLounge(kind: LoungeEvent["kind"], body: string): Promise<void> {
  const { lounge, name } = state;
  if (!lounge) return;
  try {
    await postEvent(lounge.id, name, kind, body);
    void poll(run);
  } catch (error) {
    set({ error: message(error) });
  }
}
