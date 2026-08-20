// tournee.js — Logique métier tournée calendriers
import { COLLECTIONS, fsAdd, fsSet, fsUpdate, fsDelete, fsGet, fsGetAll, fsQuery, fsListen, where, serverTimestamp } from "./firebase.js";
import { recalculerTotauxSecteur } from "./secteurs.js";

export const STATUT_PASSAGE = { DON:"don", OFFERT:"offert", REFUSE:"refuse", ABSENT:"absent", RELANCE:"relance" };
export const STATUT_PASSAGE_LABEL = { don:"Don collecté", offert:"Calendrier offert", refuse:"A refusé", absent:"Absent", relance:"À relancer" };
export const MODE_PAIEMENT = { ESPECES:"especes", CHEQUE:"cheque", CARTE:"carte" };

export async function creerEquipe({ nom, membres=[], pin }) {
  if (!nom) throw new Error("Nom d'équipe obligatoire");
  if (!pin || !/^\d{4}$/.test(pin)) throw new Error("PIN doit être 4 chiffres");
  // L'unicité est structurelle : le PIN est l'identifiant du document
  const pris = await fsGet(COLLECTIONS.PINS, pin);
  if (pris) throw new Error("Ce PIN est déjà utilisé");
  const ref = await fsAdd(COLLECTIONS.EQUIPES, { nom, membres, actif:true });
  await fsSet(COLLECTIONS.PINS, pin, { equipeId: ref.id, nom });
  return ref;
}
export async function mettreAJourEquipe(equipeId, data) {
  const { pin, ...champs } = data;
  if (pin !== undefined && pin !== null && pin !== '') {
    if (!/^\d{4}$/.test(pin)) throw new Error("PIN doit être 4 chiffres");
    const pris = await fsGet(COLLECTIONS.PINS, pin);
    if (pris && pris.equipeId !== equipeId) throw new Error("Ce PIN est déjà utilisé");
    // Retirer l'ancien code de cette équipe
    const tous = await fsGetAll(COLLECTIONS.PINS);
    for (const p of tous) {
      if (p.equipeId === equipeId && p.id !== pin) await fsDelete(COLLECTIONS.PINS, p.id);
    }
    await fsSet(COLLECTIONS.PINS, pin, { equipeId, nom: champs.nom || pris?.nom || '' });
  }
  if (Object.keys(champs).length) await fsUpdate(COLLECTIONS.EQUIPES, equipeId, champs);
}
export async function supprimerEquipe(id) {
  const tous = await fsGetAll(COLLECTIONS.PINS);
  for (const p of tous) if (p.equipeId === id) await fsDelete(COLLECTIONS.PINS, p.id);
  return fsDelete(COLLECTIONS.EQUIPES, id);
}

// Table { equipeId → pin } — réservée aux administrateurs (règle "list")
export async function lirePins() {
  const tous = await fsGetAll(COLLECTIONS.PINS);
  const map = {};
  for (const p of tous) map[p.equipeId] = p.id;
  return map;
}

// Migration : déplace les PIN encore stockés dans /equipes vers /pins
export async function migrerPins() {
  const equipes = await fsGetAll(COLLECTIONS.EQUIPES);
  let deplaces = 0, conflits = 0;
  for (const e of equipes) {
    if (!e.pin) continue;
    const pris = await fsGet(COLLECTIONS.PINS, String(e.pin));
    if (pris && pris.equipeId !== e.id) { conflits++; continue; }
    await fsSet(COLLECTIONS.PINS, String(e.pin), { equipeId: e.id, nom: e.nom || '' });
    await fsUpdate(COLLECTIONS.EQUIPES, e.id, { pin: null });
    deplaces++;
  }
  return { deplaces, conflits, total: equipes.length };
}
export async function lireEquipes() { return fsGetAll(COLLECTIONS.EQUIPES); }
export async function lireEquipe(id) { return fsGet(COLLECTIONS.EQUIPES, id); }
export function ecouterEquipes(callback) {
  return fsListen(COLLECTIONS.EQUIPES, (equipes) => {
    equipes.sort((a,b)=>a.nom.localeCompare(b.nom));
    callback(equipes);
  });
}

