// Service worker: so Mimic can be installed as an app, and so a second visit loads fast. It keeps only
// things that never change at the same address: the pinned libraries on the CDNs (three@0.160, peerjs@1.5.4)
// and the photo textures and recorded sounds. The page and its scripts are never cached here (they version
// themselves; see tools/stamp.mjs).
const KEEP = 'mimic-static-v1';
const keep = (url) => /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\/.+@\d/.test(url) || /\/(textures|sounds)\/[^?]+\.(jpg|png|webp|mp3|ogg|wav)$/.test(url);
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (keep(e.request.url)) {
    e.respondWith(caches.open(KEEP).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  e.respondWith(fetch(e.request).catch(() => new Response('Mimic needs a connection.', { status: 503, headers: { 'Content-Type': 'text/plain' } })));
});
