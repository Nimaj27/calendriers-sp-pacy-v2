// ============================================================
// Service Worker — version modulaire
// Amicale SP Pacy-sur-Eure — Tournée Calendriers
// ============================================================

const VERSION      = "v2-2";
const CACHE_APP    = `sp-app-${VERSION}`;      // code : renouvelé à chaque version
const CACHE_STATIC = "sp-static-1";            // données stables : conservé entre versions

// Modules volumineux qui ne changent quasiment jamais.
// Ils vivent dans un cache séparé : une mise à jour du code ne force pas
// leur retéléchargement (près de 320 Ko économisés à chaque publication).
const STATIQUES = [
  "./js/geoloc.js",
  "./js/carte.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/icon-180.png",
  "./icons/icon-96.png",
  "./icons/favicon-32.png"
];

// Code applicatif, renouvelé à chaque publication
const APPLICATIFS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/firebase.js",
  "./js/secteurs.js",
  "./js/tournee.js",
  "./js/historique.js",
  "./js/gamification.js",
  "./js/pdf.js",
  "./js/vocal.js",
  "./js/journal.js",
  "./js/notifications.js",
  "./js/install.js",
  "./js/maj.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const [cs, ca] = await Promise.all([caches.open(CACHE_STATIC), caches.open(CACHE_APP)]);
    // allSettled : un fichier manquant ne fait pas échouer toute l'installation
    await Promise.allSettled(STATIQUES.map(u => cs.add(u)));
    await Promise.allSettled(APPLICATIFS.map(u => ca.add(u)));
  })());
  // Pas de skipWaiting : la nouvelle version attend l'accord de l'utilisateur
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ACTIVER_MAINTENANT") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(cles => Promise.all(
      cles.filter(k => k !== CACHE_APP && k !== CACHE_STATIC).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Domaines toujours servis par le réseau
function externe(url) {
  return ["firebase", "gstatic", "google", "tile.openstreetmap",
          "geopf", "jsdelivr", "cdnjs", "geo.api.gouv"]
    .some(d => url.hostname.includes(d));
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (externe(url)) return;

  const estStatique = STATIQUES.some(s => url.pathname.endsWith(s.replace("./", "")));

  if (estStatique) {
    // Cache d'abord : ces fichiers ne changent pas, inutile d'interroger le réseau
    event.respondWith(
      caches.match(event.request).then(rep => rep || fetch(event.request).then(r => {
        if (r && r.status === 200) {
          const copie = r.clone();
          caches.open(CACHE_STATIC).then(c => c.put(event.request, copie)).catch(()=>{});
        }
        return r;
      }))
    );
    return;
  }

  // Réseau d'abord, cache en secours : garantit le mode hors-ligne
  event.respondWith(
    fetch(event.request)
      .then(rep => {
        if (rep && rep.status === 200) {
          const copie = rep.clone();
          caches.open(CACHE_APP).then(c => c.put(event.request, copie)).catch(()=>{});
        }
        return rep;
      })
      .catch(() => caches.match(event.request)
        .then(r => r || caches.match("./index.html")))
  );
});
