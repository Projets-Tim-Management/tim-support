# Parcours « Formation » — plan

Décisions de l'utilisateur (01/10/2026) :

- **3ᵉ parcours, facultatif** (clé `formation`), à côté de la phase de test et de la mise en production.
  Il n'existe que si l'entreprise a une formation (payée **ou offerte**).
- **Pas de Qualiopi / OPCO** : ni convention, ni émargement signé réglementaire, ni évaluation à froid.
- **Formateur : l'équipe TIM ou le partenaire**, au choix, **journée par journée**.
- **Ouverture manuelle** : bouton « Ouvrir un parcours formation » sur la fiche, et case
  « Formation incluse » dans la modale de passage « En signature ». Aucune ligne de devis ne permet de
  le constater automatiquement.
- **Ouvrable à tout moment**, mais logiquement **après « Compte de production activé »** : on avertit
  sans bloquer si la mise en production n'est pas terminée.
- **TIM fixe les dates** (pas de réservation par le client).
- **Pas de suivi de facturation ni de frais de déplacement** pour l'instant.
- **Deux niveaux : journées → séances.** Une journée (sur place ou à distance) contient une ou
  plusieurs séances (groupes de profils).
- **Remise des accès au choix** : par le formateur pendant la séance, ou par le client avant.
- **Mémo « Bien démarrer » généré** depuis les parcours d'apprentissage éditoriaux, par profil.
- **Pas encore de programme type** : on en génère un brouillon depuis les parcours éditoriaux, que TIM
  ajuste dans le modèle.

## Principe

Le parcours ne change **pas** le statut de la fiche (pas de colonne Kanban) : la fiche reste
« En signature » ou « Gagnée », avec un encart « Formation » dans sa colonne de droite. Il coexiste
avec les autres parcours.

**Module à part** (`modules/training`), et non un 3ᵉ modèle de `journey-runs` : une vingtaine
d'endroits y lisent « pas une mise en production, donc un test » (statut de la fiche, e-mails
programmés, agenda, tableau de bord, assistant) — une formation glissée là repasserait une fiche
« En test ». La formation d'un client est une ligne de `trainings` (une seule ouverte par client) ;
ses étapes seront **calculées** depuis les faits (journées, séances, envois), pas stockées.

### Journées et séances

Collections dédiées (requêtables par formateur et par date pour l'agenda), partenaire toujours déduit
du client comme pour les parcours.

**`training-days`** — une journée d'intervention :

| Champ | Contenu |
|---|---|
| `run`, `client`, `partner` | rattachement |
| `date` | jour, fixé par TIM |
| `mode` | `sur-place` / `distance` |
| `location` / `link` | adresse + consignes (sur place) ; lien visio (à distance) |
| `trainerType` / `trainer` | `tim` ou `partenaire` + l'utilisateur qui forme |
| `checklist[]` | logistique : salle, vidéoprojecteur, wifi, appli installée… (sur place) ; lien testé, partage d'écran, appli installée (à distance) |

**`training-sessions`** — une séance dans la journée :

| Champ | Contenu |
|---|---|
| `day` | journée parente (date, mode, formateur hérités) |
| `order`, `startTime`, `endTime` | rang dans le plan et horaires |
| `profiles[]` | `admin`, `conducteur`, `chefChantier`, `chefEquipe`, `compagnon` (clés de `pricing.ts`) |
| `participants[]` | utilisateurs TIM du client (`client-contacts` : profil de licence + mot de passe), filtrés sur les profils de la séance |
| `accessDelivery` | `formateur` (remis pendant la séance) / `client` (distribués avant) — valeur par défaut au niveau du parcours, modifiable par séance |
| `attendance[]` | présents cochés à l'émargement |
| `status` | `planifiee` / `realisee` / `annulee` |

Formules prêtes à l'emploi (prérempli modifiable, à partir des profils qui ont des licences sur la
fiche) : « Admin seul », « Admin + CDT, puis CDC », « Admin, puis CDT, puis CDC + chefs d'équipe »,
« Sur mesure ».

