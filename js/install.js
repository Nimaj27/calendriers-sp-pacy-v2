// ============================================================
// install.js — Invitation à installer l'application (PWA)
// Amicale SP Pacy-sur-Eure — Tournée Calendriers
// ============================================================

const CLE_INSTALL_REFUS = "sp_install_refuse";

// L'app tourne-t-elle déjà en mode installé ?
function dejaInstallee() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches
      || window.navigator.standalone === true;
}

function estIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Chrome/Android fournit un événement d'installation ; iOS non.
let _promptInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _promptInstall = e;
  proposerInstallation();
});

function refusEnregistre() {
  const v = localStorage.getItem(CLE_INSTALL_REFUS);
  if (!v) return false;
  // On ne represente la proposition qu'après 14 jours
  return (Date.now() - Number(v)) < 14 * 86400000;
}

function fermerBanniere(memoriser) {
  if (memoriser) localStorage.setItem(CLE_INSTALL_REFUS, String(Date.now()));
  document.getElementById('install-banniere')?.remove();
}

function proposerInstallation() {
  if (dejaInstallee() || refusEnregistre()) return;
  if (document.getElementById('install-banniere')) return;
  // Ni prompt Android disponible, ni iOS → rien à proposer
  if (!_promptInstall && !estIOS()) return;

  const el = document.createElement('div');
  el.id = 'install-banniere';
  el.className = 'install-banniere';
  el.innerHTML = estIOS() && !_promptInstall
    ? `<div class="ib-corps">
         <img src="./icons/icon-96.png" alt="" class="ib-icone">
         <div class="ib-txt">
           <strong>Installer l'application</strong>
           <span>Appuie sur <b>Partager</b> ⬆️ puis <b>Sur l'écran d'accueil</b></span>
         </div>
       </div>
       <button class="ib-fermer" data-action="plus-tard">Plus tard</button>`
    : `<div class="ib-corps">
         <img src="./icons/icon-96.png" alt="" class="ib-icone">
         <div class="ib-txt">
           <strong>Installer l'application</strong>
           <span>Accès direct depuis l'écran d'accueil, même hors réseau</span>
         </div>
       </div>
       <div class="ib-actions">
         <button class="ib-installer" data-action="installer">Installer</button>
         <button class="ib-fermer" data-action="plus-tard">Plus tard</button>
       </div>`;

  document.body.appendChild(el);

  el.addEventListener('click', async (ev) => {
    const act = ev.target.dataset?.action;
    if (act === 'plus-tard') { fermerBanniere(true); return; }
    if (act === 'installer' && _promptInstall) {
      const p = _promptInstall;
      _promptInstall = null;
      fermerBanniere(false);
      try {
        await p.prompt();
        const choix = await p.userChoice;
        if (choix.outcome !== 'accepted') localStorage.setItem(CLE_INSTALL_REFUS, String(Date.now()));
      } catch(e) { /* l'utilisateur a fermé la boîte système */ }
    }
  });
}

// Sur iOS, aucun événement : on propose après quelques secondes d'utilisation
if (estIOS() && !dejaInstallee()) {
  setTimeout(proposerInstallation, 4000);
}

// Confirmation d'installation réussie
window.addEventListener('appinstalled', () => {
  fermerBanniere(false);
  localStorage.removeItem(CLE_INSTALL_REFUS);
});
