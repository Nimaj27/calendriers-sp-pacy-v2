// ============================================================
// maj.js — Détection et application des mises à jour
// Amicale SP Pacy-sur-Eure — Tournée Calendriers
// ============================================================

let _registration = null;
let _banniereAffichee = false;

// Affiche le bandeau proposant de recharger
function proposerMiseAJour(worker) {
  if (_banniereAffichee) return;
  _banniereAffichee = true;

  const el = document.createElement('div');
  el.id = 'maj-banniere';
  el.className = 'maj-banniere';
  el.innerHTML = `
    <span class="mj-txt">✨ <strong>Nouvelle version disponible</strong></span>
    <div class="mj-actions">
      <button class="mj-recharger">Mettre à jour</button>
      <button class="mj-plus-tard">Plus tard</button>
    </div>`;
  document.body.appendChild(el);

  el.querySelector('.mj-recharger').addEventListener('click', () => {
    el.querySelector('.mj-recharger').textContent = 'Mise à jour…';
    // Demander au nouveau Service Worker de prendre la main immédiatement
    if (worker) worker.postMessage({ type: 'ACTIVER_MAINTENANT' });
    // Sécurité : recharger même si le message n'aboutit pas
    setTimeout(() => window.location.reload(), 1200);
  });

  el.querySelector('.mj-plus-tard').addEventListener('click', () => {
    el.remove();
    _banniereAffichee = false;
  });
}

// Surveille l'arrivée d'une nouvelle version
export function surveillerMiseAJour(registration) {
  if (!registration) return;
  _registration = registration;

  // Une nouvelle version est déjà installée et attend
  if (registration.waiting && navigator.serviceWorker.controller) {
    proposerMiseAJour(registration.waiting);
  }

  // Une nouvelle version arrive pendant la session
  registration.addEventListener('updatefound', () => {});
  registration.onupdatefound = () => {
    const nouveau = registration.installing;
    if (!nouveau) return;
    nouveau.addEventListener('statechange', () => {
      if (nouveau.state === 'installed' && navigator.serviceWorker.controller) {
        proposerMiseAJour(nouveau);
      }
    });
  };

  // Vérifier périodiquement (toutes les 30 min) et au retour au premier plan
  const verifier = () => { registration.update().catch(() => {}); };
  setInterval(verifier, 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verifier();
  });
}

// Recharger la page dès que le nouveau Service Worker prend le contrôle
let _rechargeFaite = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_rechargeFaite) return;
    _rechargeFaite = true;
    window.location.reload();
  });
}

// Exposition pour le script d'enregistrement (hors module ES)
window.__surveillerMAJ = surveillerMiseAJour;
