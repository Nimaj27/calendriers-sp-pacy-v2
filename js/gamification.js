// gamification.js — Badges, paliers et classement ludique
export const PALIERS = [
  { seuil:100, icone:"🏆", label:"Champion", couleur:"#EAB308" },
  { seuil:75,  icone:"🥇", label:"Or",       couleur:"#F59E0B" },
  { seuil:50,  icone:"🥈", label:"Argent",   couleur:"#9CA3AF" },
  { seuil:25,  icone:"🥉", label:"Bronze",   couleur:"#B45309" },
  { seuil:0,   icone:"🔰", label:"Débutant", couleur:"#6B7280" }
];
export function getPalier(pct) { return PALIERS.find(p=>pct>=p.seuil)||PALIERS[PALIERS.length-1]; }
export function pourcentCompletionEquipe(equipeId, secteurs) {
  const s = secteurs.filter(s=>s.equipeId===equipeId);
  if (!s.length) return 0;
  return Math.round((s.filter(s=>s.statut==="termine").length/s.length)*100);
}
export const BADGES = [
  { id:"pionnier",      icone:"🚀", nom:"Pionnier",          description:"Première équipe à clôturer un secteur",    test:(eq,ctx)=>ctx.premierATerminer===eq.id },
  { id:"top_collecteur",icone:"💰", nom:"Top collecteur",    description:"Équipe en tête du classement",             test:(eq,ctx)=>ctx.classement[0]?.id===eq.id&&ctx.classement[0]?.montant>0 },
  { id:"sans_faute",    icone:"🎯", nom:"Sans faute",        description:"Meilleur taux de dons (peu de refus)",     test:(eq,ctx)=>{ if(eq.nbPassages<5)return false; const t=eq.nbRefus/eq.nbPassages; return ctx.meilleurTauxRefus!==null&&t===ctx.meilleurTauxRefus&&t<0.15; } },
  { id:"serie_3",       icone:"🔥", nom:"Série de 3",        description:"3 secteurs ou plus terminés",              test:(eq,ctx)=>ctx.secteursTerminesParEquipe[eq.id]>=3 },
  { id:"palier_500",    icone:"🌟", nom:"Cap des 500€",      description:"A dépassé 500€ collectés",                 test:(eq)=>eq.montant>=500 },
  { id:"palier_1000",   icone:"💎", nom:"Cap des 1000€",     description:"A dépassé 1000€ collectés",                test:(eq)=>eq.montant>=1000 },
  { id:"complet",       icone:"🏁", nom:"Mission accomplie", description:"100% des secteurs assignés terminés",      test:(eq,ctx)=>ctx.pourcentParEquipe[eq.id]===100&&ctx.secteursParEquipe[eq.id]>0 }
];
export function calculerBadges(parEquipe, secteurs, passages) {
  const classement = [...parEquipe].sort((a,b)=>b.montant-a.montant);
  const secteursTerminesParEquipe={}, secteursParEquipe={}, pourcentParEquipe={};
  parEquipe.forEach(eq=>{
    const s=secteurs.filter(s=>s.equipeId===eq.id);
    secteursParEquipe[eq.id]=s.length;
    secteursTerminesParEquipe[eq.id]=s.filter(s=>s.statut==="termine").length;
    pourcentParEquipe[eq.id]=pourcentCompletionEquipe(eq.id,secteurs);
  });
  const premierATerminer = secteurs.filter(s=>s.statut==="termine"&&s.dateFin).sort((a,b)=>new Date(a.dateFin)-new Date(b.dateFin))[0]?.equipeId||null;
  const tauxRefus = parEquipe.map(eq=>eq.nbPassages>=5?(eq.nbRefus||0)/eq.nbPassages:null).filter(t=>t!==null);
  const meilleurTauxRefus = tauxRefus.length>0?Math.min(...tauxRefus):null;
  const ctx = { classement, secteursTerminesParEquipe, secteursParEquipe, pourcentParEquipe, premierATerminer, meilleurTauxRefus };
  const resultats={};
  parEquipe.forEach(eq=>{ resultats[eq.id]=BADGES.filter(b=>{ try{return b.test(eq,ctx);}catch(e){return false;} }); });
  return resultats;
}
export function detecterNouveauxBadges(avant, apres) {
  const nouveaux=[];
  for (const equipeId in apres) {
    const avantIds=(avant[equipeId]||[]).map(b=>b.id);
    apres[equipeId].forEach(badge=>{ if(!avantIds.includes(badge.id)) nouveaux.push({equipeId,badge}); });
  }
  return nouveaux;
}
export function getPodium(parEquipe) { return [...parEquipe].sort((a,b)=>b.montant-a.montant).slice(0,3); }
