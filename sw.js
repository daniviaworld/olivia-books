// Service worker: la app abre sin conexión. Los datos los guarda Firestore en caché.
const V = 'olivia-books-v3';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'util.js', 'export.js', 'firebase-config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon.svg'];

self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET') return;
  const sameOrigin = u.origin === location.origin;
  const staticLib = /gstatic\.com\/firebasejs|cdn\.jsdelivr\.net/.test(u.host + u.pathname);
  if (!sameOrigin && !staticLib) return; // Firestore/Auth van directos a la red
  // Red primero (siempre la versión nueva si hay conexión) y caché como respaldo
  e.respondWith(fetch(r).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(V).then(c => c.put(r, copy)); }
    return res;
  }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
