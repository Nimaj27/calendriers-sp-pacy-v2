# Version modulaire — dépôt de test

## V3 — correctifs de production

Cette archive intègre les correctifs détaillés dans `CHANGELOG-V3.md`. Pour la partie sécurité Firebase serveur, lire impérativement `SECURITE_FIREBASE.md` avant une mise en production publique.

Cette version déploie les sources telles quelles, au lieu de les fusionner
dans un fichier unique. Objectif : ne plus faire retélécharger 733 Ko aux
équipiers à chaque correction.

## Contenu

```
index.html          point d'entrée (2,5 Ko)
manifest.json       configuration de l'application installable
sw.js                cache hors-ligne, à double niveau
css/style.css       styles
js/                  14 modules
icons/               15 icônes
build.py             secours : régénère un fichier unique
```

## Deux niveaux de cache

Le Service Worker sépare volontairement :

- **`sp-static-2`** — `geoloc.js` (données d'adresses) et `carte.js` (les polygones).
  Ces fichiers ne changent presque jamais : ils sont conservés d'une version à l'autre.
- **`sp-app-v3-2`** — le reste du code, renouvelé à chaque publication.

Concrètement, corriger un bug ne fait retélécharger que quelques kilooctets
au lieu de la totalité.

## Publier une mise à jour

1. Modifier le ou les fichiers concernés dans `js/` ou `css/`
2. Incrémenter `VERSION` dans `sw.js` (ex. `v3-2` → `v3-3`)
3. **Si `geoloc.js` ou `carte.js` change**, incrémenter aussi `CACHE_STATIC`
   (`sp-static-2` → `sp-static-3`) — sans quoi l'ancienne version reste en
   cache même après avoir changé `VERSION`, car ces deux fichiers vivent
   dans un cache séparé du reste de l'appli
4. Envoyer **tous** les fichiers modifiés en même temps, `sw.js` inclus —
   ne jamais mettre à jour `app.js` seul si `carte.js`, `geoloc.js` ou un
   autre module a changé en parallèle : des versions dépareillées entre
   modules font planter le chargement de l'appli au complet (erreur du
   type "does not provide an export named...")

### Où uploader sur GitHub

Piège fréquent : uploader depuis la racine du dépôt place le fichier à la
racine au lieu de l'écraser dans le bon dossier, et l'appli continue de
charger l'ancienne version sans erreur ni avertissement.

- `app.js`, `carte.js`, `geoloc.js` et les autres modules → dans le dossier **`js/`**
- `sw.js`, `index.html`, `manifest.json` → à la **racine** du dépôt

Avant de valider l'upload, vérifie que GitHub affiche bien un message du
type *"This will replace js/app.js"* pour chaque fichier — si ce message
n'apparaît pas, c'est que l'upload va créer un doublon au mauvais endroit
plutôt que remplacer l'existant.

## En cas de problème

`python3 build.py` régénère `index-monofichier.html`, qui regroupe tout comme
dans la version d'origine. Le renommer en `index.html` rétablit l'ancien
fonctionnement.

Si une mise à jour ne semble jamais prendre effet malgré un upload
correct, vérifier dans le navigateur (F12 → Application → Service
Workers) qu'aucune ancienne version du Service Worker ne reste active en
arrière-plan — un "Unregister" suivi d'un rechargement force une
réinstallation propre.

## Configuration Firebase

Le domaine reste `nimaj27.github.io`, déjà autorisé : aucune modification
n'est nécessaire côté Firebase. La base de données est **partagée avec la
version de production** — les saisies faites ici sont donc bien réelles.

## Secteurs — cas particuliers

Deux secteurs, **Lorey** et **Saint-Chéron**, sont des hameaux extraits de
la commune de Breuilpont plutôt que des communes officielles complètes.
Leur périmètre sur la carte est calculé automatiquement (géocodage des
rues + enveloppe convexe) plutôt que via le contour communal officiel,
puisqu'il n'existe pas de contour administratif officiel pour un hameau.
