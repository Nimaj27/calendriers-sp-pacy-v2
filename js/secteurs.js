// secteurs.js — Gestion des secteurs géographiques
import { COLLECTIONS, fsAdd, fsSet, fsUpdate, fsDelete, fsGet, fsGetAll, fsQuery, fsListen, where } from "./firebase.js";
import { COLLECTIONS as C2 } from "./firebase.js";

export const STATUT_SECTEUR = { LIBRE:"libre", AFFECTE:"affecte", EN_COURS:"en_cours", TERMINE:"termine" };
export const STATUT_LABEL   = { libre:"Non affecté", affecte:"Affecté", en_cours:"En cours", termine:"Terminé" };

export async function creerSecteur({ nom, commune, description="", rues=[], couleur="#EF4444", objectifCalendriers=null }) {
  if (!nom || !commune) throw new Error("Nom et commune obligatoires");
  return fsAdd(COLLECTIONS.SECTEURS, { nom, commune, description, rues, couleur, objectifCalendriers, statut:STATUT_SECTEUR.LIBRE, equipeId:null, equipNom:null, totalCollecte:0, nbFoyersVisites:0, nbFoyersAbsents:0, nbFoyersTotal:0, dateDebut:null, dateFin:null });
}
export async function mettreAJourSecteur(id, data) { return fsUpdate(COLLECTIONS.SECTEURS, id, data); }
export async function supprimerSecteur(id) { return fsDelete(COLLECTIONS.SECTEURS, id); }
export async function affecterEquipe(secteurId, equipeId, equipeNom) {
  return fsUpdate(COLLECTIONS.SECTEURS, secteurId, { equipeId, equipNom: equipeNom, statut: STATUT_SECTEUR.AFFECTE });
}
export async function desaffecterEquipe(secteurId) {
  return fsUpdate(COLLECTIONS.SECTEURS, secteurId, { equipeId: null, equipNom: null, statut: STATUT_SECTEUR.LIBRE });
}
export async function cloturerSecteur(id) { return fsUpdate(COLLECTIONS.SECTEURS, id, { statut: STATUT_SECTEUR.TERMINE, dateFin: new Date().toISOString() }); }
export async function demarrerSecteur(id) { return fsUpdate(COLLECTIONS.SECTEURS, id, { statut: STATUT_SECTEUR.EN_COURS, dateDebut: new Date().toISOString() }); }
export async function lireSecteurs() { return fsGetAll(COLLECTIONS.SECTEURS); }
export async function secteursParEquipe(equipeId) {
  return fsQuery(COLLECTIONS.SECTEURS, where("equipeId", "==", equipeId));
}
export async function lireSecteur(id) { return fsGet(COLLECTIONS.SECTEURS, id); }
export function ecouterSecteurs(callback) {
  return fsListen(COLLECTIONS.SECTEURS, (secteurs) => {
    secteurs.sort((a, b) => (a.commune + a.nom).localeCompare(b.commune + b.nom));
    callback(secteurs);
  });
}
export function ecouterSecteursEquipe(equipeId, callback) {
  return fsListen(COLLECTIONS.SECTEURS, callback, where("equipeId", "==", equipeId));
}
export async function recalculerTotauxSecteur(secteurId) {
  const passages = await fsQuery(COLLECTIONS.PASSAGES, where("secteurId", "==", secteurId));
  let totalCollecte=0, nbFoyersVisites=0, nbFoyersAbsents=0, nbCalendriers=0;
  for (const p of passages) {
    // Boîtes "traitées" : don, offert et refus (l'absent reste à revoir)
    if (p.statut==="don")    { totalCollecte += Number(p.montant||0); nbFoyersVisites++; nbCalendriers++; }
    if (p.statut==="offert") { nbFoyersVisites++; nbCalendriers++; }
    if (p.statut==="refuse") { nbFoyersVisites++; }
    if (p.statut==="absent" || p.statut==="relance") { nbFoyersAbsents++; }
  }
  const totaux = { totalCollecte, nbFoyersVisites, nbFoyersAbsents, nbCalendriers, nbFoyersTotal: passages.length };
  await fsUpdate(COLLECTIONS.SECTEURS, secteurId, totaux);
  return totaux;
}
export async function statsGlobales() {
  const secteurs = await lireSecteurs();
  return {
    total: secteurs.length,
    libre: secteurs.filter(s=>s.statut===STATUT_SECTEUR.LIBRE).length,
    affecte: secteurs.filter(s=>s.statut===STATUT_SECTEUR.AFFECTE).length,
    en_cours: secteurs.filter(s=>s.statut===STATUT_SECTEUR.EN_COURS).length,
    termine: secteurs.filter(s=>s.statut===STATUT_SECTEUR.TERMINE).length,
    totalCollecte: secteurs.reduce((sum, s) => sum + (s.totalCollecte||0), 0)
  };
}

