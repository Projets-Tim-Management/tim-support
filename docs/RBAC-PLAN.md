# RBAC & sécurité row-level — Plan & checklist

> Objectif : profils utilisateurs cloisonnés (super-admin, admin, partenaire-métier,
> partenaire-utilisateur, support) avec **aucune fuite de données entre partenaires**.
> Statut : **Phases 0 et 1 faites** (socle access, rôles, protections super-admin,
> cpiancatelli super-admin, infra migrations). Suite : Phase 2 (lien User↔Partenaire).

## ⚙️ Note outillage — `"type": "module"`
Le CLI de migration Payload ne tournait pas (projet en CommonJS + deps ESM). Corrigé en
ajoutant `"type": "module"` à `package.json`. Effets : dev server OK, `payload migrate`
OK, et des types ESM plus stricts ont révélé 6 anomalies de typage préexistantes
(routes tickets, `modules/partner/lib/partner.ts`) — corrigées par casts sûrs. Toute
commande CLI Payload se lance en chargeant l'env manuellement (le CLI ne lit pas
`.env.local`) : `node -e "process.loadEnvFile('.env.local')" ...` ou wrapper équivalent.

---

## 1. Contexte : ce qui existe déjà (audit du code)

| Élément | État actuel | Conséquence |
|---|---|---|
| Rôles (`Users.roles`) | 2 valeurs seulement : `admin`, `partner` | Pas de super-admin, support, ni distinction métier/utilisateur |
| Lien User ↔ Partenaire | **INEXISTANT** | Un user « partner » ne sait pas *quelle* fiche est la sienne. Le front matche par **email** + un cookie **client** (`tim_active_partner`) non lu côté serveur |
| Access control | Tout est `adminOnly` (admin = tout, autres = rien) ou `editorialAccess` (lecture publique) | Aucun scoping par partenaire. Un seul helper renvoie un `Where` : `isAdminOrSelf` (Users) |
| Dashboard (`admin/dashboard/data.ts`) | **100 % global** — chaque requête en `overrideAccess: true` | Exposerait tous les chiffres à un partenaire tel quel |
| Entrée dans `/admin` | `Users.access.admin = hasAdminRole` | Seuls les admins entrent. À élargir aux nouveaux rôles |
| Tickets | Aucune relation propriétaire (juste `email`/`name` texte) | Pas scopable proprement sans lien |
| Multi-tenant plugin | **Non installé** | — |
| Collections liées à un partenaire (clé de scoping) | `PartnerClients.partner`, `MissionSubmissions.partner`, `RewardOrders.partner`, `PointTransactions.partner` → tous `relationTo: partners`, indexés | ✅ La « clé tenant » existe déjà sur les données scopables |
| Fiche Partenaire | `partnerKind` = `metier` \| `utilisateur` déjà présent | Aligne le rôle user sur le type de partenaire |

**⚠️ Missions & Récompenses existent DÉJÀ** (collections `missions`, `rewards`, + `mission-submissions`, `reward-orders` côté back). Ce qui reste « à créer » = **l'expérience partenaire-utilisateur** (parcourir les missions et soumettre une preuve, parcourir/commander des récompenses), pas les collections.

---

## 2. Le verrou : lien User ↔ Partenaire

Rien ne peut être sécurisé sans un lien **explicite et indexé** entre un compte et sa fiche partenaire. Correspondance par email = fragile, à bannir pour de la sécurité.

**Décision recommandée :** ajouter sur `Users` un champ
`partner` (`relationship` → `partners`, `index: true`), **requis** dès que le rôle est un rôle partenaire, et **validé** cohérent avec `partnerKind` (hook : un user `partner-metier` doit pointer une fiche `partnerKind = metier`).

Ce champ devient la **clé de scoping** : `{ partner: { equals: user.partner } }`.

---

## 3. Modèle de rôles

| Rôle | Portée | Peut être supprimé par |
|---|---|---|
| `super-admin` | Tout. **Non supprimable** tant qu'il est le dernier super-admin. Seul à pouvoir attribuer le rôle super-admin | un autre super-admin, s'il en reste ≥1 |
| `admin` | Comme super-admin **sauf** : supprimer/rétrograder un super-admin, attribuer le rôle super-admin | super-admin ou admin |
| `partner-metier` | Sa fiche partenaire (champs limités) + ses clients + dashboard réduit à ses données | admin+ |
| `partner-utilisateur` | Sa fiche + dashboard réduit + catalogue missions (soumettre) + catalogue récompenses (commander) + son historique de points | admin+ |
| `support` | Module support (tickets) + dashboard réduit support | admin+ |

