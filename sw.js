/* Verdauungstagebuch — Service Worker
   Aufgabe: index.html deterministisch offline verfügbar halten und Updates
   kontrolliert ausliefern. Keine Daten — die liegen in der IndexedDB und
   werden hier nie angefasst.

   BEI JEDEM UPDATE: VERSION hochziehen, identisch zu APP_VERSION in index.html.
   Nur eine geänderte sw.js löst beim Browser überhaupt ein Update aus.        */

const VERSION = '1.2.0';
const CACHE   = 'verdauung-' + VERSION;
const PAGE    = './index.html';

/* Installieren: index.html am HTTP-Cache vorbei holen und ablegen.
   Der Query-Parameter erzwingt eine frische Kopie vom Server.            */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const res = await fetch(new Request(PAGE + '?sw=' + VERSION, { cache: 'no-cache' }));
    if (!res || !res.ok) throw new Error('precache fehlgeschlagen: ' + (res && res.status));
    await c.put(PAGE, res);
    /* kein skipWaiting: die neue Version wartet, bis sie in der App bestätigt wird */
  })());
});

/* Aktivieren: alte Caches wegräumen, sofort die Kontrolle übernehmen. */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.indexOf('verdauung-') === 0 && k !== CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* Ausliefern: jeder Seitenaufruf kommt aus dem Cache — sofort und ohne Netz.
   Nur wenn der Cache leer ist, wird das Netz gefragt.                     */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('/index.html');
  if (!isPage) return;

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(PAGE);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) c.put(PAGE, res.clone());
      return res;
    } catch (err) {
      return new Response(
        '<!doctype html><meta charset="utf-8"><body style="font:16px -apple-system;padding:24px">' +
        '<h2>Offline und noch nichts im Cache</h2><p>Die App einmal mit Internetverbindung öffnen.</p>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
      );
    }
  })());
});

/* Die App bestätigt das Update — erst dann übernimmt die neue Version. */
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
