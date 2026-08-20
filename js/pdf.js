// ============================================================
// pdf.js — Export PDF du bilan de tournée
// Amicale SP Pacy-sur-Eure — Tournée Calendriers
// ============================================================

// Chargement dynamique de jsPDF + autoTable (CDN, pas de dépendance serveur)
import { statsGlobalesTournee } from "./tournee.js";

let _pdfLoading = null;
function chargerJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
  if (_pdfLoading) return _pdfLoading;
  _pdfLoading = new Promise((resolve, reject) => {
    const s1 = document.createElement("script");
    s1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/5.0.8/jspdf.plugin.autotable.min.js";
      s2.onload = () => resolve();
      s2.onerror = () => reject(new Error("Impossible de charger jspdf-autotable"));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error("Impossible de charger jsPDF"));
    document.head.appendChild(s1);
  });
  return _pdfLoading;
}

const COULEUR_ROUGE = [204, 29, 29];
const COULEUR_ARDOISE = [45, 49, 66];
const COULEUR_GRIS = [120, 125, 140];

function fmtEuro(v) {
  return Number(v || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
}

// ── Génère le PDF du bilan complet ──────────────────────────────
// stats : retour de statsGlobalesTournee()
// secteurs : liste des secteurs
// passages : liste des passages
// logoBase64 : data URI du logo (optionnel)
// config : config de la tournée (année, objectif...)
export async function genererBilanPDF({ stats, secteurs, passages, logoBase64 = null, config = {} }) {
  await chargerJsPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const annee = config.annee || new Date().getFullYear();
  const dateEdition = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  // ── En-tête ──
  let y = 15;
  if (logoBase64) {
    try { doc.addImage(logoBase64, "PNG", 15, y, 22, 22); } catch(e) {}
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...COULEUR_ROUGE);
  doc.text("Bilan de la tournee calendriers", logoBase64 ? 42 : 15, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COULEUR_ARDOISE);
  doc.text("Amicale des Sapeurs-Pompiers de Pacy-sur-Eure", logoBase64 ? 42 : 15, y + 15);
  doc.setFontSize(9);
  doc.setTextColor(...COULEUR_GRIS);
  doc.text(`Saison ${annee}  -  Edite le ${dateEdition}`, logoBase64 ? 42 : 15, y + 21);

  y += 30;
  doc.setDrawColor(...COULEUR_ROUGE);
  doc.setLineWidth(0.8);
  doc.line(15, y, pageW - 15, y);
  y += 10;

  // ── Chiffres clés ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COULEUR_ARDOISE);
  doc.text("Chiffres cles", 15, y);
  y += 7;

  const cles = [
    ["Total collecte", fmtEuro(stats.totalCollecte)],
    ["Dont especes", fmtEuro(stats.totalEspeces)],
    ["Dont cheques", fmtEuro(stats.totalCheques)],
    ["Dont carte bancaire", fmtEuro(stats.totalCarte || 0)],
    ["Nombre de dons", String(stats.nbDons)],
    ["Foyers visites", String(stats.nbPassages)],
    ["Refus", String(stats.nbRefus)],
    ["Absents / a relancer", `${stats.nbAbsents} / ${stats.nbRelances}`],
    ["Secteurs termines", `${stats.nbSecteursTermines} / ${stats.nbSecteursTotal} (${stats.avancement}%)`]
  ];
  if (config.objectif) {
    const pctObj = Math.round((stats.totalCollecte / config.objectif) * 100);
    cles.push(["Objectif", `${fmtEuro(config.objectif)} (${pctObj}% atteint)`]);
  }

  doc.autoTable({
    startY: y,
    body: cles,
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 2, textColor: COULEUR_ARDOISE },
    columnStyles: {
      0: { cellWidth: 70, fontStyle: "normal", textColor: COULEUR_GRIS },
      1: { fontStyle: "bold" }
    },
    margin: { left: 15, right: 15 }
  });
  y = doc.lastAutoTable.finalY + 12;

  // ── Bilan par équipe ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COULEUR_ARDOISE);
  doc.text("Bilan par equipe", 15, y);
  y += 4;

  const lignesEquipes = (stats.parEquipe || [])
    .filter(eq => eq.nbPassages > 0 || eq.montant > 0)
    .map((eq, i) => [String(i + 1), eq.nom, fmtEuro(eq.montant), String(eq.nbPassages), String(eq.nbRefus || 0)]);

  if (lignesEquipes.length > 0) {
    doc.autoTable({
      startY: y + 2,
      head: [["#", "Equipe", "Collecte", "Passages", "Refus"]],
      body: lignesEquipes,
      theme: "striped",
      headStyles: { fillColor: COULEUR_ROUGE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 10 }, 2: { halign: "right", fontStyle: "bold" }, 3: { halign: "center" }, 4: { halign: "center" } },
      margin: { left: 15, right: 15 }
    });
    y = doc.lastAutoTable.finalY + 12;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...COULEUR_GRIS);
    doc.text("Aucune equipe active pour le moment.", 15, y + 8);
    y += 16;
  }

  // ── Bilan par secteur (nouvelle page si besoin) ──
  if (y > 220) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COULEUR_ARDOISE);
  doc.text("Bilan par secteur", 15, y);

  const lignesSecteurs = [...(secteurs || [])]
    .sort((a, b) => (b.totalCollecte || 0) - (a.totalCollecte || 0))
    .map(s => [
      s.nom || "",
      s.commune || "",
      s.equipNom || "-",
      fmtEuro(s.totalCollecte),
      String(s.nbFoyersVisites || 0),
      String(s.nbFoyersAbsents || 0)
    ]);

  doc.autoTable({
    startY: y + 6,
    head: [["Secteur", "Commune", "Equipe", "Collecte", "Visites", "Absents"]],
    body: lignesSecteurs,
    theme: "striped",
    headStyles: { fillColor: COULEUR_ARDOISE, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 1.8 },
    columnStyles: { 3: { halign: "right", fontStyle: "bold" }, 4: { halign: "center" }, 5: { halign: "center" } },
    margin: { left: 15, right: 15 }
  });
  y = doc.lastAutoTable.finalY + 12;

  // ── Foyers à relancer ──
  const relances = (passages || []).filter(p => p.aRelancer);
  if (relances.length > 0) {
    if (y > 230) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COULEUR_ARDOISE);
    doc.text(`Foyers a relancer (${relances.length})`, 15, y);

    const secteurMap = Object.fromEntries((secteurs || []).map(s => [s.id, s]));
    doc.autoTable({
      startY: y + 6,
      head: [["Equipe", "Secteur", "Commune", "Adresse", "Note"]],
      body: relances.map(p => {
        const s = secteurMap[p.secteurId] || {};
        return [p.equipeNom || "", s.nom || "", s.commune || "", p.adresse || "", p.note || ""];
      }),
      theme: "grid",
      headStyles: { fillColor: [234, 179, 8], textColor: [60, 40, 0], fontStyle: "bold", fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 1.8 },
      margin: { left: 15, right: 15 }
    });
  }

  // ── Pied de page sur toutes les pages ──
  const nbPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= nbPages; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...COULEUR_GRIS);
    doc.text("Amicale des Sapeurs-Pompiers de Pacy-sur-Eure  -  SDIS 27", 15, pageH - 10);
    doc.text(`Page ${i} / ${nbPages}`, pageW - 15, pageH - 10, { align: "right" });
  }

  return doc;
}

// ── Télécharge le PDF ────────────────────────────────────────────
export async function telechargerBilanPDF(params) {
  const doc = await genererBilanPDF(params);
  const annee = params.config?.annee || new Date().getFullYear();
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  doc.save(`bilan-tournee-calendriers-${annee}-${date}.pdf`);
}
