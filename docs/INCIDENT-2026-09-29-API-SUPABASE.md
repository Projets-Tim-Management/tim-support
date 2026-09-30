# Incident — base exposée à l'API Supabase (29/09/2026)

## En bref

Le schéma `public` de la base du support (projet Supabase `hbqaarssotgmpbwoqvxj`,
partagé par la production et le développement) était ouvert, en lecture **et en
écriture**, aux rôles de l'API Supabase (`anon`, `authenticated`), sans RLS.
Fermé le 29/09/2026 par la migration `20260929_200000_fermer_api_supabase`.
Aucune trace d'accès trouvée dans la base ; **les journaux de l'API Supabase
restent à vérifier** (voir la fin).

## Détection

Alertes Supabase « rls_disabled_in_public » et « sensitive_columns_exposed ».
Le tableau de bord Supabase était inaccessible : tout a été constaté et corrigé
par une connexion directe à la base.

## Cause

Le support n'utilise pas l'API Supabase (PostgREST, GraphQL) : Payload se
connecte en direct, rôle `postgres`. Mais les réglages par défaut du projet
Supabase donnent aux rôles de l'API tous les droits sur les tables du schéma
`public`, et Payload crée ses tables sans activer RLS. Chaque table créée depuis
la mise en place du projet était donc lisible et modifiable par quiconque
détenait la clé `anon` du projet.

## Exposition constatée (avant correction)

- **131 tables** du schéma `public`, soit toute la base du support (comptes,
  fiches clients, partenaires, formulaires, contrats, e-mails, publicité…).
- Droits de `anon` et `authenticated` : `SELECT`, `INSERT`, `UPDATE`, `DELETE`,
  `TRUNCATE`, `REFERENCES`, `TRIGGER` sur chaque table ; `USAGE` sur les 89 séquences.
- RLS désactivée sur les 131 tables.
- Droits par défaut : toute nouvelle table leur était ouverte.
- Preuve, en lecture seule et annulée : sous le rôle `anon`, les comptes
  utilisateurs et les fiches clients étaient lisibles.
- L'API REST du projet répondait (`/rest/v1/`, HTTP 401 sans clé) : une clé
  `anon` suffisait pour lire et modifier.

**Ce qui limitait le risque** : la clé `anon` n'est utilisée par aucune
application du support ; elle n'est ni dans le code, ni dans les variables
d'environnement, ni dans une page publique.

## Vérifications faites

- La base est bien celle du support (référence du projet dans la chaîne de
  connexion, sans afficher de secret).
- Payload se connecte en `postgres` : propriétaire des 131 tables, `BYPASSRLS`.
  Activer RLS sans `FORCE` ne le touche pas.
- Aucune dépendance `@supabase`, aucune clé, aucun appel `rest/v1` dans le code.
- **Statistiques de requêtes de la base (`pg_stat_statements`, depuis le
  24/07/2026)** : aucune requête exécutée sous `anon` ni `authenticated`. Le rôle
  `authenticator` (PostgREST) n'a fait que recharger son cache de schéma, sans
  lire aucune table. Rassurant, pas une preuve absolue : ces statistiques gardent
  un nombre limité de requêtes distinctes et ne remontent pas avant le 24/07.

## Correction (appliquée le 29/09/2026, dump vérifié avant)

Migration `20260929_200000_fermer_api_supabase` :

- `REVOKE ALL` sur toutes les tables, séquences et fonctions du schéma `public`
  pour `anon` et `authenticated`, et `REVOKE USAGE` sur le schéma ;
- droits par défaut de `postgres` : plus rien d'ouvert à ces rôles sur les
  futurs objets ;
- RLS activée sur toutes les tables, sans politique, sans `FORCE`.

Contrôles après application :

- sous `anon` et `authenticated`, lecture et écriture refusées
  (« permission denied ») sur `users`, `partner_clients`, `ad_campaigns`,
  `form_submissions` ; aucun droit restant sur les tables ; RLS active sur 131/131 ;
- Payload : lecture de fiches clients, de comptes et d'un réglage global ;
  écriture (création, modification) puis suppression d'une ligne de test ;
- la production répond normalement (pages et API qui lisent la base).

## Ce qui empêche le retour du problème

- `npm run db:security` (scripts/db-security.mjs) : échoue si un objet du schéma
  `public` est accessible à `anon`/`authenticated`, si une table n'a pas RLS, ou
  si un droit par défaut les rouvre. Il tourne à la fin de chaque
  `db:migrate:apply` et à chaque `db:migrate:status`.
- Chaque migration appliquée par `db:migrate:apply` active RLS sur les tables
  qu'elle crée, dans sa propre transaction.

## Reste ouvert

1. **Usage du schéma par PUBLIC — exception acceptée (décision du 30/09/2026).**
   Postgres accorde par défaut l'usage du schéma `public` à tous les rôles
   (PUBLIC) : `anon` et `authenticated` en héritent. Il ne donne accès à aucune
   table (plus aucun droit, RLS partout) ni à aucune fonction (aucune dans le
   schéma ; une fonction ouverte à PUBLIC serait signalée). Le retirer
   (`REVOKE USAGE ON SCHEMA public FROM PUBLIC`) risquerait de gêner des rôles
   internes de Supabase : **on ne le retire pas**. L'exception est inscrite dans
   `scripts/db-security.mjs`, avec sa justification ; le contrôle l'affiche à
   chaque passage sans la compter, et affiche « 0 écart non justifié ». Elle ne
   couvre que l'héritage de PUBLIC : un droit explicite de `anon` ou
   `authenticated` sur le schéma reste un écart. **Toute nouvelle exception doit
   être validée par Charlie.**
2. **Journaux de l'API Supabase, à consulter dès que le tableau de bord est
   accessible** : « API logs » (requêtes `/rest/v1/` et `/graphql/v1/`) et
   « Postgres logs » filtrés sur les rôles `anon` et `authenticated`, sur toute
   la durée de rétention. Toute requête sur une table du schéma `public` avant le
   29/09/2026 est à examiner (table, date, adresse IP).
3. **Clé `anon`** : si les journaux montrent un accès, faire tourner les clés
   JWT du projet ; sinon, rien à faire (elle n'ouvre plus rien).
4. **`service_role`** garde tous les droits, par conception de Supabase ; sa clé
   n'est utilisée par rien dans le support. À ne jamais placer dans un client.
