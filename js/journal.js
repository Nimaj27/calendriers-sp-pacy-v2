// ============================================================
// journal.js — Journal des modifications
// Amicale SP Pacy-sur-Eure — Tournée Calendriers
//
// Trace les corrections et suppressions de passages : qui, quoi, quand.
// Utile en cas d'écart constaté au moment des comptes.
// ============================================================

import { COLLECTIONS, fsAdd, fsGetAll, fsDelete } from "./firebase.js";

export const ACTIONS = {
  MODIFICATION: "modification",
  SUPPRESSION:  "suppression",
  FUSION:       "fusion",
  INHABITEE:    "inhabitee"
};

export const ACTION_LABEL = {
  modification: "Correction",
  suppression:  "Suppression",
  fusion:       "Regroupement",
  inhabitee:    "Marqué inhabité"
};

// Résumé lisible d'un passage, pour garder une trace de ce qui a été touché
function resumer(p) {
  if (!p) return "";
  const bouts = [];
  if (p.adresse) bouts.push(p.adresse);
  if (p.statut === "don")         bouts.push(`don ${Number(p.montant || 0).toFixed(2)} €`);
  else if (p.statut === "offert") bouts.push("offert");
  else if (p.statut === "refuse") bouts.push("refus");
  else if (p.statut === "absent" || p.statut === "relance") bouts.push("absent");
  if (p.modePaiement) bouts.push(p.modePaiement);
  return bouts.join(" · ");
}

// Enregistre une entrée. N'échoue jamais bruyamment : la traçabilité ne doit
// pas empêcher un équipier de travailler si l'écriture échoue.
export async function tracer(action, { avant = null, apres = null, contexte = "", auteur = null } = {}) {
  try {
    const a = auteur || {};
    await fsAdd(COLLECTIONS.JOURNAL, {
      action,
      date: new Date().toISOString(),
      parQui: a.membre || a.email || a.equipeNom || "inconnu",
      equipeNom: a.equipeNom || null,
      role: a.role || null,
      contexte,
      avant: avant ? resumer(avant) : null,
      apres: apres ? resumer(apres) : null,
      montantAvant: avant && avant.statut === "don" ? Number(avant.montant || 0) : 0,
      montantApres: apres && apres.statut === "don" ? Number(apres.montant || 0) : 0,
      secteurId: (apres && apres.secteurId) || (avant && avant.secteurId) || null
    });
  } catch (e) {
    console.warn("Journal indisponible :", e?.message || e);
  }
}

// Lecture, du plus récent au plus ancien
export async function lireJournal({ limite = 300 } = {}) {
  const tout = await fsGetAll(COLLECTIONS.JOURNAL);
  return tout
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, limite);
}

// Purge des entrées antérieures à une date (nettoyage de fin de saison)
export async function purgerJournal(avantISO) {
  const tout = await fsGetAll(COLLECTIONS.JOURNAL);
  let n = 0;
  for (const e of tout) {
    if ((e.date || "") < avantISO) { await fsDelete(COLLECTIONS.JOURNAL, e.id); n++; }
  }
  return n;
}

// Vide entièrement le journal
export async function viderJournal() {
  const tout = await fsGetAll(COLLECTIONS.JOURNAL);
  let n = 0;
  for (const e of tout) {
    try { await fsDelete(COLLECTIONS.JOURNAL, e.id); n++; } catch(err) { /* on continue */ }
  }
  return n;
}

// Écart financier cumulé induit par les corrections (indicateur de contrôle)
export function ecartCumule(entrees) {
  return entrees.reduce((s, e) => s + ((e.montantApres || 0) - (e.montantAvant || 0)), 0);
}
