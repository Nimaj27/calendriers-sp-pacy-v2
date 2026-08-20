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
sw.js               cache hors-ligne, à double niveau
css/style.css       styles
js/                 15 modules
icons/              15 icônes
build.py            secours : régénère un fichier unique
```

## Deux niveaux de cache

Le Service Worker sépare volontairement :

- **`sp-static-1`** — `geoloc.js` (280 Ko d'adresses) et `carte.js` (les polygones).
  Ces fichiers ne changent presque jamais : ils sont conservés d'une version à l'autre.
- **`sp-app-v2-1`** — le reste du code, renouvelé à chaque publication.

Concrètement, corriger un bug ne fait retélécharger que quelques kilooctets
au lieu de la totalité.

## Publier une mise à jour

1. Modifier le ou les fichiers concernés dans `js/` ou `css/`
2. Incrémenter `VERSION` dans `sw.js` (`v2-1` → `v2-2`)
3. Envoyer les fichiers modifiés **et** `sw.js`

Si `geoloc.js` ou `carte.js` change, incrémenter aussi `CACHE_STATIC`
(`sp-static-1` → `sp-static-2`), sans quoi l'ancienne version restera en cache.

## En cas de problème

`python3 build.py` régénère `index-monofichier.html`, qui regroupe tout comme
dans la version d'origine. Le renommer en `index.html` rétablit l'ancien
fonctionnement.

## Configuration Firebase

Le domaine reste `nimaj27.github.io`, déjà autorisé : aucune modification
n'est nécessaire côté Firebase. La base de données est **partagée avec la
version de production** — les saisies faites ici sont donc bien réelles.
