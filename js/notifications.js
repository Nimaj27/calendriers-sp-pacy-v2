// ============================================================
// notifications.js — Notifications locales (résumé quotidien)
// Amicale SP Pacy-sur-Eure — Tournée Calendriers
// ============================================================

import { statsGlobalesTournee } from "./tournee.js";

const CLE_DERNIER_RESUME = "sp_dernier_resume";
const CLE_HEURE_RESUME   = "sp_heure_resume";
const HEURE_DEFAUT       = 20; // 20h

// ── Support et permission ────────────────────────────────────────
function dateLocaleISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function notifsDisponibles() {
  return "Notification" in window;
}

export function notifsPermission() {
  if (!notifsDisponibles()) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}

export async function demanderPermissionNotifs() {
  if (!notifsDisponibles()) throw new Error("Notifications non supportées par ce navigateur");
  const perm = await Notification.requestPermission();
  return perm; // "granted" | "denied" | "default"
}

// ── Réglages (stockés localement par appareil) ──────────────────
export function getHeureResume() {
  const h = localStorage.getItem(CLE_HEURE_RESUME);
  return h !== null ? Number(h) : HEURE_DEFAUT;
}

export function setHeureResume(heure) {
  const h = Math.max(0, Math.min(23, Number(heure) || HEURE_DEFAUT));
  localStorage.setItem(CLE_HEURE_RESUME, String(h));
  return h;
}

export function resumeDejaEnvoyeAujourdhui() {
  const dernier = localStorage.getItem(CLE_DERNIER_RESUME);
  const aujourdhui = dateLocaleISO();
  return dernier === aujourdhui;
}

function marquerResumeEnvoye() {
  localStorage.setItem(CLE_DERNIER_RESUME, dateLocaleISO());
}

// ── Construction du texte du résumé ─────────────────────────────
// stats : retour de statsGlobalesTournee()
// passages : liste complète des passages
export function construireResume(stats, passages) {
  const aujourdhui = dateLocaleISO();
  const passagesDuJour = (passages || []).filter(p => (p.datePassage || "").slice(0, 10) === aujourdhui);

  let collecteDuJour = 0;
  let donsDuJour = 0;
  for (const p of passagesDuJour) {
    if (p.statut === "don") { collecteDuJour += Number(p.montant || 0); donsDuJour++; }
  }

  const fmt = (v) => Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 }) + " €";

  const lignes = [
    `Aujourd'hui : ${fmt(collecteDuJour)} (${donsDuJour} don${donsDuJour > 1 ? "s" : ""}, ${passagesDuJour.length} passage${passagesDuJour.length > 1 ? "s" : ""})`,
    `Cumul tournée : ${fmt(stats.totalCollecte)}`,
    `Avancement : ${stats.nbSecteursTermines}/${stats.nbSecteursTotal} secteurs (${stats.avancement}%)`
  ];

  // Top 3 équipes du jour
  const parEquipeJour = {};
  for (const p of passagesDuJour) {
    if (p.statut === "don" && p.equipeNom) {
      parEquipeJour[p.equipeNom] = (parEquipeJour[p.equipeNom] || 0) + Number(p.montant || 0);
    }
  }
  const top = Object.entries(parEquipeJour).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (top.length > 0) {
    lignes.push("Top du jour : " + top.map(([nom, m], i) => `${i + 1}. ${nom} ${fmt(m)}`).join(" · "));
  }

  return {
    titre: `Tournée calendriers — ${fmt(collecteDuJour)} aujourd'hui`,
    corps: lignes.join("\n"),
    collecteDuJour,
    donsDuJour,
    nbPassagesJour: passagesDuJour.length,
    lignes
  };
}

// ── Affiche la notification système ─────────────────────────────
export function afficherNotification(titre, corps, iconeBase64 = null) {
  if (!notifsDisponibles() || Notification.permission !== "granted") return false;
  try {
    const options = {
      body: corps,
      tag: "resume-quotidien-sp",   // remplace la précédente au lieu d'empiler
      requireInteraction: false,
      silent: false
    };
    if (iconeBase64) options.icon = iconeBase64;
    new Notification(titre, options);
    return true;
  } catch(e) {
    console.warn("Notification impossible :", e);
    return false;
  }
}

// ── Planificateur : vérifie toutes les minutes si l'heure est venue ──
// getDonnees : fonction async qui retourne { stats, passages }
// Retourne une fonction d'arrêt
export function planifierResumeQuotidien(getDonnees, iconeBase64 = null) {
  let arrete = false;

  async function verifier() {
    if (arrete) return;
    if (Notification.permission !== "granted") return;
    if (resumeDejaEnvoyeAujourdhui()) return;

    const maintenant = new Date();
    const heureCible = getHeureResume();

    // On déclenche dès qu'on atteint ou dépasse l'heure cible
    if (maintenant.getHours() >= heureCible) {
      try {
        const { stats, passages } = await getDonnees();
        const resume = construireResume(stats, passages);
        const ok = afficherNotification(resume.titre, resume.corps, iconeBase64);
        if (ok) marquerResumeEnvoye();
      } catch(e) {
        console.warn("Erreur résumé quotidien :", e);
      }
    }
  }

  // Vérification immédiate puis toutes les minutes
  verifier();
  const interval = setInterval(verifier, 60000);

  return () => { arrete = true; clearInterval(interval); };
}

// ── Envoi manuel du résumé (bouton "Tester / Envoyer maintenant") ──
export async function envoyerResumeMaintenant(getDonnees, iconeBase64 = null) {
  if (Notification.permission !== "granted") {
    const perm = await demanderPermissionNotifs();
    if (perm !== "granted") throw new Error("Permission refusée");
  }
  const { stats, passages } = await getDonnees();
  const resume = construireResume(stats, passages);
  const ok = afficherNotification(resume.titre, resume.corps, iconeBase64);
  if (!ok) throw new Error("Impossible d'afficher la notification");
  return resume;
}
