import type { JlSession } from "@/lib/jl/account/session-client";
export type PrivateRemoteChannel = {
  send: (value: unknown) => boolean;
  close: () => void;
  reconnect: () => void;
};
/** Minimal documented Phoenix v1 channel. No offline command queue: old inputs must never replay. */
export function openPrivateRemoteChannel(options: {
  url: string;
  publicKey: string;
  userId: string;
  fresh: () => Promise<JlSession | null>;
  receive: (value: unknown) => void;
  status: (ready: boolean) => void;
  createSocket?: (url: string) => WebSocket;
}): PrivateRemoteChannel {
  let socket: WebSocket | null = null,
    stopped = false,
    ready = false,
    ref = 0,
    retry = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let joinTimer: ReturnType<typeof setTimeout> | undefined;
  let joinRef = "",
    pendingHeartbeat = "",
    generation = 0;
  const topic = "realtime:jl-remote:" + options.userId;
  const create = options.createSocket ?? ((url) => new WebSocket(url));
  const current = (ws: WebSocket) => !stopped && socket === ws;
  const frame = (ws: WebSocket, event: string, payload: unknown, channel = topic) => {
    const id = String(++ref);
    ws.send(
      JSON.stringify({
        topic: channel,
        event,
        payload,
        ref: id,
        join_ref: channel === topic ? joinRef : undefined,
      }),
    );
    return id;
  };
  const clear = () => {
    clearInterval(heartbeat);
    clearTimeout(joinTimer);
    heartbeat = undefined;
    joinTimer = undefined;
  };
  const connect = async () => {
    if (stopped) return;
    const attempt = ++generation;
    try {
      const session = await options.fresh();
      if (stopped || attempt !== generation || session?.userId !== options.userId) return;
      const url = new URL(options.url);
      url.protocol = "wss:";
      url.pathname = "/realtime/v1/websocket";
      url.search = "";
      url.searchParams.set("apikey", options.publicKey);
      url.searchParams.set("vsn", "1.0.0");
      const ws = create(url.href);
      socket = ws;
      ws.onopen = () => {
        if (!current(ws)) return;
        joinRef = String(ref + 1);
        frame(ws, "phx_join", {
          config: {
            private: true,
            broadcast: { ack: false, self: false },
            presence: { enabled: false },
          },
          access_token: session.accessToken,
        });
        joinTimer = setTimeout(() => {
          if (current(ws) && !ready) ws.close();
        }, 10000);
        heartbeat = setInterval(() => {
          if (!current(ws)) return;
          if (pendingHeartbeat) {
            ws.close();
            return;
          }
          pendingHeartbeat = frame(ws, "heartbeat", {}, "phoenix");
          void options
            .fresh()
            .then((next) => {
              if (!current(ws)) return;
              if (next?.userId !== options.userId) {
                ws.close();
                return;
              }
              frame(ws, "access_token", { access_token: next.accessToken });
            })
            .catch(() => ws.close());
        }, 20000);
      };
      ws.onmessage = (event) => {
        if (!current(ws) || String(event.data).length > 128000) return;
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.topic === "phoenix" && msg.ref === pendingHeartbeat) {
            pendingHeartbeat = "";
            return;
          }
          if (msg.topic !== topic) return;
          if (msg.event === "phx_reply" && msg.ref === joinRef) {
            if (msg.payload?.status !== "ok") {
              ws.close();
              return;
            }
            clearTimeout(joinTimer);
            ready = true;
            retry = 0;
            options.status(true);
            return;
          }
          if (msg.event === "phx_error" || msg.event === "phx_close") {
            ws.close();
            return;
          }
          if (ready && msg.event === "broadcast" && msg.payload?.event === "jl-remote")
            options.receive(msg.payload.payload);
        } catch {
          /* Malformed frames never become commands. */
        }
      };
      ws.onerror = () => {
        if (current(ws)) ws.close();
      };
      ws.onclose = () => {
        if (!current(ws)) return;
        clear();
        socket = null;
        ready = false;
        pendingHeartbeat = "";
        options.status(false);
        timer = setTimeout(() => void connect(), Math.min(8000, 500 * 2 ** retry++));
      };
    } catch {
      if (!stopped && attempt === generation) {
        options.status(false);
        timer = setTimeout(() => void connect(), 3000);
      }
    }
  };
  void connect();
  return {
    send(value) {
      if (!ready || !socket || socket.readyState !== 1) return false;
      try {
        frame(socket, "broadcast", { type: "broadcast", event: "jl-remote", payload: value });
        return true;
      } catch {
        return false;
      }
    },
    reconnect() {
      if (stopped) return;
      generation++;
      clear();
      clearTimeout(timer);
      const ws = socket;
      socket = null;
      ready = false;
      pendingHeartbeat = "";
      ws?.close();
      options.status(false);
      void connect();
    },
    close() {
      stopped = true;
      generation++;
      clear();
      clearTimeout(timer);
      ready = false;
      const ws = socket;
      socket = null;
      ws?.close();
      options.status(false);
    },
  };
}
