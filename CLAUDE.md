# Calendriers SP Pacy

PWA de gestion de la tournée annuelle de calendriers de l'Amicale
des SP de Pacy-sur-Eure. 27 communes, ~54 bénévoles.

## Déploiement
- GitHub Pages : nimaj27.github.io/calendriers-sp-pacy/
- Le service worker est versionné automatiquement par la CI.
  Ne PAS bumper `sw.js` à la main.

## Backend
- Firebase projet `calendrier-pacy`, SDK v12.15.0
- Auth anonyme pour les équipiers, PIN stocké séparément
- Règles Firestore dans `firestore.rules` — toute modif du modèle
  de données doit être répercutée dedans

## Architecture
- `app.js`   : logique applicative, vues, état global `APP`
- `carte.js` : Leaflet, `POLYGONES_SECTEURS`, `PALETTE_EQUIPES`
- `geoloc.js`: `GEO_ADRESSES` (10 007 adresses BAN), `coordsRue()`
- `sw.js`    : cache offline

## Conventions
- Tout ce qui est exporté depuis carte.js/geoloc.js doit être
  ajouté au bloc d'import en tête de app.js
- Couleur d'un secteur : `secteur.couleur` prime toujours sur
  la couleur d'équipe générée
- Import CSV secteurs : upsert (lireSecteur → mettreAJourSecteur),
  jamais creerSecteur systématique

## Décisions actées
- 42 secteurs, dont Pacy 12 (Voronoï précalculés)
- Breuilpont scindé en 3 : résiduel, Lorey, Saint-Chéron
- Saint-Chéron rattaché à l'équipe Villegats pour la tournée
- Coloration des secteurs par Welsh-Powell (pas d'adjacents
  de même couleur)
