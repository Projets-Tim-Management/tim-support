# Formulaires du site vitrine — Plan & checklist

> **Objectif** : le support héberge, sert et reçoit les formulaires du site vitrine.
> Brevo est réduit à **l'envoi et au suivi des e-mails**, rien d'autre. Chaque lead
> devient traçable (canal, formulaire, page, variante A/B, campagne) et entre
> **immédiatement** dans le Kanban Opportunités, sans la latence de 24 h actuelle.
> **Statut au 04/09/2026 : étapes 1 à 9 FAITES et commitées** sur `refonte-support`
> (non poussé). Reste l'étape 10 (coupure de Brevo — attend la mise en production
> de la vitrine) et l'étape 11 (séquences post-perte — attend leur contenu et les
> textes légaux). Décisions du §2 verrouillées.

## 0. Sources

Deux documents produits par la session Claude Code du repo vitrine (`tim-front`),
hors dépôt, dans `Repo/Vitrine/` :

- `BRIEF-migration-formulaires-vers-support.md` — état des lieux, chaîne actuelle,
  contrat d'intégration attendu.
- `COMPLEMENT-champs-formulaires.md` — champs réels, relevés par lecture de l'API REST
  WordPress puis parsing des pages `sibforms.com`. **Aucune donnée ne vient de
  l'interface Brevo** : tout est mesuré.

Le complément **corrige** le brief sur trois points, et c'est le complément qui fait foi.

---

## 1. Contexte : ce qui existe déjà (audit du code)

| Élément | État actuel | Conséquence |
|---|---|---|
| Formulaires côté vitrine | **Aucun code.** Des `<iframe>` Brevo stockées dans des champs ACF WordPress | Migrer ne veut pas dire « réécrire des formulaires » : la vitrine n'en a jamais eu |
| Nombre de formulaires Brevo | **2**, pas 3 (`/contact-visio` est du Calendly) | Périmètre plus petit qu'annoncé au brief |
| Entrée des leads côté support | Cron quotidien `/api/cron/brevo-leads` → API Brevo v3 → `partner-clients` | **Le support est déjà le consommateur final.** On remplace une chaîne, on n'en branche pas une neuve |
| Latence | Jusqu'à 24 h avant qu'un lead apparaisse dans le Kanban | Disparaît avec la réception directe |
| Attribution | `source` = `manuelle` \| `site-vitrine`, rien d'autre | Impossible de dire de quel formulaire, quelle page, quelle campagne vient un lead |
| Pipeline commercial | Étapes Brevo mappées vers le Kanban, mais **« Brevo alimente à l'entrée, TIM est maître ensuite »** (`brevo-deals.ts`) | Le pipeline vit **déjà** entièrement dans Payload. Aucune conduite du changement à prévoir |
| Anti-spam | Honeypot `email_address_check` côté Brevo (confirmé par parsing) | À reproduire ; le support a déjà le motif (`api/tickets`) |
| Rate-limit | Existe : compteur persisté en base, 5/heure (`api/portal/request`) | Motif réutilisable tel quel |
| Envoi d'e-mail | `@payloadcms/email-nodemailer` sur le SMTP Brevo | **Rien à changer — c'est le rôle résiduel voulu** |
| Moteur de séquences | Existe (`modules/marketing/lib/send.ts` + cron horaire, dates programmées, marquage anti-doublon) | Réutilisable pour les séquences post-perte |
| Désinscription | **INEXISTANTE** (seul le libellé « Désinscrit » existe, pour afficher un événement Brevo) | Brique à construire avant toute séquence de prospection |
| Champs collectés jamais remontés | `COLLABORATEURS`, `FONCTION`, `PAYS`, `GENRE` | Ils ne sont pas inutilisés : **Brevo s'en sert dans l'accusé de réception**. Les capturer est une condition, pas un bonus |

---

## 2. Décisions verrouillées

Prises par l'utilisateur les 04/09/2026. **Ne pas les rouvrir sans lui.**

