# Sécurité Firebase — V3

## Important

La V3 corrige les failles côté navigateur (XSS, CSV, caches, archivage, révocation d'admins), mais le PIN à 4 chiffres reste un mécanisme d'accès léger.

Le navigateur utilise Firebase Authentication anonyme pour les équipiers. Sans backend de validation (Cloud Function / serveur), un PIN de 4 chiffres reste théoriquement testable parmi 10 000 combinaisons. Les règles Firestore déployées dans le projet Firebase restent donc la barrière de sécurité principale.

## Recommandations avant production

1. Vérifier les règles Firestore actuellement déployées dans la console Firebase.
2. Interdire toute écriture non authentifiée.
3. Réserver `/admins`, `/config` et les opérations d'administration aux comptes Google autorisés.
4. Interdire `list` sur `/pins` aux équipiers ; seul un `get` ciblé doit être possible si le fonctionnement actuel est conservé.
5. Activer Firebase App Check pour limiter les appels provenant de clients non autorisés.
6. Pour une sécurité forte, remplacer à terme la validation directe du PIN par une Cloud Function qui valide le code, applique une limitation de tentatives et délivre une session/autorisation liée à l'équipe.

## Données sensibles

Les sauvegardes JSON contiennent les données de tournée et les PIN nécessaires à une sauvegarde complète. Elles doivent être conservées dans un emplacement sécurisé et supprimées lorsqu'elles ne sont plus nécessaires.
