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

  const path = url.pathname;

  // Cache-first for Next.js static chunks (content-hashed) and static assets
  if (path.startsWith('/_next/static/') || path.match(/\.(js|css|woff2?|ttf|otf|svg|png|ico|webp)$/)) {
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

  // Network-first for everything else (pages, API calls)
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