| # | Décision | Détail |
|---|---|---|
| 1 | **Option B** | La vitrine rend le formulaire nativement et POSTe vers une API du support. Pas d'iframe servie par le support |
| 2 | **Une seule définition de formulaire** | `demo`, 9 champs, servie partout. Le drawer **garde les 9 champs** : on décidera de le raccourcir plus tard, sur la base des statistiques. Conséquence de la décision 10 — les deux formulaires devenant identiques, deux identifiants seraient une distinction sans différence, qui dériverait en silence |
| 3 | **Champs obligatoires** | Requis : société, collaborateurs, **genre**, nom, e-mail, téléphone, besoins. Facultatifs : **fonction**, **pays** |
| 4 | **`source` = canal d'acquisition** | « Saisie manuelle », « Site vitrine — SEO », « Google Ads — SEA » (les 2 LP ne sont pas indexées, elles ne servent que les campagnes Ads) |
| 5 | **Attribution structurée, pas des tags libres** | Canal, formulaire, placement, page, variante A/B, campagne : chacun son champ, pour être croisables en statistiques |
| 6 | **Historique** | Vérifier que tous les leads Brevo ont leur fiche ; importer **en plus** les affaires « Perdue », en brouillon, avec un motif dédié « À qualifier — repris de Brevo » |
| 7 | **Calendly reste** | Pour l'instant. Le support a pourtant déjà un moteur de rendez-vous Google Calendar |
| 8 | **Pas de newsletter** | Aucun emailing de masse à prévoir |
| 9 | **Séquences post-perte en dernier** | Avec leur cadre légal. Voir §10, phase 5 |
| 10 | **Un seul accusé de réception** | Les leads des landing pages reçoivent **le même e-mail** que ceux de `/contact`. Pour cela, `besoins` et `pays` sont **ajoutés au formulaire des landing pages**, qui en était dépourvu |

---

## 3. Le partage avec Brevo

**Brevo garde** — et il ne faut surtout rien y toucher :

| Rôle | Où | Variables |
|---|---|---|
| Envoi SMTP de tout Payload | `payload.config.ts` L280-317 | `BREVO_SMTP_HOST/PORT/USER/KEY` |
| Lecture des statistiques transactionnelles (onglet « E-mails » d'un ticket et d'un parcours) | `modules/support/lib/brevo.ts` | **`BREVO_API_KEY`** |
| Réponses entrantes (Inbound Parsing) | `api/inbound-email` | `REPLY_DOMAIN`, `INBOUND_SECRET` |
| Expéditeurs vérifiés des partenaires | `getSenders`, `requestSenderVerification` | `BREVO_API_KEY` |

> ⚠️ **`BREVO_API_KEY` a deux usages, pas un.** Elle sert à l'import des leads (qui
> disparaît) **et** à la lecture des statistiques d'e-mail (qui reste). La supprimer en
> croyant achever la migration casserait l'onglet « E-mails » des tickets.

**Brevo perd** : le rendu des formulaires, la collecte, les contacts comme source du
CRM, les opportunités (deals), le pipeline, les automations.

---

## 4. Modèle de données

Trois valeurs d'enum Postgres sont ajoutées (`source`, `lossReason`) : **chacune exige
une migration** (`npm run db:migrate:create` puis `:apply` — voir `docs/COMMIT-ET-DEPLOIEMENT.md`).
Toutes les nouvelles collections doivent porter des règles d'accès conformes à `docs/RBAC-PLAN.md`.

### 4.1 `forms` — les définitions, éditables en back-office

Objectif : **créer ou modifier un formulaire ne doit plus demander de développement.**

| Champ | Type | Rôle |
|---|---|---|
| `formId` | texte, unique, indexé | Identifiant stable cité par la vitrine (`demo`) |
| `label` | texte | Nom interne |
| `defaultChannel` | select `seo` \| `sea` | Canal par défaut du formulaire, **surchargé** par un `gclid`/`utm_medium=cpc` réellement présent |
| `fields` | array | `name`, `type` (texte/email/tel/select/multi), `label`, `placeholder`, `required`, `options[]` (**libellé + valeur**), `helpText` |
| `successText` / `errorText` | texte | Messages rendus par la vitrine |
| `legalNotice` | textarea | Mention d'information au point de collecte (§7.3) |
| `active` | booléen | Un formulaire retiré cesse d'être servi sans être supprimé |

> **Stocker les libellés, jamais les codes.** Les listes Brevo postent `COLLABORATEURS=3`
> pour « 26 - 50 ». Une soumission doit être lisible sans table de correspondance.

### 4.2 `form-submissions` — ce qui arrive

