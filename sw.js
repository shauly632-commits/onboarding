// Service worker מינימלי: מאפשר התקנה כאפליקציה; תמיד מעדיף רשת (הנתונים תמיד עדכניים).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => new Response('אין חיבור לאינטרנט. נסו שוב כשיש קליטה.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
});