export async function ajouterPassage({ secteurId, equipeId, equipeNom, adresse, statut, montant=0, modePaiement=null, nomDonateur="", note="", saisiPar="" }) {
  if (!secteurId||!equipeId) throw new Error("secteurId et equipeId obligatoires");
  if (!Object.values(STATUT_PASSAGE).includes(statut)) throw new Error("Statut invalide");
  if (statut===STATUT_PASSAGE.DON && montant<=0) throw new Error("Montant requis pour un don");
  // Le statut "offert" ne requiert aucun montant (calendrier donné sans contrepartie)
  const passage = await fsAdd(COLLECTIONS.PASSAGES, {
    secteurId, equipeId, equipeNom, adresse:adresse||"", statut,
    montant: statut===STATUT_PASSAGE.DON ? Number(montant) : 0,
    modePaiement: statut===STATUT_PASSAGE.DON ? modePaiement : null,
    nomDonateur, note, saisiPar, aRelancer: statut===STATUT_PASSAGE.ABSENT, datePassage: new Date().toISOString()
  });
  await recalculerTotauxSecteur(secteurId);
  return passage;
}
export async function marquerRelance(passageId, secteurId) {
  await fsUpdate(COLLECTIONS.PASSAGES, passageId, { aRelancer:true, statut:STATUT_PASSAGE.RELANCE });
  await recalculerTotauxSecteur(secteurId);
}
// Vérifie si une adresse a déjà été saisie dans ce secteur (anti-doublon binôme)
// Retourne le passage existant le plus récent, ou null
export async function verifierDoublonAdresse(secteurId, adresse) {
  if (!adresse || !adresse.trim()) return null;
  const passages = await fsQuery(COLLECTIONS.PASSAGES, where("secteurId","==",secteurId));
  const norm = (s) => (s||"").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cible = norm(adresse);
  if (!cible) return null;
  const matches = passages.filter(p => norm(p.adresse) === cible);
  if (matches.length === 0) return null;
  return matches.sort((a,b)=>(b.datePassage||"").localeCompare(a.datePassage||""))[0];
}

export async function modifierPassage(passageId, data) {
  const { secteurId, ...champs } = data;
  await fsUpdate(COLLECTIONS.PASSAGES, passageId, champs);
  if (secteurId) await recalculerTotauxSecteur(secteurId);
}

export async function supprimerPassage(passageId, secteurId) {
  await fsDelete(COLLECTIONS.PASSAGES, passageId);
  await recalculerTotauxSecteur(secteurId);
}
export async function passagesDuSecteur(secteurId) {
  const passages = await fsQuery(COLLECTIONS.PASSAGES, where("secteurId","==",secteurId));
  return passages.sort((a,b)=>(a.datePassage||"").localeCompare(b.datePassage||""));
}
export async function passagesDeLEquipe(equipeId) {
  const passages = await fsQuery(COLLECTIONS.PASSAGES, where("equipeId","==",equipeId));
  return passages.sort((a,b)=>(a.datePassage||"").localeCompare(b.datePassage||""));
}
export async function foyersARelancer() { return fsQuery(COLLECTIONS.PASSAGES, where("aRelancer","==",true)); }
export function ecouterPassagesSecteur(secteurId, callback) {
  return fsListen(COLLECTIONS.PASSAGES, (passages) => {
    passages.sort((a,b)=>(b.datePassage||"").localeCompare(a.datePassage||""));
    callback(passages);
  }, where("secteurId","==",secteurId));
}

export async function statsGlobalesTournee() {
  const [passages, equipes, secteurs] = await Promise.all([
    fsGetAll(COLLECTIONS.PASSAGES), fsGetAll(COLLECTIONS.EQUIPES), fsGetAll(COLLECTIONS.SECTEURS)
  ]);
  let totalEspeces=0, totalCheques=0, totalCarte=0, nbDons=0, nbOfferts=0, nbRefus=0, nbAbsents=0, nbRelances=0;
  for (const p of passages) {
    if (p.statut==="don") { nbDons++; if(p.modePaiement==="especes") totalEspeces+=Number(p.montant||0); else if(p.modePaiement==="cheque") totalCheques+=Number(p.montant||0); else if(p.modePaiement==="carte") totalCarte+=Number(p.montant||0); }
    if (p.statut==="offert") nbOfferts++;
    if (p.statut==="refuse") nbRefus++;
    if (p.statut==="absent") nbAbsents++;
    if (p.statut==="relance") nbRelances++;
  }
  const nbCalendriers = nbDons + nbOfferts;   // calendriers distribués au total
  const totalCollecte = totalEspeces + totalCheques + totalCarte;
  const parEquipe = equipes.map(eq => {
    const eqPassages = passages.filter(p=>p.equipeId===eq.id);
    const montant = eqPassages.filter(p=>p.statut==="don").reduce((s,p)=>s+Number(p.montant||0),0);
    const nbRefusEq = eqPassages.filter(p=>p.statut==="refuse").length;
    const nbOffertsEq = eqPassages.filter(p=>p.statut==="offert").length;
    const nbDonsEq = eqPassages.filter(p=>p.statut==="don").length;
    return { ...eq, montant, nbPassages:eqPassages.length, nbRefus:nbRefusEq,
             nbOfferts:nbOffertsEq, nbCalendriers:nbDonsEq + nbOffertsEq };
  }).sort((a,b)=>b.montant-a.montant);
  const nbSecteursTermines = secteurs.filter(s=>s.statut==="termine").length;
  const nbSecteursTotal = secteurs.length;
  const avancement = nbSecteursTotal>0 ? Math.round((nbSecteursTermines/nbSecteursTotal)*100) : 0;
  return { totalCollecte, totalEspeces, totalCheques, totalCarte, nbDons, nbOfferts, nbCalendriers, nbRefus, nbAbsents, nbRelances, nbPassages:passages.length, nbSecteursTermines, nbSecteursTotal, avancement, parEquipe };
}