| Groupe | Champs |
|---|---|
| Identité | `form` (relation), `formIdSnapshot` (le formulaire peut changer après coup) |
| Réponses | `answers` (JSON, **libellés résolus**) |
| Attribution | `sourcePagePath`, `sourcePageUrl`, `placement`, `lpSlug`, `lpVariant`, `referrer` |
| Campagne | `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `gclid`, `msclkid` |
| Technique | `ip`, `userAgent`, `sessionId`, `receivedAt` |
| Suite | `client` (relation vers l'opportunité créée), `processingStatus` |

`lpVariant` et `sourcePagePath` ne sont pas optionnels : le **même** formulaire `demo-court`
est atteignable depuis **au moins 5 contextes** (4 URL en HTTP 200 + l'override `?v=v2`).
Sans eux, l'A/B test V1 vs V2 reste non mesurable même après la migration.

### 4.3 Impacts sur l'existant

**`partner-clients`**
- `source` : passe aux 3 valeurs de la décision 4 *(enum → migration)*.
- `formSubmission` : relation, **unique** — reprend le rôle anti-doublon de `brevoDealId`.
- `brevoDealId` : **conservé en lecture**, jamais supprimé (lien vers l'historique importé).
- `collaborateurs` : nouveau champ (taille d'entreprise). Meilleur critère de qualification
  du formulaire, et pré-estimation du nombre de licences.
- `pays` : nouveau champ, facultatif.

**`client-contacts`** — `genre` (civilité) et `fonction` s'y posent ; le champ `role` existe déjà.

**`lossReason`** — ajout de `a-qualifier` « À qualifier — repris de Brevo » *(enum → migration)*.
Nécessaire parce que le hook `requireLossReason` refuse une fiche close sans motif, et
qu'un repli sur « Autre motif » polluerait les statistiques de perte.
⚠️ **Valeur temporaire** : à supprimer (entrée, enum, code d'import) une fois tout qualifié.
À redemander à l'utilisateur **à chaque PR poussée en production**.

---

## 5. Contrat d'API

### `GET /api/forms/<formId>`
Renvoie le schéma du formulaire, mis en cache. Lecture publique, aucune donnée sensible.

### `POST /api/forms/<formId>/submissions`

- **Honeypot** `email_address_check` : rempli ⇒ on répond « succès » sans rien écrire.
- **Rate-limit par IP**, sur le motif de `api/portal/request`.
- **Succès** : `{ ok: true, submission_id: "<opaque>" }`.
- **Erreur** : `{ error: "validation_error" | "rate_limited" | "server_error", errors: { <champ>: "<message>" } }`.

> 🔴 **Aucune donnée personnelle dans le corps de réponse.** La vitrine pousse la réponse
> dans le `dataLayer` : y renvoyer l'e-mail ou le téléphone les exposerait à Google.
> `submission_id` est là précisément pour réconcilier un événement GA4 avec une ligne en
> base **sans** faire transiter d'identifiant personnel.

**CORS** : `https://tim-management.co`, `https://www.tim-management.co`,
`https://tim-front.vercel.app`, le motif `^https://tim-front-[a-z0-9-]+\.vercel\.app$`
et `http://localhost:3000`. **Pas de slug d'équipe Vercel en dur** : le projet a déjà
changé de compte au moins une fois.

**À la réception**, dans la foulée de la requête : création de `partner-clients` +
`client-contacts`, rattachement au partenaire du site vitrine (`vitrinePartnerId()`,
logique conservée), repli **brouillon** si l'e-mail manque, puis les deux e-mails du §7.

---

## 6. Le formulaire

Relevé mesuré. ⚠️ Les compteurs du complément (« 8 » et « 6 » champs) contredisent ses
propres tableaux énumérés : **c'est 9 et 7**.

| # | Champ (nouveau nom) | Type | Requis | Note |
|---|---|---|---|---|
| 1 | `company_name` *(ex-`JOB_TITLE`)* | texte | oui | |
| 2 | `collaborateurs` | select | oui | |
| 3 | `fonction` | select | **non** | |
| 4 | `pays` | select | **non** | **ajouté** aux landing pages (décision 10) |
| 5 | `besoins` | multi (5 options) | oui | **ajouté** aux landing pages (décision 10) |
| 6 | `genre` | select | oui | |
| 7 | `nom` | texte | oui | |
| 8 | `email` | e-mail | oui | |
| 9 | `telephone` + indicatif | tél | oui | |

