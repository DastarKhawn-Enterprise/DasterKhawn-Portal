const CACHE = 'dastarkhwan-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Only intercept content-hashed static assets — never pages, API, or auth
  if (url.pathname.startsWith('/_next/static/') || url.pathname.match(/\.(js|css|woff2?|ttf|otf|svg|png|ico|webp)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // All other requests (pages, API, Clerk auth, server actions) pass through unhandled
});
