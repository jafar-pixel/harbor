/**
 * A one-time timing report for the Sports Hub, written to the console (on the TV app it lands in
 * adb logcat as "[sports-perf]"): how long until the first games showed, how many requests it
 * took and to which hosts, the slowest ones, and how long the main thread was blocked. Evidence
 * for making the hub faster, gathered without developer tools.
 */

let startedAt = 0;
let reported = false;
let blockedMs = 0;
let longTasks = 0;
let observer: PerformanceObserver | null = null;

/** The hub opened: start timing (only the first time in a session). */
export function hubPerfStart(): void {
  if (startedAt || typeof performance === "undefined") return;
  startedAt = performance.now();
  try {
    observer = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        longTasks += 1;
        blockedMs += e.duration;
      }
    });
    observer.observe({ type: "longtask", buffered: false });
  } catch {
    observer = null;
  }
}

/** The first games are on screen: report once. */
export function hubPerfShown(games: number): void {
  if (!startedAt || reported || typeof performance === "undefined") return;
  reported = true;
  const now = performance.now();
  observer?.disconnect();
  const requests = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter(
    (r) => r.startTime >= startedAt,
  );
  const byHost = new Map<string, { n: number; ms: number }>();
  for (const r of requests) {
    let host = "?";
    try {
      host = new URL(r.name).host;
    } catch {
      /* keep "?" */
    }
    const h = byHost.get(host) ?? { n: 0, ms: 0 };
    h.n += 1;
    h.ms += r.duration;
    byHost.set(host, h);
  }
  const hosts = [...byHost.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 8)
    .map(([h, v]) => `${h} x${v.n} (${Math.round(v.ms)}ms)`)
    .join(", ");
  const slowest = [...requests]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .map((r) => {
      let label = r.name;
      try {
        const u = new URL(r.name);
        label = u.host + u.pathname.slice(0, 60);
      } catch {
        /* the raw name */
      }
      return `${label} ${Math.round(r.duration)}ms`;
    })
    .join(" | ");
  console.info(
    `[sports-perf] ${games} games shown after ${Math.round(now - startedAt)}ms; ` +
      `${requests.length} requests; main thread blocked ${Math.round(blockedMs)}ms in ${longTasks} long tasks`,
  );
  console.info(`[sports-perf] hosts: ${hosts}`);
  console.info(`[sports-perf] slowest: ${slowest}`);
}
