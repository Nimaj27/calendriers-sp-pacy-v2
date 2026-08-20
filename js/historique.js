// historique.js — Historique multi-années
import { COLLECTIONS, fsSet, fsGet, fsGetAll, fsDelete, db, writeBatch } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { lireSecteurs } from "./secteurs.js";
import { lireEquipes, statsGlobalesTournee } from "./tournee.js";

const COLLECTION_HISTORIQUE = "historique_saisons";

// Normalisation d'adresse, commune à l'archivage et à la consultation
export function normAdresse(s) {
  return (s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

export async function archiverSaison(annee) {
  if (!annee||!/^\d{4}$/.test(String(annee))) throw new Error("Année invalide");
  const [secteurs, equipes, stats] = await Promise.all([lireSecteurs(), lireEquipes(), statsGlobalesTournee()]);

  // Détail par adresse : ce que chaque foyer a donné cette année-là
  const passages = await fsGetAll(COLLECTIONS.PASSAGES);
  const secteurNom = Object.fromEntries(secteurs.map(s => [s.id, s.nom]));
  const adresses = {};
  for (const p of passages) {
    const a = (p.adresse || '').trim();
    if (!a) continue;
    const clef = normAdresse(a);
    // On conserve le passage le plus significatif (un don prime sur un refus)
    const existant = adresses[clef];
    const montant = p.statut === "don" ? Number(p.montant || 0) : 0;
    if (!existant || montant > (existant.m || 0)) {
      adresses[clef] = {
        a,                                   // adresse lisible
        s: p.statut,                         // statut
        m: montant,                          // montant
        sc: secteurNom[p.secteurId] || null  // secteur
      };
    }
  }
  const snapshot = {
    annee:Number(annee), dateArchivage:new Date().toISOString(),
    totalCollecte:stats.totalCollecte, totalEspeces:stats.totalEspeces, totalCheques:stats.totalCheques, totalCarte:stats.totalCarte||0,
    nbDons:stats.nbDons, nbPassages:stats.nbPassages, nbSecteursTotal:stats.nbSecteursTotal, nbSecteursTermines:stats.nbSecteursTermines,
    secteurs:secteurs.map(s=>({ nom:s.nom, commune:s.commune, equipeNom:s.equipNom||null, totalCollecte:s.totalCollecte||0, nbFoyersVisites:s.nbFoyersVisites||0, nbFoyersAbsents:s.nbFoyersAbsents||0, statut:s.statut })),
    equipes:stats.parEquipe.map(eq=>({ nom:eq.nom, montant:eq.montant, nbPassages:eq.nbPassages })),
    adresses
  };
  await fsSet(COLLECTION_HISTORIQUE, String(annee), snapshot);
  return snapshot;
}

export async function reinitialiserSaison() {
  const batch = writeBatch(db);
  const [s,e,p] = await Promise.all([getDocs(collection(db,COLLECTIONS.SECTEURS)), getDocs(collection(db,COLLECTIONS.EQUIPES)), getDocs(collection(db,COLLECTIONS.PASSAGES))]);
  let count=0;
  s.docs.forEach(d=>{batch.delete(d.ref);count++;});
  e.docs.forEach(d=>{batch.delete(d.ref);count++;});
  p.docs.forEach(d=>{batch.delete(d.ref);count++;});
  if (count<=500) await batch.commit();
  return count;
}

export async function lireSaison(annee) { return fsGet(COLLECTION_HISTORIQUE, String(annee)); }
export async function lireToutesLesSaisons() {
  const saisons = await fsGetAll(COLLECTION_HISTORIQUE);
  return saisons.sort((a,b)=>b.annee-a.annee);
}
export async function saisirSaisonManuelle({ annee, totalCollecte, totalEspeces=0, totalCheques=0, totalCarte=0, nbDons=0, nbPassages=0, secteurs=[], note="" }) {
  if (!annee||!/^\d{4}$/.test(String(annee))) throw new Error("Année invalide");
  const snapshot = { annee:Number(annee), dateArchivage:new Date().toISOString(), saisieManuelle:true, note, totalCollecte:Number(totalCollecte)||0, totalEspeces:Number(totalEspeces)||0, totalCheques:Number(totalCheques)||0, totalCarte:Number(totalCarte)||0, nbDons:Number(nbDons)||0, nbPassages:Number(nbPassages)||0, nbSecteursTotal:secteurs.length, nbSecteursTermines:secteurs.length, secteurs:secteurs.map(s=>({nom:s.nom||"",commune:s.commune||"",equipeNom:s.equipeNom||null,totalCollecte:Number(s.totalCollecte)||0,nbFoyersVisites:0,nbFoyersAbsents:0,statut:"termine"})), equipes:[] };
  await fsSet(COLLECTION_HISTORIQUE, String(annee), snapshot);
  return snapshot;
}
export async function supprimerSaison(annee) { return fsDelete(COLLECTION_HISTORIQUE, String(annee)); }
export function comparerSaisons(a, b) {
  if (!a||!b) return null;
  const ecartTotal = a.totalCollecte-b.totalCollecte;
  const ecartPourcent = b.totalCollecte>0?Math.round((ecartTotal/b.totalCollecte)*1000)/10:null;
  const secteursB = Object.fromEntries((b.secteurs||[]).map(s=>[s.nom,s]));
  const comparaisonSecteurs = (a.secteurs||[]).map(sA=>{
    const sB=secteursB[sA.nom]; const ecart=sB?sA.totalCollecte-sB.totalCollecte:null;
    const ecartPct=sB&&sB.totalCollecte>0?Math.round((ecart/sB.totalCollecte)*1000)/10:null;
    return { nom:sA.nom, commune:sA.commune, montantA:sA.totalCollecte, montantB:sB?sB.totalCollecte:null, ecart, ecartPct, tendance:ecart===null?"nouveau":ecart>0?"hausse":ecart<0?"baisse":"stable" };
  });
  return { anneeA:a.annee, anneeB:b.annee, totalA:a.totalCollecte, totalB:b.totalCollecte, ecartTotal, ecartPourcent, comparaisonSecteurs:comparaisonSecteurs.sort((a,b)=>(b.ecart||0)-(a.ecart||0)), comparaisonEquipes:[] };
}


// ── Historique par adresse ───────────────────────────────────────
// Construit un index consultable : que ce foyer a-t-il donné les années passées ?
export async function chargerHistoriqueAdresses() {
  const saisons = await lireToutesLesSaisons();
  const index = {};
  for (const s of saisons) {
    if (!s.adresses) continue;
    for (const [clef, d] of Object.entries(s.adresses)) {
      if (!index[clef]) index[clef] = [];
      index[clef].push({ annee: s.annee, adresse: d.a, statut: d.s, montant: d.m || 0, secteur: d.sc || null });
    }
  }
  // Plus récent en premier
  for (const clef in index) index[clef].sort((a, b) => b.annee - a.annee);
  return index;
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
