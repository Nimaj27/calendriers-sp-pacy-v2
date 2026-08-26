// historique.js — Historique multi-années
import { COLLECTIONS, fsSet, fsGet, fsGetAll, fsDelete, db, writeBatch } from "./firebase.js";
import { collection, doc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { lireSecteurs } from "./secteurs.js";
import { lireEquipes, statsGlobalesTournee } from "./tournee.js";

const COLLECTION_HISTORIQUE = "historique_saisons";
const SOUS_COLLECTION_ADRESSES = "adresses_chunks";
const TAILLE_CHUNK_ADRESSES = 300;
const TAILLE_BATCH_SUPPRESSION = 400; // marge sous la limite Firestore de 500 opérations

// Normalisation d'adresse, commune à l'archivage et à la consultation
export function normAdresse(s) {
  return (s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

async function supprimerRefsParLots(refs) {
  let supprimes = 0;
  for (let i = 0; i < refs.length; i += TAILLE_BATCH_SUPPRESSION) {
    const batch = writeBatch(db);
    const lot = refs.slice(i, i + TAILLE_BATCH_SUPPRESSION);
    lot.forEach(ref => batch.delete(ref));
    await batch.commit();
    supprimes += lot.length;
  }
  return supprimes;
}

async function supprimerChunksAdresse(annee) {
  const snap = await getDocs(collection(db, COLLECTION_HISTORIQUE, String(annee), SOUS_COLLECTION_ADRESSES));
  return supprimerRefsParLots(snap.docs.map(d => d.ref));
}

async function lireChunksAdresse(annee) {
  const snap = await getDocs(collection(db, COLLECTION_HISTORIQUE, String(annee), SOUS_COLLECTION_ADRESSES));
  const adresses = {};
  for (const d of snap.docs) {
    const donnees = d.data()?.adresses || {};
    Object.assign(adresses, donnees);
  }
  return adresses;
}

export async function archiverSaison(annee) {
  if (!annee || !/^\d{4}$/.test(String(annee))) throw new Error("Année invalide");
  const [secteurs, equipes, stats] = await Promise.all([lireSecteurs(), lireEquipes(), statsGlobalesTournee()]);

  // Détail par adresse : ce que chaque foyer a donné cette année-là
  const passages = await fsGetAll(COLLECTIONS.PASSAGES);
  const secteurNom = Object.fromEntries(secteurs.map(s => [s.id, s.nom]));
  const adresses = {};
  for (const p of passages) {
    const a = (p.adresse || '').trim();
    if (!a) continue;
    const clef = normAdresse(a);
    if (!clef) continue;
    // On conserve le passage le plus significatif (un don prime sur un refus)
    const existant = adresses[clef];
    const montant = p.statut === "don" ? Number(p.montant || 0) : 0;
    if (!existant || montant > (existant.m || 0)) {
      adresses[clef] = {
        a,
        s: p.statut,
        m: montant,
        sc: secteurNom[p.secteurId] || null
      };
    }
  }

  const entrees = Object.entries(adresses);
  const nbChunks = Math.ceil(entrees.length / TAILLE_CHUNK_ADRESSES);
  const snapshot = {
    annee: Number(annee),
    dateArchivage: new Date().toISOString(),
    totalCollecte: stats.totalCollecte,
    totalEspeces: stats.totalEspeces,
    totalCheques: stats.totalCheques,
    totalCarte: stats.totalCarte || 0,
    nbDons: stats.nbDons,
    nbPassages: stats.nbPassages,
    nbSecteursTotal: stats.nbSecteursTotal,
    nbSecteursTermines: stats.nbSecteursTermines,
    secteurs: secteurs.map(s => ({
      nom: s.nom, commune: s.commune, equipeNom: s.equipNom || null,
      totalCollecte: s.totalCollecte || 0, nbFoyersVisites: s.nbFoyersVisites || 0,
      nbFoyersAbsents: s.nbFoyersAbsents || 0, statut: s.statut
    })),
    equipes: stats.parEquipe.map(eq => ({ nom: eq.nom, montant: eq.montant, nbPassages: eq.nbPassages })),
    stockageAdresses: "chunks-v1",
    nbAdressesArchivees: entrees.length,
    nbChunksAdresses: nbChunks
  };

  // Écrire d'abord le résumé puis les chunks. Un ancien archivage de la même année
  // est nettoyé pour éviter de conserver des chunks obsolètes.
  await fsSet(COLLECTION_HISTORIQUE, String(annee), snapshot);
  await supprimerChunksAdresse(annee);
  for (let i = 0; i < entrees.length; i += TAILLE_CHUNK_ADRESSES) {
    const chunk = Object.fromEntries(entrees.slice(i, i + TAILLE_CHUNK_ADRESSES));
    const id = `chunk-${String(Math.floor(i / TAILLE_CHUNK_ADRESSES) + 1).padStart(4, '0')}`;
    await setDoc(doc(db, COLLECTION_HISTORIQUE, String(annee), SOUS_COLLECTION_ADRESSES, id), { adresses: chunk });
  }
  return { ...snapshot, adresses };
}

export async function reinitialiserSaison() {
  const collections = [COLLECTIONS.SECTEURS, COLLECTIONS.EQUIPES, COLLECTIONS.PASSAGES, COLLECTIONS.PINS];
  const snaps = await Promise.all(collections.map(c => getDocs(collection(db, c))));
  const refs = snaps.flatMap(s => s.docs.map(d => d.ref));
  return supprimerRefsParLots(refs);
}

export async function lireSaison(annee) { return fsGet(COLLECTION_HISTORIQUE, String(annee)); }
export async function lireToutesLesSaisons() {
  const saisons = await fsGetAll(COLLECTION_HISTORIQUE);
  return saisons.sort((a, b) => b.annee - a.annee);
}
export async function saisirSaisonManuelle({ annee, totalCollecte, totalEspeces=0, totalCheques=0, totalCarte=0, nbDons=0, nbPassages=0, secteurs=[], note="" }) {
  if (!annee || !/^\d{4}$/.test(String(annee))) throw new Error("Année invalide");
  const snapshot = { annee:Number(annee), dateArchivage:new Date().toISOString(), saisieManuelle:true, note, totalCollecte:Number(totalCollecte)||0, totalEspeces:Number(totalEspeces)||0, totalCheques:Number(totalCheques)||0, totalCarte:Number(totalCarte)||0, nbDons:Number(nbDons)||0, nbPassages:Number(nbPassages)||0, nbSecteursTotal:secteurs.length, nbSecteursTermines:secteurs.length, secteurs:secteurs.map(s=>({nom:s.nom||"",commune:s.commune||"",equipeNom:s.equipeNom||null,totalCollecte:Number(s.totalCollecte)||0,nbFoyersVisites:0,nbFoyersAbsents:0,statut:"termine"})), equipes:[] };
  await supprimerChunksAdresse(annee);
  await fsSet(COLLECTION_HISTORIQUE, String(annee), snapshot);
  return snapshot;
}
export async function supprimerSaison(annee) {
  await supprimerChunksAdresse(annee);
  return fsDelete(COLLECTION_HISTORIQUE, String(annee));
}
export function comparerSaisons(a, b) {
  if (!a || !b) return null;
  const ecartTotal = a.totalCollecte - b.totalCollecte;
  const ecartPourcent = b.totalCollecte > 0 ? Math.round((ecartTotal / b.totalCollecte) * 1000) / 10 : null;
  const secteursB = Object.fromEntries((b.secteurs || []).map(s => [s.nom, s]));
  const comparaisonSecteurs = (a.secteurs || []).map(sA => {
    const sB = secteursB[sA.nom]; const ecart = sB ? sA.totalCollecte - sB.totalCollecte : null;
    const ecartPct = sB && sB.totalCollecte > 0 ? Math.round((ecart / sB.totalCollecte) * 1000) / 10 : null;
    return { nom:sA.nom, commune:sA.commune, montantA:sA.totalCollecte, montantB:sB?sB.totalCollecte:null, ecart, ecartPct, tendance:ecart===null?"nouveau":ecart>0?"hausse":ecart<0?"baisse":"stable" };
  });
  return { anneeA:a.annee, anneeB:b.annee, totalA:a.totalCollecte, totalB:b.totalCollecte, ecartTotal, ecartPourcent, comparaisonSecteurs:comparaisonSecteurs.sort((a,b)=>(b.ecart||0)-(a.ecart||0)), comparaisonEquipes:[] };
}

// ── Historique par adresse ───────────────────────────────────────
export async function chargerHistoriqueAdresses() {
  const saisons = await lireToutesLesSaisons();
  const index = {};
  for (const s of saisons) {
    // Compatibilité avec les archives V1/V2 qui stockaient les adresses dans le document parent.
    const adresses = s.adresses || (s.stockageAdresses === "chunks-v1" ? await lireChunksAdresse(s.annee) : null);
    if (!adresses) continue;
    for (const [clef, d] of Object.entries(adresses)) {
      if (!index[clef]) index[clef] = [];
      index[clef].push({ annee: s.annee, adresse: d.a, statut: d.s, montant: d.m || 0, secteur: d.sc || null });
    }
  }
  for (const clef in index) index[clef].sort((a, b) => b.annee - a.annee);
  return index;
}

// Pour les sauvegardes complètes : réintègre les chunks d'adresse dans le JSON exporté.
export async function exporterHistoriqueComplet() {
  const saisons = await lireToutesLesSaisons();
  return Promise.all(saisons.map(async s => {
    if (s.adresses || s.stockageAdresses !== "chunks-v1") return s;
    return { ...s, adresses: await lireChunksAdresse(s.annee) };
  }));
}

// Résumé court pour affichage : "2025 : 15 €" ou "2025 : refus"
export function resumeHistorique(entrees) {
  if (!entrees || entrees.length === 0) return null;
  return entrees.map(e => {
    if (e.statut === "don")    return `${e.annee} : ${e.montant.toFixed(2).replace('.', ',')} €`;
    if (e.statut === "offert") return `${e.annee} : offert`;
    if (e.statut === "refuse") return `${e.annee} : refus`;
    return `${e.annee} : absent`;
  });
}
