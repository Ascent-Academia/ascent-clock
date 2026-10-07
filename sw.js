/* Offline support: network first, falling back to the cached copy so the
 * clock keeps working if the exam room loses Wi-Fi. */
const CACHE_PREFIX = "ascent-clock-";
const CACHE = `${CACHE_PREFIX}v5`;
const ASSETS = ["./", "index.html", "styles.css", "app.js", "icon.svg", "favicon-32.png", "favicon-16.png", "manifest.webmanifest", "fonts/manrope-latin-var.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  const cached = () => caches.match(e.request, { cacheName: CACHE, ignoreSearch: true });
  e.respondWith(
    fetch(e.request)
      .then(async (res) => {
        // A temporary server error must not replace a working offline asset.
        if (!res.ok) return (await cached()) || res;
        const copy = res.clone();
        // Keep the worker alive until storage finishes, without turning a cache
        // quota failure into a failed network response.
        e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}));
        return res;
      })
      .catch(async () => (await cached()) || Response.error())
  );
});
