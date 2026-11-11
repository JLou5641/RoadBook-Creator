// Fonctionne hors ligne : la page est servie depuis le cache, et mise à jour dès qu'une nouvelle version est en ligne
const C = 'rbgen-111110h50';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'].concat(["./manuel/","./manuel/index.html","./manuel/img/03_mode_dessin.jpg","./manuel/img/05_generation_en_cours.jpg","./manuel/img/06_rapport.jpg","./manuel/img/08_barre_outils.jpg","./manuel/img/09_menu_plus.jpg","./manuel/img/10_couches.jpg","./manuel/img/11_editeur_note_note.jpg","./manuel/img/12_editeur_note_dessin.jpg","./manuel/img/15_editeur_tulipe.jpg","./manuel/img/17_etapes.jpg","./manuel/img/18_mesure_cap.jpg","./manuel/img/19_altitude.jpg","./manuel/img/20_marqueurs.jpg","./manuel/img/30_generation_deux_sources.jpg","./manuel/img/32_liste_notes.jpg","./manuel/img/33_waypoint_wpm.jpg","./manuel/img/34_waypoint_dt.jpg","./manuel/img/35_waypoint_dss.jpg","./manuel/img/36_zone_dz.jpg","./manuel/img/38_controle_resultat.jpg","./manuel/img/39_controle_comparaison.jpg","./manuel/img/40_street_view.jpg","./manuel/img/41_theme_nuit.jpg","./manuel/img/42_ecran_principal.jpg"]);
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // cartes et serveurs IGN : jamais interceptés
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)); } return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
