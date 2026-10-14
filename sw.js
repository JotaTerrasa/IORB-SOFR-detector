const CACHE = "liquidity-shell-20261014-30";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20261014_30",
  "./app.js?v=20261014_30",
  "./lib/page-start.js",
  "./lib/analytics.js",
  "./lib/chart-range.js",
  "./lib/chart-preferences.js",
  "./lib/chart-format.js",
  "./lib/calendar-view.js",
  "./lib/calendar-data.js",
  "./lib/project-export.js",
  "./lib/desk-view.js",
  "./lib/desk-analytics.js",
  "./vendor/chart.umd.js?v=4.4.1",
  "./favicon.svg",
  "./icon.svg",
  "./manifest.webmanifest",
];
self.addEventListener("install", (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))),
      )
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (e) => {
  const r = e.request,
    u = new URL(r.url);
  // Never intercept data, non-GET requests or cross-origin traffic.
  if (
    r.method !== "GET" ||
    u.origin !== self.location.origin ||
    u.pathname.startsWith("/api/") ||
    u.pathname.endsWith("/sw.js")
  )
    return;
  e.respondWith(
    (async () => {
      // The chart library is pinned to an exact version and never contains market data.
      if (
        u.pathname.endsWith("/vendor/chart.umd.js") &&
        u.searchParams.get("v") === "4.4.1"
      ) {
        const cached = await caches.match(r);
        if (cached) return cached;
      }
      return fetch(r, { cache: "no-store" });
    })()
      .then((res) => {
        if (
          res.ok &&
          SHELL.some((p) => new URL(p, self.location).pathname === u.pathname)
        ) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(r, copy)));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(r);
        if (cached) return cached;
        if (r.mode === "navigate") return caches.match("./index.html");
        return new Response("Offline", { status: 503 });
      }),
  );
});
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
