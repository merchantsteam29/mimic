// Service worker: it's only here so Mimic can be installed as an app. It caches nothing (the page and
// its scripts already version themselves; see tools/stamp.mjs), it just passes requests through.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => new Response('Mimic needs a connection.', { status: 503, headers: { 'Content-Type': 'text/plain' } })));
});