> ⚠️ **Ce que la décision 10 coûte.** Les landing pages sont des pages d'atterrissage
> **Google Ads** : chaque champ ajouté à un trafic payant se paie en taux de conversion,
> et `besoins` est un multi-select requis. S'y ajoute une contrainte physique — le hero
> de LP V1 ne loge **déjà pas** 7 champs (§12) ; il devra en loger 9. Le passage de sa
> colonne en `overflow-y: auto` n'est donc plus une option, c'est un prérequis.
> L'écran de statistiques du §8 dira si l'arbitrage était le bon : le taux de conversion
> des LP avant/après est mesurable, et réversible en une modification de back-office.

**`JOB_TITLE` n'est pas un intitulé de poste** : il est étiqueté « Quel est le nom de
votre société ? ». L'attribut standard de Brevo était détourné pour stocker une raison
sociale — d'où la ligne `if (jobTitle) return jobTitle;` de `fallbackCompanyName()`,
incompréhensible hors contexte. Renommé `company_name`.

**Options** (libellés à stocker, pas les codes) — `collaborateurs` : 1-10 · 11-25 · 26-50 ·
51-100 · 101-250 · 250-500 · +500. `fonction` : Dirigeant · Employé · Ouvrier.
`pays` : France · Belgique · Suisse · Luxembourg. `genre` : Mr · Mme.
`besoins` : Planning · Pointage · Gestion des véhicules · Gestion des chantiers ·
Gestion des documents RH.

**Message d'erreur actuel à NE PAS reproduire** : « Nous n'avons pas pu confirmer votre
inscription. Votre message a bien été envoyé. » — il se termine par la phrase de succès,
sur les deux formulaires. Un prospect qui échoue croit avoir réussi.

---

## 7. Les e-mails

### 7.1 Accusé de réception au prospect

Reprend le texte Brevo actuel, fourni par l'utilisateur. Il est bâti sur
**`genre` + `nom` + `fonction` + `company_name` + `collaborateurs`** :
« Bonjour Mme Poulit, vous êtes Employé de Capblancq GT avec entre 11 - 25 collaborateurs… »

Deux conséquences :
1. Ces champs **doivent** être capturés, sinon l'e-mail n'est pas reproductible.
2. `fonction` étant facultative (décision 3), le modèle doit **se dégrader proprement** —
   c'est déjà le comportement des e-mails de parcours (`emails.ts` L87 : repli « Bonjour, »).

**Amélioration retenue** : `besoins` est capté sur `demo-complet` mais l'e-mail actuel se
contente de « vous avez manifesté un intérêt pour les fonctionnalités de Tim ». On nomme
les besoins cochés et on **remonte les liens correspondants en tête des 7**. La donnée
existe déjà, le coût est nul — et la décision 10 la rend disponible pour **tous** les leads,
landing pages comprises.