export async function lireConfig() { return fsGet(COLLECTIONS.CONFIG, "tournee"); }
export async function sauvegarderConfig(data) { return fsSet(COLLECTIONS.CONFIG, "tournee", data); }


// Cellule CSV compatible Excel : double les guillemets et neutralise les
// préfixes interprétés comme des formules (=, +, -, @).
export function celluleCSV(value) {
  let v = String(value ?? "");
  if (/^[=+\-@]/.test(v)) v = "'" + v;
  return `"${v.replaceAll('"', '""')}"`;
}

export async function exporterBilanCSV() {
  const [passages, secteurs, equipes] = await Promise.all([fsGetAll(COLLECTIONS.PASSAGES), fsGetAll(COLLECTIONS.SECTEURS), fsGetAll(COLLECTIONS.EQUIPES)]);
  const secteurMap = Object.fromEntries(secteurs.map(s=>[s.id,s]));
  const ligne = (...vals) => vals.map(celluleCSV).join(";") + "\n";
  let csv = "BILAN PAR SECTEUR\n" + ligne("Secteur","Commune","Équipe","Statut","Total collecté (€)","Foyers visités","Absents");
  for (const s of secteurs) csv += ligne(s.nom, s.commune, s.equipNom||'-', s.statut, (s.totalCollecte||0).toFixed(2), s.nbFoyersVisites||0, s.nbFoyersAbsents||0);
  csv += "\n\nBILAN PAR ÉQUIPE\n" + ligne("Équipe","Membres","Montant collecté (€)","Nb passages");
  for (const e of equipes) {
    const eqP = passages.filter(p=>p.equipeId===e.id);
    const montant = eqP.filter(p=>p.statut==="don").reduce((s,p)=>s+Number(p.montant||0),0);
    csv += ligne(e.nom, (e.membres||[]).join(', '), montant.toFixed(2), eqP.length);
  }
  csv += "\n\nDÉTAIL DES PASSAGES\n" + ligne("Date","Équipe","Secteur","Commune","Adresse","Statut","Mode paiement","Montant (€)","Nom donateur","Note");
  const sorted = [...passages].sort((a,b)=>(a.datePassage||"").localeCompare(b.datePassage||""));
  for (const p of sorted) {
    const s = secteurMap[p.secteurId]||{};
    csv += ligne((p.datePassage||"").slice(0,10), p.equipeNom||'', s.nom||'', s.commune||'', p.adresse||'', p.statut, p.modePaiement||'', p.montant?Number(p.montant).toFixed(2):'0.00', p.nomDonateur||'', p.note||'');
  }
  csv += "\n\nFOYERS À RELANCER\n" + ligne("Équipe","Secteur","Commune","Adresse","Note");
  for (const p of passages.filter(p=>p.aRelancer)) {
    const s = secteurMap[p.secteurId]||{};
    csv += ligne(p.equipeNom||'', s.nom||'', s.commune||'', p.adresse||'', p.note||'');
  }
  return csv;
}
export function telechargerCSV(csv, filename="bilan-tournee-calendriers.csv") {
  const bom = "\uFEFF";
  const blob = new Blob([bom+csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}


// ── Effacement de tous les passages (nettoyage des saisies de test) ──
// Les secteurs et les équipes sont conservés ; seuls les passages sont
// supprimés et les totaux des secteurs remis à zéro.
export async function effacerTousLesPassages() {
  const passages = await fsGetAll(COLLECTIONS.PASSAGES);
  let supprimes = 0, erreurs = 0;
  for (const p of passages) {
    try { await fsDelete(COLLECTIONS.PASSAGES, p.id); supprimes++; }
    catch(e) { erreurs++; }
  }
  // Remettre à zéro les compteurs de chaque secteur
  const secteurs = await fsGetAll(COLLECTIONS.SECTEURS);
  for (const s of secteurs) {
    try {
      await fsUpdate(COLLECTIONS.SECTEURS, s.id, {
        totalCollecte: 0, nbFoyersVisites: 0, nbFoyersAbsents: 0,
        nbCalendriers: 0, nbFoyersTotal: 0
      });
    } catch(e) { /* on continue */ }
  }
  return { supprimes, erreurs, secteurs: secteurs.length };
}
