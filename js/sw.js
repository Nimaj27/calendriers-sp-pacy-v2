// ============================================================
// Service Worker — V3 production
// Amicale SP Pacy-sur-Eure — Tournée Calendriers
// ============================================================

const VERSION       = "v3-2";
const CACHE_APP     = `sp-app-${VERSION}`;
const CACHE_STATIC  = "sp-static-1";
const CACHE_RUNTIME = "sp-runtime-v1";
const PREFIXES_APP  = ["sp-app-", "sp-static-", "sp-runtime-"];

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

// Ces fichiers sont indispensables au démarrage. Si l'un d'eux manque,
// l'installation du nouveau SW échoue plutôt que d'activer une PWA cassée.
const APPLICATIFS_ESSENTIELS = [
  "./index.html", "./css/style.css", "./js/app.js", "./js/firebase.js",
  "./js/secteurs.js", "./js/tournee.js", "./js/historique.js"
];

async function ajouterSiAbsent(cache, url) {
  const deja = await cache.match(url);
  if (!deja) await cache.add(url);
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const [cs, ca] = await Promise.all([caches.open(CACHE_STATIC), caches.open(CACHE_APP)]);

    // Données lourdes et stables : ne sont téléchargées que si absentes du cache partagé.
    await Promise.all(STATIQUES.map(u => ajouterSiAbsent(cs, u)));

    // Les ressources indispensables doivent toutes être présentes.
    await Promise.all(APPLICATIFS_ESSENTIELS.map(u => ca.add(u)));

    // Les extras n'empêchent pas une mise à jour de s'installer.
    const extras = APPLICATIFS.filter(u => !APPLICATIFS_ESSENTIELS.includes(u));
    await Promise.allSettled(extras.map(u => ca.add(u)));
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVER_MAINTENANT") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cles = await caches.keys();
    // Ne jamais supprimer les caches d'autres PWA hébergées sur la même origine.
    await Promise.all(cles
      .filter(k => PREFIXES_APP.some(p => k.startsWith(p)))
      .filter(k => ![CACHE_APP, CACHE_STATIC, CACHE_RUNTIME].includes(k))
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function estApiReseau(url) {
  return ["tile.openstreetmap.org", "geopf.fr", "geo.api.gouv.fr"]
    .some(d => url.hostname.includes(d));
}

function estBibliothequeCacheable(url) {
  return ["gstatic.com", "googleapis.com", "jsdelivr.net", "cdnjs.cloudflare.com"]
    .some(d => url.hostname.includes(d));
}

async function cacheRuntime(request, strategie = "network-first") {
  const cache = await caches.open(CACHE_RUNTIME);
  if (strategie === "cache-first") {
    const rep = await cache.match(request);
    if (rep) return rep;
    const net = await fetch(request);
    if (net && (net.ok || net.type === "opaque")) await cache.put(request, net.clone());
    return net;
  }

  try {
    const net = await fetch(request);
    if (net && (net.ok || net.type === "opaque")) await cache.put(request, net.clone());
    return net;
  } catch (e) {
    const rep = await cache.match(request);
    if (rep) return rep;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // APIs/cartes : réseau uniquement, elles n'empêchent pas le cœur de l'app de fonctionner hors-ligne.
  if (estApiReseau(url)) return;

  // SDK Firebase et bibliothèques externes : on conserve une copie après usage
  // afin de pouvoir redémarrer l'app sans réseau après une première utilisation en ligne.
  if (url.origin !== self.location.origin && estBibliothequeCacheable(url)) {
    const firebase = url.hostname.includes("gstatic.com") && url.pathname.includes("/firebasejs/");
    event.respondWith(cacheRuntime(event.request, firebase ? "network-first" : "cache-first"));
    return;
  }

  if (url.origin !== self.location.origin) return;

  const estStatique = STATIQUES.some(s => url.pathname.endsWith(s.replace("./", "")));
  if (estStatique) {
    event.respondWith((async () => {
      const rep = await caches.match(event.request);
      if (rep) return rep;
      const net = await fetch(event.request);
      if (net?.ok) {
        const c = await caches.open(CACHE_STATIC);
        await c.put(event.request, net.clone());
      }
      return net;
    })());
    return;
  }

  // Navigation : réseau d'abord, page d'accueil hors-ligne en dernier recours.
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const net = await fetch(event.request);
        if (net?.ok) {
          const c = await caches.open(CACHE_APP);
          await c.put(event.request, net.clone());
        }
        return net;
      } catch (e) {
        return (await caches.match(event.request)) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  // JS/CSS/images locales : réseau d'abord, cache en secours. Aucun fallback HTML
  // n'est renvoyé à la place d'un module JavaScript.
  event.respondWith((async () => {
    try {
      const net = await fetch(event.request);
      if (net?.ok) {
        const c = await caches.open(CACHE_APP);
        await c.put(event.request, net.clone());
      }
      return net;
    } catch (e) {
      const rep = await caches.match(event.request);
      if (rep) return rep;
      throw e;
    }
  })());
});