// ── Compléments d'adresses par rue (lieux-dits, BAN incomplète) ──
// Stockés dans le secteur : partagés entre équipiers et conservés d'une année sur l'autre
// Format : { "nom de rue normalisé": ["12", "12bis", "Ferme"] }

function normRue(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export async function ajouterComplements(secteurId, rue, numeros) {
  const secteur = await fsGet(COLLECTIONS.SECTEURS, secteurId);
  if (!secteur) throw new Error("Secteur introuvable");
  const comp = secteur.ruesComplements || {};
  const clef = normRue(rue);
  const actuels = comp[clef] || [];
  let ajoutes = 0;
  for (const n of numeros) {
    const v = String(n).trim();
    if (v && !actuels.includes(v)) { actuels.push(v); ajoutes++; }
  }
  comp[clef] = actuels;
  await fsUpdate(COLLECTIONS.SECTEURS, secteurId, { ruesComplements: comp });
  return ajoutes;
}

export async function retirerComplement(secteurId, rue, numero) {
  const secteur = await fsGet(COLLECTIONS.SECTEURS, secteurId);
  if (!secteur) throw new Error("Secteur introuvable");
  const comp = secteur.ruesComplements || {};
  const clef = normRue(rue);
  comp[clef] = (comp[clef] || []).filter(x => x !== String(numero));
  if (comp[clef].length === 0) delete comp[clef];
  await fsUpdate(COLLECTIONS.SECTEURS, secteurId, { ruesComplements: comp });
}

// Lit les compléments d'une rue depuis un objet secteur déjà chargé
export function lireComplements(secteur, rue) {
  if (!secteur || !secteur.ruesComplements) return [];
  return secteur.ruesComplements[normRue(rue)] || [];
}

// ── Fusions d'adresses (une seule boîte pour plusieurs adresses) ──
// Format : [{ principale: "11 Rue du Moulin", secondaires: ["13 Rue du Moulin", "2 Rue des Soupirs"] }]
// Définitives : conservées d'une tournée à l'autre.

export async function fusionnerAdresses(secteurId, principale, secondaires) {
  const secteur = await fsGet(COLLECTIONS.SECTEURS, secteurId);
  if (!secteur) throw new Error("Secteur introuvable");
  const fusions = secteur.fusions || [];

  const norm = s => (s||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');

  // Retirer ces adresses d'éventuelles fusions existantes
  const toutes = [principale, ...secondaires].map(norm);
  let nettoyees = fusions
    .filter(f => !toutes.includes(norm(f.principale)))
    .map(f => ({
      ...f,
      secondaires: (f.secondaires||[]).filter(s => !toutes.includes(norm(s)))
    }))
    .filter(f => f.secondaires.length > 0);

  nettoyees.push({ principale, secondaires: [...new Set(secondaires)] });
  await fsUpdate(COLLECTIONS.SECTEURS, secteurId, { fusions: nettoyees });
  return nettoyees.length;
}

export async function annulerFusion(secteurId, principale) {
  const secteur = await fsGet(COLLECTIONS.SECTEURS, secteurId);
  if (!secteur) throw new Error("Secteur introuvable");
  const norm = s => (s||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const fusions = (secteur.fusions || []).filter(f => norm(f.principale) !== norm(principale));
  await fsUpdate(COLLECTIONS.SECTEURS, secteurId, { fusions });
}

// Renvoie la liste plate de toutes les adresses secondaires (à masquer des grilles)
export function adressesSecondaires(secteur) {
  if (!secteur || !secteur.fusions) return [];
  return secteur.fusions.flatMap(f => f.secondaires || []);
}

// Trouve la fusion dont fait partie une adresse (comme principale ou secondaire)
export function trouverFusion(secteur, adresse) {
  if (!secteur || !secteur.fusions) return null;
  const norm = s => (s||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const a = norm(adresse);
  return secteur.fusions.find(f =>
    norm(f.principale) === a || (f.secondaires||[]).some(s => norm(s) === a)) || null;
}

// ── Adresses marquées inhabitées (retirées du décompte, définitif) ──
export async function marquerInhabitee(secteurId, adresse, inhabitee = true) {
  const secteur = await fsGet(COLLECTIONS.SECTEURS, secteurId);
  if (!secteur) throw new Error("Secteur introuvable");
  const norm = s => (s||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  let liste = secteur.inhabitees || [];
  if (inhabitee) {
    if (!liste.some(x => norm(x) === norm(adresse))) liste.push(adresse);
  } else {
    liste = liste.filter(x => norm(x) !== norm(adresse));
  }
  await fsUpdate(COLLECTIONS.SECTEURS, secteurId, { inhabitees: liste });
}

export function estInhabitee(secteur, adresse) {
  if (!secteur || !secteur.inhabitees) return false;
  const norm = s => (s||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  return secteur.inhabitees.some(x => norm(x) === norm(adresse));
}

// ── Notes persistantes par adresse ──────────────────────────────
// Conservées d'une tournée à l'autre : "chien méchant", "sonner fort", etc.
// Stockées dans le secteur : { "adresse normalisée": { texte, adresse, maj } }

export async function enregistrerNoteAdresse(secteurId, adresse, texte) {
  const secteur = await fsGet(COLLECTIONS.SECTEURS, secteurId);
  if (!secteur) throw new Error("Secteur introuvable");
  const notes = secteur.notesAdresses || {};
  const clef = normRue(adresse);
  if (texte && texte.trim()) {
    notes[clef] = { texte: texte.trim(), adresse, maj: new Date().toISOString() };
  } else {
    delete notes[clef];
  }
  await fsUpdate(COLLECTIONS.SECTEURS, secteurId, { notesAdresses: notes });
}

export function lireNoteAdresse(secteur, adresse) {
  if (!secteur || !secteur.notesAdresses) return null;
  return secteur.notesAdresses[normRue(adresse)] || null;
}

export function toutesLesNotes(secteur) {
  if (!secteur || !secteur.notesAdresses) return [];
  return Object.values(secteur.notesAdresses)
    .sort((a, b) => (a.adresse || '').localeCompare(b.adresse || '', 'fr'));
}

// ── Suivi des remises au trésorier ──────────────────────────────
// Enregistré au niveau de l'équipe : liste des remises effectuées

export async function enregistrerRemise(equipeId, { montantEspeces = 0, montantCheques = 0, note = "", parQui = "" }) {
  const equipe = await fsGet(COLLECTIONS.EQUIPES, equipeId);
  if (!equipe) throw new Error("Équipe introuvable");
  const remises = equipe.remises || [];
  remises.push({
    id: `r${Date.now()}`,
    date: new Date().toISOString(),
    especes: Number(montantEspeces) || 0,
    cheques: Number(montantCheques) || 0,
    total: (Number(montantEspeces) || 0) + (Number(montantCheques) || 0),
    note, parQui
  });
  await fsUpdate(COLLECTIONS.EQUIPES, equipeId, { remises });
  return remises;
}

export async function supprimerRemise(equipeId, remiseId) {
  const equipe = await fsGet(COLLECTIONS.EQUIPES, equipeId);
  if (!equipe) throw new Error("Équipe introuvable");
  const remises = (equipe.remises || []).filter(r => r.id !== remiseId);
  await fsUpdate(COLLECTIONS.EQUIPES, equipeId, { remises });
}

export function totalRemis(equipe) {
  return (equipe?.remises || []).reduce((s, r) => s + (Number(r.total) || 0), 0);
}
