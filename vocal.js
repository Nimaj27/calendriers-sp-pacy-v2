// ============================================================
// vocal.js — Reconnaissance vocale pour la saisie terrain
// Amicale SP Pacy-sur-Eure — Tournée Calendriers
// ============================================================

// Vérifie la disponibilité de l'API Web Speech
export function vocalDisponible() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// ── Analyse une phrase dictée et en extrait les infos structurées ──
// Exemples reconnus :
//   "don 20 euros espèces"        → { statut:'don', montant:20, mode:'especes' }
//   "don de 15 euros par chèque"  → { statut:'don', montant:15, mode:'cheque' }
//   "don 30 carte bancaire"       → { statut:'don', montant:30, mode:'carte' }
//   "refus"                       → { statut:'refuse' }
//   "absent"                      → { statut:'absent' }
//   "absent à relancer"           → { statut:'absent', aRelancer:true }
//   "12 rue de la mairie don 10 euros" → { adresse:'12 rue de la mairie', statut:'don', montant:10 }
export function analyserPhrase(texte) {
  if (!texte) return null;
  const t = texte.toLowerCase().trim();
  const res = { texteBrut: texte };

  // ── Statut ──
  if (/\b(refus|refuse|refusé|refuser|rien|pas de don)\b/.test(t)) {
    res.statut = "refuse";
  } else if (/\b(absent|absente|personne|pas la|pas là|vide)\b/.test(t)) {
    res.statut = "absent";
    if (/\b(relanc|repass|revenir|retour)\w*/.test(t)) res.aRelancer = true;
  } else if (/\b(don|donne|donné|payé|paie|paye|verse|versé|euros?|€)\b/.test(t)) {
    res.statut = "don";
  }

  // ── Adresse (extraite EN PREMIER pour ne pas confondre le n° de rue avec le montant) ──
  let resteTexte = t;
  const matchAdresse = t.match(/^(\d+\s+(?:bis\s+|ter\s+)?(?:rue|avenue|av|boulevard|bd|place|impasse|chemin|route|all[ée]e|square|lotissement|hameau|ferme|r[ée]sidence)\s+[a-zàâäéèêëïîôöùûüç'\s-]+?)(?=\s+(?:don|refus|absent|personne|rien)|$)/i);
  if (matchAdresse) {
    res.adresse = matchAdresse[1].trim();
    resteTexte = t.slice(matchAdresse[0].length).trim();
  } else {
    const matchNumSeul = t.match(/^(\d+)\s+(?=don|refus|absent|personne)/);
    if (matchNumSeul) {
      res.adresse = matchNumSeul[1];
      resteTexte = t.slice(matchNumSeul[0].length).trim();
    }
  }

  // ── Montant (cherché uniquement dans le reste, après l'adresse) ──
  // Gère "20", "20 euros", "vingt euros", "10,50", "10.50"
  const motsChiffres = {
    "zero":0,"zéro":0,"un":1,"une":1,"deux":2,"trois":3,"quatre":4,"cinq":5,
    "six":6,"sept":7,"huit":8,"neuf":9,"dix":10,"onze":11,"douze":12,"treize":13,
    "quatorze":14,"quinze":15,"seize":16,"vingt":20,"trente":30,"quarante":40,
    "cinquante":50,"soixante":60,"cent":100,"cents":100,"mille":1000
  };

  // D'abord chercher un nombre écrit en chiffres
  const matchNum = resteTexte.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|€)?/);
  if (matchNum) {
    res.montant = parseFloat(matchNum[1].replace(",", "."));
  } else {
    // Sinon tenter les nombres en lettres (simple : un seul mot ou "vingt cinq")
    const mots = resteTexte.split(/\s+/);
    let total = 0, trouve = false;
    for (let i = 0; i < mots.length; i++) {
      const m = mots[i].replace(/[^a-zàâäéèêëïîôöùûüç]/g, "");
      if (motsChiffres[m] !== undefined) {
        const val = motsChiffres[m];
        // "vingt cinq" = 25, "cent cinquante" = 150
        if (val >= 100 && total > 0) total *= val;
        else total += val;
        trouve = true;
      }
    }
    if (trouve && total > 0) res.montant = total;
  }

  // ── Mode de paiement ──
  if (/\b(ch[eè]que|cheques?)\b/.test(t))                        res.mode = "cheque";
  else if (/\b(carte|cb|bancaire|sumup|sum up)\b/.test(t))       res.mode = "carte";
  else if (/\b(esp[eè]ces?|liquide|cash|billet|pi[eè]ce)\w*\b/.test(t)) res.mode = "especes";

  return res;
}

// ── Lance l'écoute vocale ──────────────────────────────────────
// onResult(analyse, texteBrut) — appelé quand une phrase est reconnue
// onError(message) — appelé en cas d'erreur
// onStateChange(enEcoute) — appelé au début/fin d'écoute
export function ecouterVocal({ onResult, onError, onStateChange }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    onError && onError("La reconnaissance vocale n'est pas disponible sur ce navigateur.");
    return null;
  }

  const recognition = new SR();
  recognition.lang = "fr-FR";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => { onStateChange && onStateChange(true); };
  recognition.onend   = () => { onStateChange && onStateChange(false); };

  recognition.onresult = (event) => {
    const texte = event.results[0][0].transcript;
    const analyse = analyserPhrase(texte);
    onResult && onResult(analyse, texte);
  };

  recognition.onerror = (event) => {
    const messages = {
      "no-speech":        "Aucune parole détectée, réessaie.",
      "audio-capture":    "Micro inaccessible. Vérifie les autorisations.",
      "not-allowed":      "Accès au micro refusé. Autorise-le dans les réglages du navigateur.",
      "network":          "Erreur réseau — la reconnaissance vocale nécessite une connexion.",
      "aborted":          null // annulation volontaire, pas d'erreur à afficher
    };
    const msg = messages[event.error];
    if (msg) onError && onError(msg);
    onStateChange && onStateChange(false);
  };

  try {
    recognition.start();
  } catch(e) {
    onError && onError("Impossible de démarrer l'écoute : " + e.message);
    return null;
  }

  return recognition;
}