**Règles super-admin (à implémenter en dur) :**
1. `super-admin` dans les options de `roles`, **attribuable uniquement par un super-admin** (field-level access).
2. `access.delete` d'un user avec rôle super-admin ⇒ requester doit être super-admin.
3. Hook `beforeDelete` + `beforeChange` : **interdire de supprimer OU rétrograder le dernier super-admin** (compte ≥ 1 en permanence).
4. Un admin (non-super) ne peut jamais supprimer un super-admin (point 2).

---

## 4. Deux axes de sécurité (ne pas confondre)

- **Axe A — Row-level (quelles *lignes*)** : fonctions d'access renvoyant un `Where`. Un partenaire ne voit QUE `partner = user.partner`.
- **Axe B — Module-level (quelles *sections*)** : `access.read = false` + `admin.hidden` par rôle sur les collections hors périmètre.

Les deux se cumulent. Une collection cachée (B) ET filtrée (A) = double barrière.

---

## 5. Choix d'architecture : access control custom (recommandé) vs plugin multi-tenant

| Critère | Custom access (helpers `Where`) | `@payloadcms/plugin-multi-tenant` |
|---|---|---|
| Colle au modèle existant | ✅ la clé `partner` existe déjà partout | ❌ impose un champ/collection `tenant`, restructuration |
| Filtrage auto (anti-oubli) | ⚠️ à couvrir collection par collection | ✅ automatique |
| Compatible nav/dashboard/PartnerSwitcher custom | ✅ | ⚠️ frictions avec l'UI custom |
| Axe B (module/support) & règles super-admin fines | ✅ contrôle total | ⚠️ hors périmètre du plugin |
| Effort de migration | Faible | Élevé |

**Recommandation : custom access control**, en compensant le risque « anti-oubli » du plugin par :
- une posture **deny-by-default** (helper `false` de base, chaque collection accorde explicitement) ;
- des helpers **centralisés et réutilisés** (une seule source de vérité) ;
- une **suite de tests d'access control** automatisée (le filet qui remplace la garantie du plugin).

---

## 6. Matrice d'accès (collection × rôle)

C=create R=read U=update D=delete · **(own)** = scopé `partner = user.partner` · — = caché (axe B)

| Collection | super-admin | admin | partner-metier | partner-utilisateur | support |
|---|---|---|---|---|---|
| Users | CRUD | CRUD¹ | R (self) | R (self) | R (self) |
| Partners | CRUD | CRUD | R·U **(own)**² | R·U **(own)**² | — |
| PartnerClients | CRUD | CRUD | CRUD **(own)**³ | — | — |
| Missions | CRUD | CRUD | — | **R** (catalogue) | — |
| MissionSubmissions | CRUD | CRUD | — | C · R **(own)** | — |
| Rewards | CRUD | CRUD | — | **R** (catalogue) | — |
| RewardOrders | CRUD | CRUD | — | C · R **(own)** | — |
| PointTransactions | CRUD | CRUD | — | **R (own)** (lecture seule) | — |
| Tickets | CRUD | CRUD | —⁴ | —⁴ | R · U (tous)⁵ |
| Éditorial (Features, FeatureCategories, Platforms, Parcours) | CRUD | CRUD | — | — | — |
| Media | CRUD | CRUD | C · R⁶ | C · R⁶ | R⁶ |

¹ admin : pas de D d'un super-admin, pas d'attribution du rôle super-admin.
² champs internes masqués (voir §7). Pas de D.
³ à confirmer : gestion complète des clients ou lecture seule (décision §11).
⁴ les partenaires créent des tickets via le **formulaire front**, pas dans l'admin.
⁵ support : périmètre tickets. À affiner : tous les tickets ou par `service` ?
⁶ Media n'a pas de propriétaire → lecture authentifiée, création par back-office, U/D admin. **Point de vigilance** (URLs Blob publiques) — voir §9.

---

## 7. Field-level access (crucial pour les partenaires)

Un partenaire voit sa fiche **mais pas les champs internes TIM**. Masquer en lecture pour les rôles partenaire :
`accountManager`, `tier`, `acquisitionSource`, `commissionDuration`, `partnershipModel`, `notes`, `contractNotes`, `internalNotes`, `tags`, coordonnées de suivi commercial.

**Exception `commissionRate` (décision du 03/08/2026)** : le taux reversé au partenaire lui est **visible en lecture** (fiche + tuile « Commission / mois »), mais **modifiable par un admin uniquement**. Le barème qui le produit (`partnershipModel`) et la durée restent internes.

Champs éditables par le partenaire : identité/contact de base, avatar. Le reste en lecture seule ou masqué.

---