**Les 7 liens** (fournis par l'utilisateur, sur le site vitrine) :

| Libellé de l'e-mail | URL |
|---|---|
| Pointages en temps réel | `https://tim-management.co/pointage-digital-mobile-chantier` |
| Feuilles d'heures automatiquement générées | `https://tim-management.co/feuilles-dheures-btp` |
| Gestion RH centralisée | `https://tim-management.co/employes-rh` |
| Suivi de chantier | `https://tim-management.co/suivi-chantier` |
| Planning ouvrier | `https://tim-management.co/plannings-ouvriers` |
| Planning engins et matériel | `https://tim-management.co/plannings-engins` |
| Chiffres & analytique | `https://tim-management.co/chiffre-analytique` |

**Rendez-vous** : `https://calendly.com/cpiancatelli/30min` — **téléphone** : 09 72 12 59 03.

Correspondance `besoins` → liens à remonter en tête : Pointage → pointage + feuilles
d'heures · Planning → plannings ouvriers + engins · Gestion des chantiers → suivi de
chantier · Gestion des documents RH → employés RH · Gestion des véhicules → plannings
engins.

### 7.2 Alerte interne

Objet : « Nouveau lead — Capblancq GT (Google Ads — SEA) ». Corps : société + taille,
contact (civilité, nom, fonction), e-mail et téléphone cliquables, besoins cochés,
**formulaire, page exacte, variante et campagne**, lien direct vers la fiche.
Envoi immédiat — plus de latence de 24 h.

### 7.3 Mentions légales — deux échéances, à ne pas confondre

Constat mesuré : **zéro** mention d'information, zéro consentement, zéro lien vers la
politique de confidentialité, zéro lien de désinscription sur les formulaires actuels.
Non-conformité **déjà en production**, antérieure à la migration.

| Obligation | Due quand | Échéance ici |
|---|---|---|
| **Mention d'information au point de collecte** | à la collecte | **Avec le formulaire** (phase 1). Une ligne + lien vers `/politique-confidentialite`, qui existe déjà côté vitrine |
| **Consentement / désinscription** | à l'envoi de prospection | **Avec les séquences** (phase 5) |

Reporter la première reviendrait à mettre en ligne un formulaire neuf porteur du défaut
qu'on vient de constater sur l'ancien. Les textes sont **à faire valider juridiquement** :
ce n'est pas une décision de développeur.

---

## 8. Statistiques

C'est ce qui justifie l'attribution structurée du §4.2. Écran à prévoir (jetons de
`styles/_tokens.scss`, aucune couleur en dur) :

- leads par **formulaire**, par **page**, par **canal** (SEO/SEA), par **campagne** ;
- **A/B test** V1 vs V2 des landing pages, enfin mesurable ;
- taux de perte et **motifs de perte croisés avec l'origine** — quelle page amène des
  leads qui n'aboutissent pas.

> Le comptage **côté serveur fait foi**, pas GA4 : un bloqueur de pub ou un refus de
> cookies fait taire l'événement navigateur, pas la ligne en base.

Côté vitrine, l'événement `generate_lead` est poussé **à la fois** en `gtag()` et en
`dataLayer.push()` — GTM n'est chargé que sur `/contact-visio`, GA4 en direct partout ailleurs.

---

## 9. Reprise de l'historique

1. Dernière exécution du cron en `?all=1` avant coupure.
2. **Vérification** : comparer les deals Brevo aux fiches portant un `brevoDealId`, et
   produire la liste des manquants.
3. **Import des « Perdue »** (aujourd'hui exclues de `IMPORTED_STAGES`) : statut Perdue,
   **en brouillon**, motif `a-qualifier`, pour que l'équipe reprenne chaque fiche et
   détermine comment l'affaire a été perdue.
4. `brevoDealId` conservé en lecture, définitivement.

---

## 10. Étapes d'exécution

Règle de conduite fixée par l'utilisateur le 04/09/2026 : **à la fin de chaque étape,
je lance les tests internes ET je lui demande de tester ou de visualiser** avant de
passer à la suivante. Aucune étape n'est réputée faite sur ma seule parole.

Rappels valables pour **toutes** les étapes touchant au schéma :
- dev et prod partagent la même base Supabase → **migration obligatoire**
  (`npm run db:migrate:create` / `:apply`), jamais de push automatique ;
- ne pas laisser tourner un serveur de dev sur un vieux code pendant une migration ;
- `npm run generate:types` après chaque changement de collection ;
- nouvelle collection ⇒ entrée dans `admin/nav/nav-structure.ts`, sinon elle est
  invisible dans le back-office ;
- accès conformes à `docs/RBAC-PLAN.md` ; couleurs via les jetons de `styles/_tokens.scss`.

### ✅ Étape 1 — Socle de données
Collections `forms` et `form-submissions`, accès RBAC, entrée de navigation, migration,
types. Puis un script de semis qui crée le formulaire `demo` avec ses 9 champs, libellés,
options et textes **exacts** (§6) — pour que la définition soit reproductible, pas saisie
à la main.
**Tests internes :** `npm test`, `npm run lint`, `npm run build`, `db:migrate:status`.
**À vérifier par l'utilisateur :** les deux collections apparaissent dans le menu ; le
formulaire `demo` est présent avec ses 9 champs et les bons libellés.

### ✅ Étape 2 — Schéma exposé — `GET /api/forms/demo`
Sérialisation d'une définition en schéma JSON consommable (§5), mise en cache.
**Tests internes :** test unitaire du sérialiseur — options avec libellés *et* valeurs
stables, caractère requis conforme à la décision 3, aucun champ interne exposé.
**À vérifier par l'utilisateur :** ouvrir l'URL dans un navigateur et lire le JSON.

### ✅ Étape 3 — Réception — `POST /api/forms/demo/submissions`
Validation serveur **dérivée du schéma** (jamais codée en dur), honeypot, rate-limit par
IP, secret partagé avec le proxy de la vitrine, IP/UA/horodatage, enregistrement.
**Tests internes :** champ requis manquant → `validation_error` avec le détail par champ ;
champ facultatif absent → accepté ; valeur hors options → refusée ; honeypot rempli →
réponse de succès **sans écriture** ; quota dépassé → `rate_limited` ; **aucune donnée
personnelle dans le corps de réponse** ; secret absent → refus.
**À vérifier par l'utilisateur :** une commande `curl` fournie, puis la soumission visible
en back-office avec tous ses champs.

### ✅ Étape 4 — Attribution et canal
Enregistrement du bloc d'attribution (§4.2) et résolution du canal : un `gclid` ou
`utm_medium=cpc` réellement présent **prime** sur le canal déclaré du formulaire.
**Tests internes :** table de résolution du canal, y compris les cas limites (UTM vides,
`gclid` sur un formulaire déclaré SEO, aucune campagne).
**À vérifier par l'utilisateur :** deux soumissions, l'une avec `gclid`, l'autre sans →
« Google Ads — SEA » vs « Site vitrine — SEO ».

### ✅ Étape 5 — Création immédiate de l'opportunité
`partner-clients` + `client-contacts` dans la foulée de la requête. Rattachement au
partenaire du site vitrine (`vitrinePartnerId()`), repli **brouillon** sans e-mail,
anti-doublon par `formSubmission`, `collaborateurs` et `pays` sur la fiche, `genre` et
`fonction` sur le contact, `besoins` en remarque. Migration : nouvelles valeurs de
`source`, nouveaux champs.
**Tests internes :** unitaires sur la construction de la fiche (dans l'esprit de
`tests/brevo-leads.test.ts`) — sans e-mail → brouillon ; deux envois de la même
soumission → une seule fiche ; statut initial `nouvelle` ; canal reporté sur `source`.
**À vérifier par l'utilisateur :** soumettre, puis voir la carte apparaître
**immédiatement** dans le Kanban avec son contact et ses besoins.

### ✅ Étape 6 — Les deux e-mails
Accusé de réception au prospect (§7.1) et alerte interne (§7.2), via le SMTP Brevo existant.
**Tests internes :** rendu du modèle ; **dégradation propre** quand `fonction` manque et
quand `genre` manque ; ordre des 7 liens piloté par `besoins` ; **échappement HTML** des
valeurs saisies (dans l'esprit de `tests/notify-escaping.test.ts`) ; un échec d'envoi ne
fait pas échouer la soumission.
**À vérifier par l'utilisateur :** soumettre avec sa propre adresse et lire les deux
e-mails réellement reçus.

### ✅ Étape 7 — Mention d'information au point de collecte
Texte servi par le schéma, avec lien vers `/politique-confidentialite` (§7.3).
**À vérifier par l'utilisateur :** relire et valider le texte.

### ✅ Étape 8 — Reprise de l'historique
Vérification des leads Brevo déjà importés, puis import des « Perdue » en brouillon avec
le motif `a-qualifier` (§9). Migration de l'enum `lossReason`.
**Tests internes :** mapping des étapes, motif posé, brouillon effectif, idempotence.
**À vérifier par l'utilisateur :** exécution à blanc d'abord, relecture de la liste, puis
exécution réelle et contrôle de la colonne « Perdue ».

### ✅ Étape 9 — Écran de statistiques
Leads par formulaire, page, canal, campagne ; A/B test V1 vs V2 ; motifs de perte croisés
avec l'origine (§8). Jetons de couleur, aucune couleur en dur.
**À vérifier par l'utilisateur :** lecture de l'écran sur des données réelles.

### ⏳ Étape 10 — Coupure de Brevo sur la collecte *(bloquée : attend la vitrine)*
**Seulement une fois la vitrine en production.** Suppression du cron `brevo-leads`, de
`brevo-import.ts`, `brevo-deals.ts`, de l'entrée `vercel.json` et de
`BREVO_LEADS_PARTNER_EMAIL`. **`BREVO_API_KEY` reste** (statistiques des e-mails).
`brevoDealId` reste en lecture.
**À vérifier par l'utilisateur :** l'onglet « E-mails » d'un ticket fonctionne toujours.

### ⏳ Étape 11 — Séquences post-perte et cadre légal *(bloquée : attend leur contenu)*
Déclencheurs : `lossReason = sans-reponse` ⇒ séquence « Sans retour » ; **tout autre
motif** ⇒ séquence « Marketing » (plusieurs mois). Avec **obligatoirement** : lien de
désinscription, en-tête `List-Unsubscribe`, liste de suppression alimentée par les
événements Brevo `unsubscribed` / `spam` / `hardBounces`, arrêt automatique si le prospect
répond ou si la fiche ressort de « Perdue ».
**Bloqué tant que** le contenu des deux séquences et les textes légaux validés ne sont pas
fournis.

### En parallèle, côté vitrine
Les étapes 1 à 7 ne dépendent pas de la vitrine, et **réciproquement** : la capture UTM,
le socle de champs, le rendu générique, le proxy et le correctif de hauteur de LP V1
peuvent avancer dès maintenant sur la base du contrat du §5. Seule la bascule des points
d'injection attend que l'étape 3 soit en ligne.

---

## 11. Questions ouvertes

| # | Question | Qui tranche |
|---|---|---|
| 5 | Contenu des **2 séquences** post-perte : messages, délais, textes | utilisateur (export Brevo) |
| 6 | Textes **légaux** validés juridiquement | utilisateur |

*Questions 1 à 4 tranchées le 04/09/2026 : les 7 URL et le lien Calendly sont au §7.1 ;
un seul accusé de réception pour tous les leads (décision 10) ; **aucun autre canal**
d'acquisition à prévoir — `source` s'en tient à « Saisie manuelle », « Site vitrine — SEO »
et « Google Ads — SEA ».*

---

## 12. Ce qui n'est PAS de notre ressort

Avec l'option B, **le rendu et le design des formulaires appartiennent à la vitrine.**
Le support pilote la *structure* (champs, ordre, libellés, options, validation, messages)
via le schéma du §4.1 ; la vitrine pilote les pixels. À leur transmettre :

- **Le socle de champs est à écrire de zéro** : leur design system ne contient aucun
  composant de champ. C'est le poste le plus lourd de la migration, et il est chez eux.
- **LP V1 a un défaut de hauteur déjà en production** : `lg:h-[100dvh]` +
  `lg:overflow-hidden` pour un conteneur qui demande `min-h-[800px]`. Sur 1440×900 le bas
  du formulaire est **déjà coupé**, masqué par le défilement interne de l'iframe. La
  décision 10 porte le formulaire des landing pages de 7 à **9 champs** : le passage de
  la colonne de droite en `overflow-y: auto` devient un **prérequis**, plus une option.
- **`tim-front.vercel.app` sert la production en `index, follow`** — duplicata indexable
  du site. Sans rapport avec les formulaires, à signaler au SEO.

---

## 13. Journal des écarts au plan

Ce que la mise en œuvre a appris, et qui n'était pas prévisible au cadrage.

| Constat | Conséquence |
|---|---|
| La fusion des deux formulaires (décision 10) a supprimé le moyen de distinguer SEO et SEA par le formulaire | Le canal se déduit de la visite : clic payant, puis emplacement, puis défaut — et la décision elle-même est stockée (`channelSource`) pour rester mesurable |
| Le taggage automatique de Google Ads était **déjà actif** | Le `gclid` arrive sur chaque clic payant, quelle que soit la page. La règle « landing page = SEA » n'est qu'un filet |
| Les paramètres du **modèle de suivi** n'atteignent pas la page avec le suivi en parallèle | Les UTM sont posés dans le **suffixe de l'URL finale**. Vérifié : la réécriture des LP conserve `gclid` et `utm_*` |
| Une création Payload sans `_status` explicite laisse la fiche en brouillon | Le lead serait entré en base sans apparaître dans le Kanban. `_status: "published"` est désormais explicite |
| La règle anti-doublon de l'import Brevo ne convenait pas aux formulaires | C'est la soumission qui pointe vers la fiche, jamais l'inverse. Un prospect qui revient est journalisé, pas dupliqué |
| L'audit a trouvé un lead « Nouvelle » sans fiche | Ce n'était pas un défaut : un lead récent, que le cron quotidien rattrape seul |
| Le nom de ce lead, `Contact_Ads_Pointage`, suit la convention du `Contact_WP` du brief | Confirmation : c'est une règle de nommage d'automation Brevo, pas un formulaire WordPress caché |
| La navigation n'affichait que des collections | Elle accepte désormais des liens libres vers une vue custom |
