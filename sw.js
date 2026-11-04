// Fonctionne hors ligne : la page est servie depuis le cache, et mise à jour dès qu'une nouvelle version est en ligne
const C = 'rbgen-041113h50';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // cartes et serveurs IGN : jamais interceptés
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)); } return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