## 8. Dashboard réduit par rôle ✅ (Phase 6)
Fait : `DashboardView` branche par rôle. Admin = global (getDashboardData). Support = `getSupportMetrics` (ne lit QUE les tickets) via `<SupportSection>` (extrait, partagé avec l'admin → pas de duplication). Partenaire = `getPartnerMetrics` (scopé `partner = user.partner`, 4 requêtes // ) via `<PartnerSection>` (métier → clients/CA ; utilisateur → points/missions/récompenses + accès catalogues). Aucune donnée globale pour les non-admins.

## 8-bis. Dashboard réduit par rôle (spec initiale)

- `admin/dashboard/data.ts` : arrêter le `overrideAccess: true` global pour les non-admins ; router vers une fonction de données **scopée** (`partner = user.partner`) ou passer les requêtes en `overrideAccess: false` + `req`.
- Une **vue dashboard par rôle** (super-admin/admin = complet ; partenaire = ses KPI ; support = KPI support).
- ⚠️ **UX/UI d'abord** : chaque dashboard doit être clair et pensé pour le rôle, pas un dashboard admin amputé.

---

## 9. Durcissement sécurité

- [ ] **Deny-by-default** : baseline `false`, accord explicite par collection.
- [ ] Field-level access sur `roles` (déjà) + champs internes partenaire (§7).
- [ ] Audit de **tous** les `overrideAccess: true` (dashboard, `onInit`, list views) : garder uniquement là où l'appelant est forcément admin.
- [ ] `Users.access.admin` élargi aux rôles back-office (super-admin, admin, partner-*, support) via `hasBackofficeRole`.
- [ ] Nav (`CustomNav` serveur) **filtrée par rôle** : ne construire que les groupes autorisés.
- [ ] `admin.hidden` par rôle sur chaque collection hors périmètre.
- [ ] PartnerSwitcher masqué pour les rôles partenaire/support (pas de bascule).
- [ ] **Supabase Data API / clé anon** : confirmer qu'elle est désactivée (risque RLS déjà signalé) — les données ne doivent transiter que par Payload.
- [ ] Media : envisager `disablePayloadAccessControl` seulement pour l'éditorial public ; garder les pièces jointes sensibles derrière l'access control.
- [ ] Revue des routes `/payload-api` (REST/GraphQL) : l'access control s'y applique par défaut — vérifier qu'aucun endpoint custom ne bypasse.

---

## 10. Tests (le filet de sécurité)

Suite d'intégration : pour **chaque rôle**, seed un user + (pour les partenaires) 2 fiches partenaires distinctes, puis asserter :
- [ ] chaque collection : peut / ne peut pas C·R·U·D selon la matrice §6 ;
- [ ] **isolation** : un partner-metier A ne lit JAMAIS une ligne du partenaire B (clients, missions, points, orders) ;
- [ ] un partenaire ne voit pas les champs internes (§7) ;
- [ ] escalade impossible : un non-super ne peut pas s'attribuer super-admin ni admin ;
- [ ] le dernier super-admin ne peut pas être supprimé/rétrogradé ;
- [ ] le dashboard scopé ne renvoie que les données du rôle.

---

## 11. Checklist d'implémentation (phasée)

### Phase 0 — Fondations & sécurité de base
- [x] Infra migrations : `push:false` + `migrationDir` dans `payload.config.ts`. CLI réparé via `"type":"module"`.
- [x] Helper `denyAll` + refonte de `core/access.ts` en helpers centralisés.
- [ ] Squelette de la suite de tests d'access control. *(à faire)*
- [ ] Étape `payload migrate` au build Vercel *(à faire, quand une migration existera)*.

### Phase 1 — Rôles & super-admin ✅
- [x] Étendre `Users.roles` : `super-admin`, `admin`, `partner-metier`, `partner-utilisateur`, `support` (enum déjà en base).
- [x] Field-level access : `roles` réservé aux admins ; rôle `super-admin` attribuable par super-admin uniquement (`core/hooks/superAdmin.ts`, avec exception bootstrap).
- [x] Règles de protection super-admin (delete/downgrade du dernier interdit).
- [x] **`cpiancatelli@tim-management.co` est super-admin** (appliqué en base, vérifié).

### Phase 2 — Lien User ↔ Partenaire ✅
- [x] Champ `Users.partner` (relationship, indexé), field-access admin-only, visible pour rôles partenaire.
- [x] Validation cohérence : fiche requise pour un rôle partenaire + `partnerKind` doit matcher (métier/utilisateur).
- [x] Migration baseline `20260729_130116_initial` adoptée (colonne `partner_id` + FK + index en base, migration enregistrée). `migrate:status` = Ran: Yes.
- [ ] Backfill : N/A pour l'instant (aucun user partenaire — seul cpiancatelli existe).

### Phase 3 — Row-level access ✅
- [x] Helpers : `ownPartnerRecord`, `partnerScoped`/`metierScoped`/`utilisateurScoped` (via `scopedBy`), `isAdminOrMetier`, `isAdminOrUtilisateur`, `canReadCatalog`, `canSupport`.
- [x] Hook anti-usurpation `enforcePartnerField` (force le champ `partner` sur la fiche du user).
- [x] Matrice §6 appliquée : Partners (`ownPartnerRecord`), PartnerClients (métier, CRUD scopé), Missions/Rewards (catalogue lecture utilisateur), MissionSubmissions/RewardOrders (utilisateur, C·R scopé + enforce), PointTransactions (utilisateur lecture seule), Tickets (support), Media (lecture publique / upload back-office). Éditorial inchangé (lecture publique). Users inchangé (self).
- Note : ces règles ne s'appliquent qu'aux accès avec `user` sans `overrideAccess` → **dormantes tant que partenaires/support ne se connectent pas (Phase 5)** ; le front et le dashboard utilisent `overrideAccess` → aucune régression.

### Phase 4 — Field-level partenaire ✅
- [x] Helper `protectInternalFields` (Partners.ts) : applique récursivement un field-access admin-only (lecture + écriture) aux champs internes TIM listés dans `INTERNAL_FIELDS` (partnershipModel, commissionDuration, contractNotes, joinedAt, acquisitionSource, tier, accountManager, tags, notes), y compris dans les rows/onglets. Un partenaire consultant SA fiche ne les voit pas.
- [x] Seconde liste `PARTNER_READONLY_FIELDS` (commissionRate) : lecture ouverte au partenaire, écriture admin-only — voir l'exception §7.
- Note : les documents/dates de contrat du partenaire restent visibles (sa propre info) ; seuls le suivi commercial interne et le barème (modèle + durée) sont masqués.

### Phase 5 — Accès module & UI ✅
- [x] `Users.access.admin` → `hasBackofficeRole` (partenaires/support entrent dans /admin).
- [x] `admin.hidden` par rôle, centralisé dans `payload.config.ts` (`ROLE_NAV_HIDDEN` + `applyRoleNavVisibility`) — pas de duplication.
- [x] Nav filtrée par rôle : automatique (CustomNav respecte `visibleEntities`, qui applique `admin.hidden`).
- [x] Top bar par rôle (`PartnerSwitcher`) : switcher masqué sauf admin, cloche tickets masquée sauf admin/support ; collapse + compte pour tous.
- [x] Dashboard gardé : un non-admin ne voit PAS les données globales (accueil neutre en attendant les dashboards scopés Phase 6).
- ⚠️ Test end-to-end à faire avec un vrai user partenaire/support (aucun n'existe encore) — voir Phase 9.

### Phase 6 — Dashboards réduits
- [ ] Données scopées par rôle + vues dédiées (UX soignée).

### Phase 7 — Expérience partenaire-utilisateur
- [x] Vue « Missions à réaliser » : `MissionsCatalog` (beforeListTable sur `missions`, rendu pour partner-utilisateur) — catalogue de cartes, soumission de preuve (note + image → média) → crée une `mission-submission` « pending ». Le tableau standard est masqué pour ce rôle (`.tim-catalog-mode`). `partnerField` a un `defaultValue` = fiche du compte. Le crédit des points reste à la validation admin (hook existant).
- [x] Vue « Récompenses » : `RewardsCatalog` (beforeListTable sur `rewards`) — solde de points + cartes (image, coût, stock), bouton « Commander » désactivé si solde insuffisant/épuisé. **Économie sécurisée** : la commande passe par `POST /api/partner/redeem` (auth Payload + rôle) → `redeemRewardForPartner` (check solde + débit ledger + création commande + rollback). La création brute de `reward-orders` est passée en **admin-only** (`utilisateurReadonlyAccess`) → impossible de commander sans débit (exploit fermé).

### Phase 8 — Support
- [ ] Vue support scopée (tickets), dashboard support.

### Phase 9 — Durcissement & tests
- [ ] Compléter §9 + faire passer toute la suite §10 au vert.

### Phase 10 — Migration & déploiement
- [ ] Migration schéma générée et testée.
- [ ] Déploiement selon la procédure prod (accord explicite, base partagée) — cf. mémoire.

---

## 12. Décisions — VERROUILLÉES (2026-07-29)
1. **Point d'accès** : ✅ même `/admin` avec vue restreinte scopée par rôle.
2. **Enforcement** : ✅ access control **custom** (helpers `Where` centralisés + deny-by-default + tests).
3. **Migrations** : ✅ vraies migrations Payload dès maintenant.
4. **Partner-Métier / clients** : ✅ gestion complète **CRUD** (scopée à sa fiche).

### ⚠️ Réserve base partagée
Dev et prod partagent la même base Supabase. Appliquer une migration en dev la joue **aussi sur la prod**. Les migrations évitent les DROP surprises, mais **aucun `payload migrate` ne sera lancé sur la base sans accord explicite**. Recommandation de suivi : provisionner une **base dev séparée** (voir [[db-partagee-push-destructif]]).