Garde-fou d'ordre : **avertissement** (pas de blocage) si une séance est datée avant une séance de rang
inférieur (ex. CDC avant l'admin qui paramètre).

## Contenu de formation

### Programme par profil (dans le modèle `formation`)

Pas de programme existant : le modèle porte un **programme par profil** (modules ordonnés + durée
indicative), **prérempli depuis le parcours éditorial du profil** (`parcours`, features ordonnées) et
modifiable par TIM. Le programme d'une séance assemble ceux de ses profils dans les horaires de la
séance. Profils sans parcours éditorial (chef d'équipe) : repli sur le plus proche (chef de chantier),
à confirmer.

### Kit de séance — « Imprimer le kit » (page d'impression dédiée, comme les fiches d'accès)

| Document | Contenu |
|---|---|
| Fiches d'identifiants | les fiches existantes (`AccessDelivery`), **filtrées sur les participants** ; seulement si la remise est « formateur » |
| Mémo « Bien démarrer » (par profil) | recto-verso généré : installer l'appli (QR stores), se connecter, mot de passe oublié, les gestes essentiels du profil, chacun avec un QR vers sa page du site support |
| Programme | déroulé horaire de la séance |
| Feuille de présence | support papier simple (non réglementaire), reportée ensuite à l'émargement |

À distance : programme + mémo en PDF dans la convocation, **jamais les mots de passe**.

## Étapes du parcours

Étapes de cadrage à **clés fixes** (dans `modules/training/lib`) ; lignes de journée/séance
**dynamiques**. Toutes calculées depuis les collections, jamais cochées à la main hors émargement.

| Quand | Étape | Qui | Comment elle se coche (cf. « validation = geste réel ») |
|---|---|---|---|
| — | `plan-formation` — Plan défini | TIM | constat : au moins une séance |
| — | `participants` — Participants désignés | TIM / partenaire | constat : chaque séance a ≥ 1 participant |
| — | `dates` — Dates fixées | TIM | constat : toutes les journées sont datées |
| J-7 | `convocations` — Convocations envoyées | système | e-mail aux participants + référent (programme, lieu/lien, prérequis, mémo PDF), coché à l'envoi |
| J-2 | `acces` — Accès prêts | TIM | constat : mot de passe généré pour chaque participant ; sinon renvoi vers la préparation des accès |
| J-1 | rappel formateur | système | e-mail : check-list + kit à imprimer (sur place) |
| J | `remise-acces-<séance>` — Accès remis | formateur ou client | **le geste coche** : impression du kit ou envoi individuel (formateur), premier accès transmis depuis l'espace client (client) ; d'office si les participants avaient déjà leurs accès |
| J | `seance-<id>` — Séance réalisée | formateur | **l'émargement est le geste** ; pas avant le jour J |
| J+1 | récapitulatif aux présents | système | e-mail : mémo PDF, liens support, mot de passe oublié ; coché à l'envoi |

Le parcours passe **Terminé** quand toutes les séances non annulées sont réalisées.

Droits : seul TIM crée le plan, fixe les dates et choisit le formateur. Le partenaire voit les journées
de ses clients ; il remet les accès et émarge celles dont il est le formateur.

## Étapes de réalisation

1. ✅ **Données** (01/10/2026) — collections `trainings`, `training-days`, `training-sessions` ; global
   Système → Formation (programme par profil semé depuis les parcours éditoriaux) ; ouverture (encart
   « Formation » de la fiche + case « Formation incluse » du modal « En signature », admin seulement) ;
   suppression en cascade. Migration `20261001_071406_formation_socle` appliquée.
2. ✅ **Plan de formation** (01/10/2026) — écran plein écran ouvert depuis l'encart (« Construire /
   Modifier / Voir le plan ») : formules (Admin seul ; Admin + conducteurs puis chefs de chantier ; un
   groupe par profil ; sur mesure), journées (date, sur place / à distance, lieu ou lien, formateur TIM
   ou partenaire), créneaux (horaires, profils, participants cochés parmi les contacts, remise des
   accès), enregistrement immédiat, étapes constatées et points d'attention. Lecture seule pour le
   partenaire et pour une formation close. Nom du formateur recopié sur la journée (le partenaire ne lit
   pas les comptes TIM) ; formateur vérifié contre son type côté serveur.
3. **Kit de séance** — page d'impression (fiches filtrées, mémo par profil, programme, feuille de
   présence) + PDF pour la distance.
4. **Agenda et e-mails** — événement de calendrier par journée (lien visio à distance), convocation J-7,
   rappel formateur J-1, récapitulatif J+1, rappels dans `partner-steps`.
5. **Remise des accès et émargement** — constats de remise, validation par les présents cochés,
   clôture du parcours.
6. **Plus tard, à confirmer** — attestation PDF par participant, questionnaire de satisfaction,
   vue des journées dans l'espace client.
