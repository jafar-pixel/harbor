import { useEffect, useSyncExternalStore } from "react";
import {
  assertJlAccountCurrent,
  freshJlSession,
  jlAccountContext,
  useJlSession,
} from "@/lib/jl/account/client";
import { openPrivateRemoteChannel, type PrivateRemoteChannel } from "./account-channel";
import { accountRemoteSnapshot, validAccountCommand } from "./account-wire";
import type { RemoteCommand, RemoteSnapshot } from "./protocol";
export type AccountRemoteDevice = {
  id: string;
  label: string;
  snapshot: RemoteSnapshot;
  seenAt: number;
};
type State = {
  ready: boolean;
  devices: AccountRemoteDevice[];
  selected: string | null;
  error: string | null;
};
let state: State = { ready: false, devices: [], selected: null, error: null };
const listeners = new Set<() => void>();
let channel: PrivateRemoteChannel | null = null;
let host: {
  label: string;
  snapshot: () => RemoteSnapshot;
  command: (command: RemoteCommand) => Promise<void>;
} | null = null;
const instance = crypto.randomUUID();
const seenCommands = new Set<string>();
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const emit = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};
const notifyFailure = (message: string) => emit({ error: message });
export function selectAccountRemote(id: string | null) {
  emit({ selected: id, error: null });
}
export function sendAccountRemote(command: RemoteCommand): boolean {
  const device = state.devices.find(
    (d) => d.id === state.selected && Date.now() - d.seenAt < 12000,
  );
  if (!state.ready || !device || !validAccountCommand(command)) return false;
  const id = crypto.randomUUID();
  const sent =
    channel?.send({
      kind: "command",
      from: instance,
      to: device.id,
      id,
      at: Date.now(),
      command,
    }) ?? false;
  if (sent)
    pending.set(
      id,
      setTimeout(() => {
        pending.delete(id);
        notifyFailure("The display did not confirm the command. Check its connection.");
      }, 4000),
    );
  return sent;
}
function announce() {
  if (host)
    channel?.send({
      kind: "device",
      from: instance,
      label: host.label,
      snapshot: accountRemoteSnapshot(host.snapshot()),
    });
}
function receive(value: unknown) {
  if (!value || typeof value !== "object") return;
  const packet = value as Record<string, unknown>;
  if (typeof packet.from !== "string" || packet.from === instance || packet.from.length > 100)
    return;
  if (packet.kind === "discover") {
    announce();
    return;
  }
  if (packet.kind === "device") {
    const snap = packet.snapshot as RemoteSnapshot;
    if (
      typeof packet.label !== "string" ||
      packet.label.length > 100 ||
      !snap ||
      typeof snap.idle !== "boolean" ||
      typeof snap.proto !== "number"
    )
      return;
    const device: AccountRemoteDevice = {
      id: packet.from,
      label: packet.label,
      snapshot: snap,
      seenAt: Date.now(),
    };
    emit({ devices: [...state.devices.filter((d) => d.id !== packet.from).slice(-49), device] });
    return;
  }
  if (packet.to !== instance) return;
  if (packet.kind === "ack" && typeof packet.id === "string") {
    clearTimeout(pending.get(packet.id));
    pending.delete(packet.id);
    if (packet.ok !== true) notifyFailure("The display could not perform that action.");
    else emit({ error: null });
    return;
  }
  if (
    packet.kind !== "command" ||
    !host ||
    typeof packet.id !== "string" ||
    packet.id.length > 100 ||
    typeof packet.at !== "number" ||
    Math.abs(Date.now() - packet.at) > 10000 ||
    !validAccountCommand(packet.command)
  )
    return;
  if (seenCommands.has(packet.id)) return;
  seenCommands.add(packet.id);
  if (seenCommands.size > 256) seenCommands.delete(seenCommands.values().next().value!);
  const command = packet.command,
    id = packet.id,
    to = packet.from;
  void host
    .command(command)
    .then(() => {
      channel?.send({ kind: "ack", from: instance, to, id, ok: true });
      announce();
    })
    .catch(() => channel?.send({ kind: "ack", from: instance, to, id, ok: false }));
}
export function useAccountRemote() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
    () => state,
  );
}
export function setAccountRemoteHost(value: typeof host) {
  host = value;
  announce();
  return () => {
    if (host === value) host = null;
  };
}
export function useAccountRemoteConnection() {
  const session = useJlSession(),
    owner = session?.userId ?? "";
  useEffect(() => {
    if (!owner) return;
    const context = jlAccountContext();
    if (!context) return;
    let live = true;
    const fresh = async () => {
      assertJlAccountCurrent(context);
      const next = await freshJlSession();
      assertJlAccountCurrent(context);
      return next;
    };
    channel = openPrivateRemoteChannel({
      url: import.meta.env.VITE_JL_SUPABASE_URL || "",
      publicKey: import.meta.env.VITE_JL_SUPABASE_ANON_KEY || "",
      userId: owner,
      fresh,
      receive: (value) => {
        if (live) {
          try {
            assertJlAccountCurrent(context);
            receive(value);
          } catch {
            /* Old identities cannot control a new workspace. */
          }
        }
      },
      status: (ready) => {
        if (live) {
          emit({ ready, error: ready ? null : "Connecting to your JL devices…" });
          if (ready) {
            channel?.send({ kind: "discover", from: instance });
            announce();
          }
        }
      },
    });
    const timer = setInterval(() => {
      emit({ devices: state.devices.filter((d) => Date.now() - d.seenAt < 12000) });
      announce();
    }, 3000);
    const wake = () => {
      if (document.visibilityState === "visible") channel?.reconnect();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      live = false;
      channel?.close();
      channel = null;
      host = null;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      seenCommands.clear();
      emit({ ready: false, devices: [], selected: null, error: null });
    };
  }, [owner]);
}
