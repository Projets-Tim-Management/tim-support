# Publicité pilotée par agents — Plan & décisions

> Objectif : **piloter les campagnes payantes depuis le back-office**, avec des agents
> IA qui écrivent les annonces, produisent les créas (image, vidéo, motion), lisent les
> résultats et ajustent les budgets — pour obtenir des **leads qui signent**, pas
> seulement des leads pas chers.
> Aujourd'hui **Meta** (Facebook / Instagram). Demain **Google Ads** et **ChatGPT Ads**,
> sans refonte : c'est la contrainte qui dicte l'architecture.
> Statut : **décisions validées le 29/09/2026** (D1 à D11). Phase 0 en cours sur la
> branche `publicite`.

---

## 0. Identifiants Meta de TIM (29/09/2026)

Ce ne sont pas des secrets : ils désignent les objets, ils n'y donnent pas accès.

⚠️ **État au 29/09/2026 — rien à coder, à suivre :**
- L'**annonceur / payeur par défaut** du compte publicitaire est encore le **profil
  personnel** de Charlie : la vérification au nom de **LC DEV** a échoué, elle est
  relancée. À corriger avant de dépenser à l'échelle (factures, mentions de
  l'annonceur sur les publicités).
- Le **portefeuille business n'est pas encore vérifié** : Meta bloque la création de
  l'utilisateur système tant qu'il ne l'est pas. Le module est en production sans
  compte connecté ; la connexion (§9 bis, étape 2) attend le jeton.

| Objet | Identifiant | À savoir |
|---|---|---|
| Portefeuille business Tim Management | `3355241681427676` | Là où se crée l'utilisateur système (D11) |
| **Compte publicitaire** | **`act_211325410243618`** | **Le seul à connecter pour TIM.** Deux autres comptes publicitaires au nom de Charlie sont visibles depuis son profil : à **ignorer** (et refusés par `META_ALLOWED_AD_ACCOUNTS`) |
| Jeu de données / pixel (Conversions API, phase 1) | `695680415425351` | Le seul relié au compte publicitaire. Deux autres pixels existent dans le portefeuille : **ne pas les utiliser** |
| Page Facebook | `113709758267544` | |
| Instagram @tim.management.co | `17841457267166708` | |

---

## 1. Ce qui existe déjà et qu'on réutilise

| Besoin | Déjà dans le projet | Ce qu'on en fait |
|---|---|---|
| Écran de pilotage | `admin/dashboard` (StatTile, KeyFigures, charts recharts), `modules/analytics/admin` | Même composants pour le tableau de bord Publicité et la page Analyses › Publicité |
| Connexions externes | `core/lib/support-connections.ts` + écran « Connexions du support » | + Meta, Google Ads, OpenAI Ads, Runway (clés d'application) |
| Jetons OAuth chiffrés | `core/lib/secrets.ts` (AES-256-GCM), patron `calendar-connections` | Jeton de chaque compte publicitaire connecté |
| Plafond de dépense IA | `core/lib/ai-budget.ts` (€/jour persisté) | Étendu : tarifs par modèle, plafond par campagne et par agent |
| Tâches planifiées | `vercel.json` (crons) | `ads-sync`, `ads-agents`, `ads-conversions` |
| Appels Claude | `@anthropic-ai/sdk` | Boucle agent + outils (tool use) |
| Stockage des fichiers | Vercel Blob, collection `media` | Créas générées |
| Canal d'acquisition | `CHANNELS` (forms), « Provenance » (`partner-clients`), la correspondance de l'un à l'autre (`to-opportunity`) et les libellés du pipeline : quatre copies | Un registre unique `core/lib/channels.ts` (D7), + Meta Ads |
| Conversion par canal | `modules/analytics/lib/acquisition.ts` (lead → fiche → gagnée) | La même chaîne sert de **signal d'optimisation** renvoyé aux régies (D6) |

---

## 2. Décisions (validées le 29/09/2026)

| # | Décision | Conséquence |
|---|---|---|
| D1 | **Un module `modules/ads`**, groupe de nav **« Publicité »**, admin seul | Isolé du reste : ses collections, ses vues, ses crons. Rien du support ne dépend de lui |
| D2 | **Une régie = un adaptateur** derrière une interface commune `AdPlatform` (§5) | Le reste du module (agents, écrans, garde-fous) ne connaît **aucune** régie. Ajouter Google Ads = écrire un adaptateur et une entrée de registre |
| D3 | **La régie se stocke en texte validé par le registre**, pas en enum Postgres | Ajouter une régie ne demande **aucune migration** (même raisonnement que l'effectif en texte sur `partner-clients`). Le type `key` de `AdPlatform` se **dérive** du registre des régies, il n'est pas écrit en dur. ⚠️ Cela ne vaut **pas** pour les canaux d'acquisition : `channel` (soumission, formulaire) et `source` (opportunité) sont des `select`, donc des enums — chaque canal ajouté coûte une migration additive (`ALTER TYPE … ADD VALUE`), et c'est voulu (liste fermée, décision du 04/09/2026) |
| D4 | **Les agents n'écrivent jamais directement chez la régie.** Ils *proposent* ; un exécutant applique | Toute action passe par : garde-fous (code) → décision journalisée → exécution. Le MCP officiel de Meta reste un outil d'exploration à la main, pas le chemin de production |
| D5 | **Trois niveaux d'autonomie par campagne** : `observer` · `proposer` (défaut) · `autonome` | `observer` = rapport seul. `proposer` = tout passe par « À valider ». `autonome` = exécute seul **sous** les garde-fous, et ce qui les dépasse repasse en validation |
| D6 | **On optimise sur la fiche, pas sur le formulaire** | Un lead qualifié, un test démarré, un contrat signé sont renvoyés à la régie (Meta Conversions API, conversions hors ligne Google, Conversions API OpenAI). Sinon l'algorithme apprend à trouver des leads bon marché qui ne signent pas |
| D7 | **Un registre unique des canaux** (`core/lib/channels.ts`) | La liste existait en quatre exemplaires (`CHANNELS` dans forms, options « Provenance » dans `partner-clients`, correspondance `SOURCE_BY_CHANNEL`, libellés de l'analyse du pipeline), avec des valeurs différentes : `sea` / `google-ads-sea`. Chaque entrée du registre porte les deux valeurs historiques — on ne renomme rien, l'historique reste vrai. Les canaux ajoutés depuis prennent **la même valeur des deux côtés**. L'ordre du registre est l'ordre des enums |
| D7 bis | **Meta se déclare en deux canaux** : « Meta Ads — Facebook » (`meta-facebook`) et « Meta Ads — Instagram » (`meta-instagram`), mêmes valeurs sur la soumission et sur l'opportunité, marqués `paid: true` | Ils sont comptés comme canaux payants, au même titre que Google Ads et ChatGPT Ads. Mais on ne les étiquette pas « SEA » : ce n'est pas de la publicité sur moteur de recherche, c'est de la publicité sur réseau social. Le support (Facebook ou Instagram) est lu sur chaque lead (§4.7). **Détection dès la phase 0** (§4.8) : sans elle, `resolveChannel` range tout clic payant — `utm_medium=paid_social` compris — dans Google Ads, et la première campagne Meta fausserait les chiffres Google Ads sans que rien ne le signale. Seul signal : source Meta + medium payant ; `fbclid` n'en est pas un |
| D8 | **Une créa est indépendante de la régie** : un message + des assets ; les formats par régie sont des **déclinaisons** | La même accroche sert Meta (carré, 9:16) et plus tard Google (RSA, Performance Max) sans être réécrite |
| D9 | **Garde-fous en code, jamais dans le prompt** | Un prompt se contourne, un `if` non. Les plafonds vivent dans le global `ads-settings` (§6) |
| D10 | **Un passage d'agent = une campagne = une fonction** | Durée limitée des fonctions Vercel : le cron distribue, chaque campagne tourne seule. La génération vidéo est asynchrone : lancée à un passage, récupérée au suivant. Même esprit pour la synchro : un compte en erreur n'arrête pas les autres |
| D11 | **Deux jetons Meta possibles par compte** : le **jeton d'utilisateur système** (voie principale dès la mise en production, décision du 29/09/2026), et le jeton OAuth longue durée en secours | L'OAuth de Meta ne donne pas de jeton de rafraîchissement : le jeton longue durée vit ~60 jours. Il est daté (`tokenExpiresAt`), une alerte part à **J-7**, et le compte passe `expire` à l'échéance. Le jeton d'utilisateur système (Business Manager) n'expire pas : c'est **la cible** dès que le portefeuille business de TIM est en place, il prime sur l'OAuth quand il est posé, et il est **obligatoire avant que les agents puissent écrire (phase 2)** |

---

## 3. Vue d'ensemble

```
                 cron ads-agents (toutes les 6 h)
                              │
                    ┌─────────▼─────────┐
                    │   Orchestrateur    │  quelles campagnes sont dues ? budget IA restant ?
                    └─────────┬─────────┘
          ┌───────────────────┼───────────────────┐
   ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
   │ Agent camp. │     │ Agent camp. │     │ Agent camp. │   1 par campagne (Sonnet)
   └──┬───────┬──┘     └─────────────┘     └─────────────┘
      │       └──► Agent créatif (textes · images · vidéo · motion)
      ▼
  outils : lire_perfs · lire_qualite_leads · proposer_budget · proposer_pause · demander_crea
      │
      ▼
  garde-fous (code) ──► ad-decisions ──► [À valider] ──► exécutant ──► AdPlatform
                                                                      ├─ meta      (aujourd'hui)
                                                                      ├─ google    (demain)
                                                                      └─ chatgpt   (demain)
```

---

## 4. Modèle de données

Nouveau module `modules/ads`, groupe de nav **« Publicité »**.

### 4.1 `ad-accounts` — un compte publicitaire connecté

| Champ | Type | Rôle |
|---|---|---|
| `platform` | text (registre) | `meta` · `google` · `chatgpt` |
| `externalId` | text | `act_…` chez Meta, customer ID chez Google |
| `name`, `currency`, `timezone` | text | Lus à la connexion |
| `token` | text chiffré (`secrets.ts`) | Jeton OAuth longue durée du compte. Jamais renvoyé à l'admin |
| `tokenExpiresAt` | date | Échéance du jeton OAuth (D11) : alerte à J-7, statut `expire` à l'échéance |
| `systemUserToken` | text chiffré (`secrets.ts`) | Jeton d'utilisateur système, collé à la main (D11). Prime sur `token` quand il est posé. Jamais renvoyé à l'admin : l'écran dit seulement s'il est posé |
| `status` | select | `sans-jeton` · `connecte` · `expire` · `erreur` · `archive` — constaté par la synchro et la connexion, sauf `archive` qui est un geste humain |
| `monthlyCapEur` | number | Plafond de dépense mensuel **pour ce compte**, contrôlé par nos garde-fous |
| `lastSyncAt` | date auto | Dernière synchro réussie |

**Un compte ne se supprime pas, il s'archive.** Archivé, il n'est plus synchronisé ;
ses campagnes et ses chiffres restent en place — on le reconnectera (au passage au
jeton d'utilisateur système, typiquement), et les agents auront besoin de son
historique. Archiver et réactiver se font par les boutons de la fiche (à côté de
« Sauvegarder ») ; réactiver
recalcule l'état d'après les jetons.

**Une reconnexion retrouve toujours le même enregistrement**, par sa clé
`platform + externalId` (index unique) : l'OAuth remplace le jeton, remet l'échéance
et l'alerte J-7 à zéro et sort le compte de l'archive ; coller un jeton
d'utilisateur système fait de même. Jamais un second compte pour le même `act_…`.

**Brancher un compte** (en tête de « Comptes publicitaires ») : voie principale,
l'identifiant du compte (pré-rempli s'il n'y en a qu'un d'autorisé) et le **jeton
d'utilisateur système** › « Vérifier et connecter » : Meta confirme que ce jeton ouvre
ce compte, et donne son nom, sa devise et son fuseau, avant tout enregistrement. Le
formulaire natif de création est fermé : il enregistrerait un compte sans rien
vérifier. **Seuls les comptes de `META_ALLOWED_AD_ACCOUNTS` entrent** (fermée par
défaut), quel que soit le chemin — OAuth, jeton système, API, synchro.

En secours, « Connexion par OAuth » ouvre l'écran de consentement (droit `ads_read` seul en phase 0 ;
`ads_management` viendra avec les écritures). Au retour, le jeton longue durée ouvre
un ou plusieurs comptes : un seul est connecté d'office ; plusieurs, on choisit dans
la liste — le jeton attend dans un cookie HttpOnly chiffré de 10 minutes, lié à
l'admin qui a lancé la connexion, jamais dans l'URL. Adresse de retour à déclarer
dans l'app Meta : `{NEXT_PUBLIC_SITE_URL}/api/admin/ads/meta/callback`. Autre chemin :
créer le compte à la main et coller le jeton d'utilisateur système.

**La suppression définitive est réservée au super-admin.** La suppression native est
fermée à tous (API et liste) ; elle passe par « Supprimer définitivement… », qui
annonce d'abord ce qui partira (le compte, N campagnes, M lignes de chiffres) et
refuse si ces nombres ont changé entre la confirmation et le clic.

### 4.2 `ad-campaigns` — une campagne, miroir + pilotage

| Champ | Type | Rôle |
|---|---|---|
| `account` | relation → `ad-accounts` | La régie se déduit du compte |
| `externalId` | text | Identifiant chez la régie (vide tant que non publiée) |
| `name`, `objective` | text / select | Objectif normalisé : `leads` · `trafic` · `notoriete` |
| `status` | select | `brouillon` · `active` · `en-pause` · `terminee` (lu et poussé) |
| `dailyBudget` | number | Budget courant, en devise du compte |
| `autonomy` | select | `observer` · `proposer` · `autonome` (D5) |
| `targets` | group | CPL cible, **CPL qualifié** cible, coût par affaire gagnée cible |
| `brief` | group | Offre, cible (métiers BTP, taille), promesse, ton, interdits, page d'arrivée |
| `agentModel` | select | Modèle de l'agent de la campagne |
| `lastRunAt`, `nextRunAt` | date auto | Rythme des passages |
| `kpis` | json auto | Derniers chiffres consolidés, pour la liste et les cartes |

Les ensembles de publicités / groupes d'annonces ne sont **pas** une collection : ils
vivent dans `ad-metrics-daily` (niveau `adset`) et dans la réponse de l'adaptateur.
Une collection de plus pour un niveau que Google et ChatGPT ne découpent pas pareil
serait une source de désaccord permanente.

### 4.3 `ad-creatives` — une créa

| Champ | Type | Rôle |
|---|---|---|
| `campaign` | relation → `ad-campaigns` | |
| `angle` | text | L'idée en une ligne : « le pointage papier coûte 2 h par semaine » |
| `texts` | group | Accroche, texte principal, titre, description, CTA |
| `assets` | array → `media` | Image, vidéo, motion, avec `format` (1:1, 4:5, 9:16, 16:9) |
| `variants` | array | Déclinaisons par régie : `platform`, `externalAdId`, `status` chez la régie |
| `status` | select | `brouillon` · `a-valider` · `validee` · `en-ligne` · `retiree` · `refusee` |
| `origin` | select | `agent` · `manuelle` |
| `generation` | group | Fournisseur (Claude, API image, Runway, Remotion), prompt, coût €, identifiant de tâche asynchrone |
| `performance` | json auto | CTR, CPL, CPL qualifié — ce qui décide de la garder |

### 4.4 `ad-decisions` — le journal (cœur du module)

Chaque chose qu'un agent veut faire devient une ligne. Rien ne s'exécute sans elle.

| Champ | Type | Rôle |
|---|---|---|
| `campaign`, `run` | relations | Qui, pendant quel passage |
| `kind` | select | `budget` · `pause` · `activation` · `nouvelle-crea` · `retrait-crea` · `audience` · `enchere` |
| `before` / `after` | json | L'état avant, l'état demandé |
| `rationale` | textarea | **Pourquoi**, dans les mots de l'agent, chiffres à l'appui |
| `expected` | text | L'effet attendu, pour le vérifier après |
| `guardrail` | text | Garde-fou déclenché, s'il y en a un |
| `status` | select | `proposee` · `validee` · `refusee` · `executee` · `echouee` · `bloquee` |
| `decidedBy`, `decidedAt` | relation / date | Humain ou `auto` |
| `executedAt`, `platformResponse` | date / json | Trace de l'exécution |
| `outcome` | text auto | Mesuré 3 jours après : l'effet attendu a-t-il eu lieu ? Relu par l'agent au passage suivant |

### 4.5 `ad-agent-runs` — un passage d'agent

`campaign`, `startedAt`, `durationMs`, `model`, `tokens` (in/out/cache), `costEur`,
`summary` (ce que l'agent a vu et conclu, 5 lignes), `decisions` (compte), `error`.
C'est ce qui répond à « qu'a fait l'agent cette nuit, et combien ça a coûté ».

### 4.6 `ad-metrics-daily` — les chiffres

Une ligne par jour × niveau (`campaign` · `adset` · `ad`) × objet. Chaque ligne porte
`account` et une copie de `platform` (la régie se déduit du compte, mais une clé
d'unicité ne traverse pas une relation). Index unique composé
`platform + level + externalId + date`, réécrite tant que la régie corrige ses chiffres
(fenêtre de 7 jours). Champs : `spend`, `impressions`, `clicks`, `leads`, puis —
calculés chez nous — `qualifiedLeads`, `won`. Les écrans et les agents lisent **cette**
table, jamais la régie en direct : un seul chiffre, le même pour tout le monde.
Les montants sont dans la devise du compte ; le tableau de bord additionne des
euros et signale à part un compte dans une autre devise.

**Synchro** (`/api/cron/ads-sync`, chaque jour à 04:30 UTC, et « Synchroniser
maintenant », bouton de la fiche d'un compte) : les campagnes, puis les chiffres des 7
derniers jours — aujourd'hui compris, partiel — aux trois niveaux. Une ligne
inchangée n'est pas réécrite. Un compte à la fois ; une erreur s'écrit sur sa fiche
(`expire` si la régie refuse le jeton, `erreur` sinon) et n'arrête pas les suivants.
L'interrupteur des garde-fous ne l'arrête pas : elle ne fait que lire. Ensuite,
l'alerte J-7 part aux admins pour chaque jeton OAuth proche de l'échéance, une fois.

⚠️ **Base partagée** : un compte simulé (`act_000000000000`) n'est synchronisé qu'en
données simulées, et un compte réel **jamais** en données simulées — sinon un poste
de dev écrirait des chiffres inventés sur un vrai compte, et le cron de production
enverrait à Meta le jeton factice.

À surveiller : la première écriture d'une ligne coûte ~120 ms à travers le pooler
(147 lignes simulées : 18 s ; le passage suivant, sans changement : 0,7 s). Un
compte réel à plusieurs centaines d'annonces demandera des écritures par lots
avant de toucher la limite de 300 s de la fonction.

### 4.7 Sur les fiches existantes

`form-submissions` et `partner-clients` reçoivent un groupe `adAttribution` :
`platform`, `campaign` (relation), `adExternalId`, identifiant de clic (`fbclid`,
`gclid`, …), identifiant de lead natif (formulaire instantané Meta). 
**Facebook ou Instagram ?** Meta le dit, lead par lead :

| Arrivée du lead | Où on lit le support | Valeur |
|---|---|---|
| Formulaire instantané Meta | champ `platform` du lead (API Lead Ads) | `fb` → Meta Ads — Facebook · `ig` → Meta Ads — Instagram |
| Page d'arrivée sur le site | paramètre d'URL `utm_source={{site_source_name}}`, rempli par Meta à la diffusion | mêmes valeurs `fb` / `ig` |

Messenger et Audience Network renvoient d'autres codes (`msg`, `an`) : ils tombent dans
« Meta Ads — Facebook » par défaut, et le code brut est gardé dans `adAttribution` pour
pouvoir les séparer plus tard si leur volume le justifie.

Et un tableau
`conversionsSent` : quel événement a été renvoyé à quelle régie, quand, avec quelle
réponse — pour ne jamais l'envoyer deux fois.

### 4.8 Reconnaître un lead Meta arrivé sur le site (phase 0)

`resolveChannel` (`modules/forms/lib/channel.ts`) teste Meta **avant** la règle
générale, comme il le fait déjà pour ChatGPT — placée après, la règle ne serait jamais
atteinte, puisque tout medium payant répond déjà « Google Ads ».

**Le seul signal payant est un medium payant** (`paid_social`, `cpc`, `paid`…)
**accompagné d'une source Meta** :

| `utm_source` (avec un medium payant) | Canal |
|---|---|
| `fb`, `facebook`, `msg`, `an` | Meta Ads — Facebook |
| `ig`, `instagram` | Meta Ads — Instagram |

**`fbclid` n'est pas un signal de clic payant.** Meta l'ajoute aussi aux clics
organiques (publications, liens en bio, liens partagés), et il ne distingue pas
Facebook d'Instagram. `fbclid` seul, ou `fbclid` avec une source Meta mais sans medium
payant : ce n'est **pas** Meta Ads — le lead garde le canal qu'il aurait eu sans
`fbclid`. `fbclid` est tout de même **conservé** dans l'attribution de la soumission :
il sert au paramètre `fbc` de la Conversions API en phase 1.

**Paramètres d'URL obligatoires sur toutes nos annonces Meta :**

```
utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}
```

C'est ce qui rend la règle fiable (Meta écrit `fb`, `ig`, `msg` ou `an` à la
diffusion, et le medium est fixé par nous), et ce qui relie chaque lead à **sa
campagne** et à **son annonce** (`utm_campaign` = `externalId` de `ad-campaigns`,
`utm_content` = identifiant de l'annonce). Une annonce publiée sans ces paramètres
produit des leads comptés dans le mauvais canal.

⚠️ **Prérequis côté vitrine, avant la première campagne Meta qui renvoie vers le
site** : capter `fbclid` (comme `gclid` et `oaiclid`) et le transmettre avec la
soumission. Il ne sert **pas** à détecter le canal, mais à la Conversions API
(phase 1) : sans lui, le renvoi des conversions à Meta perd sa meilleure clé de
rapprochement.

---

## 5. L'adaptateur de régie

```ts
// modules/ads/platforms/types.ts
export type Capability =
  | "lecture"          // campagnes, métriques
  | "budget"           // modifier un budget
  | "statut"           // mettre en pause / réactiver
  | "creation"         // créer campagne, ensemble, annonce
  | "upload-crea"      // envoyer image / vidéo
  | "conversions"      // renvoyer un événement (lead qualifié, signé)
  | "leads-natifs";    // formulaires hébergés par la régie

export interface AdPlatform {
  key: PlatformKey;    // dérivé du registre des régies (D3), pas écrit en dur
  label: string;
  capabilities: Capability[];
  connect(code: string): Promise<AccountToken>;
  listCampaigns(acc: Account): Promise<CampaignSnapshot[]>;
  fetchMetrics(acc: Account, range: DateRange, level: Level): Promise<MetricRow[]>;
  setBudget?(acc: Account, ref: ObjectRef, amount: number): Promise<void>;
  setStatus?(acc: Account, ref: ObjectRef, status: "active" | "pause"): Promise<void>;
  uploadAsset?(acc: Account, asset: Asset): Promise<string>;
  createAd?(acc: Account, input: AdInput): Promise<string>;
  sendConversion?(acc: Account, event: ConversionEvent): Promise<void>;
}
```

Les méthodes sont **optionnelles** et annoncées par `capabilities` : l'agent ne reçoit
que les outils que la régie sait faire. C'est ce qui permet de brancher une régie
**partiellement** (lecture + conversions d'abord), sans rien casser.

**Données simulées.** Tant que l'app Meta et son jeton ne sont pas fournis,
l'adaptateur Meta tourne sur des données simulées déterministes derrière
`ADS_META_MOCK=1`. Un bandeau « Données simulées » s'affiche alors sur le tableau
de bord et dans « Connexions du support » : un chiffre inventé ne doit jamais passer
pour un vrai.

**Variables** : `META_APP_ID`, `META_APP_SECRET` (app Meta), `META_GRAPH_VERSION`
(défaut `v26.0`, sortie le 29/07/2026 — à confirmer dans le changelog Meta à la
création de l'app ; Meta retire une version tous les ~2 ans, elle se change sans
déploiement de code), `ADS_META_MOCK=1` (données simulées). Sans les deux premières
et sans le drapeau, l'adaptateur refuse de démarrer en disant ce qui manque.

⚠️ **Dev et prod partagent la base** : un compte simulé connecté en local existe aussi
en production. Le compte et les campagnes simulés portent le préfixe **« [SIMULÉ] »**,
pour être reconnus et archivés proprement une fois le vrai compte branché.

⚠️ **Changements Meta annoncés pour le 27/10/2026** sur la création de campagnes et
d'ensembles de publicités : sans effet sur la phase 0 (lecture seule), **à revoir
avant la phase 2** (premières écritures).

| Régie | Accès | Ce qui est possible aujourd'hui |
|---|---|---|
| Meta | Marketing API (app Meta + Business Manager), jeton OAuth | Tout : lecture, budget, statut, création, upload, Conversions API, formulaires instantanés |
| Google Ads | Google Ads API (developer token + OAuth). Le MCP officiel de Google est **en lecture seule** | Tout via l'API. ⚠️ La demande de developer token prend du temps : à lancer tôt |
| ChatGPT Ads | Ads Manager self-serve (US depuis mai 2026, déploiement en Europe engagé en septembre 2026), Conversions API | Au départ `lecture` + `conversions` ; le reste quand une API de gestion est publique |

---

## 6. Garde-fous (global `ads-settings`)

En **phase 0**, seuls l'interrupteur général et le plafond mensuel par compte
existent (rien ne les fait encore respecter, aucun agent ne tourne). Les autres
champs arrivent avec la phase qui les applique — chacun coûte sa migration de toute
façon.


| Garde-fou | Défaut proposé | Effet |
|---|---|---|
| Interrupteur général | activé | Coupé = aucun agent ne tourne, aucune décision ne s'exécute |
| Variation de budget max par décision | ±20 % | Au-delà : `bloquee` ou renvoyée en validation |
| Délai minimal entre deux modifications d'un même objet | 72 h | Ne pas relancer sans cesse la phase d'apprentissage de la régie |
| Plafond de dépense publicitaire par compte et par mois | saisi par compte | Aucune hausse ne peut le dépasser, même validée |
| Budget quotidien plancher | saisi par campagne | L'agent ne peut pas « économiser » en tuant une campagne |
| Créas générées par campagne et par semaine | 6 | Limite le coût de génération vidéo |
| Budget IA (Claude + génération) par jour | 15 € | Extension d'`ai-budget.ts`, tarifs par modèle |
| Volume minimal avant de juger une annonce | 1 000 impressions et 3 jours | Pas de décision sur du bruit |
| Actions jamais autonomes | création de campagne, changement d'audience, hausse > 20 % | Toujours validées à la main, quel que soit le niveau d'autonomie |

---

## 7. Les agents

| Agent | Modèle | Déclenché par | Outils |
|---|---|---|---|
| Orchestrateur | code (pas de LLM) | cron `ads-agents` | Choisit les campagnes dues, vérifie budget IA et interrupteur, lance un passage par campagne |
| Agent de campagne | Sonnet | orchestrateur | `lire_perfs`, `lire_qualite_leads`, `lire_decisions_passees` (avec leur `outcome`), `proposer_budget`, `proposer_pause`, `proposer_activation`, `demander_crea` |
| Agent créatif | Sonnet (textes) + fournisseurs | `demander_crea` ou bouton manuel | `ecrire_textes`, `generer_image`, `generer_video` (Runway, asynchrone), `composer_motion` (gabarits Remotion) |
| Rédacteur de rapport | Haiku | cron hebdo | Résumé de la semaine par campagne et par régie, envoyé par e-mail (Brevo) |

L'agent de campagne relit **ses propres décisions passées et leur résultat mesuré**
(`outcome`) : c'est ce qui l'empêche de refaire la même erreur trois passages de suite.

---

## 8. Menu

```
Publicité
├── Tableau de bord            /admin/publicite           (toutes régies, filtre par régie)
├── À valider                  ad-decisions filtrées « proposée » + créas « à valider »
├── Campagnes                  ad-campaigns
├── Créations                  ad-creatives
├── Journal des agents         ad-agent-runs + ad-decisions
└── Paramètres
    ├── Comptes publicitaires  ad-accounts
    └── Garde-fous             ads-settings

Analyses
└── Publicité                  CPL, CPL qualifié, coût par affaire gagnée — par régie, côte à côte

Système › Connexions du support
└── + Meta · Google Ads · OpenAI Ads · Runway
```

Le tableau de bord montre d'abord **le nombre de choses à valider** : c'est l'écran
qu'on ouvre tous les matins. Les chiffres viennent après.

---

## 9. Phases

| Phase | Contenu | Livré quand |
|---|---|---|
| 0 | Registre des canaux (+ Meta Ads — Facebook, Meta Ads — Instagram) et détection Meta (§4.8), module, collections, connexion d'un compte Meta (OAuth + jeton système, D11), synchro quotidienne des métriques, tableau de bord **en lecture**. Adaptateur sur données simulées tant que l'app Meta n'existe pas | On voit ses campagnes Meta dans le back-office |
| 1 | Boucle de leads : formulaires instantanés Meta (webhook) → `form-submissions` → fiche, attribution, envoi des événements qualifié / test / signé via Conversions API | Une fiche signée remonte chez Meta |
| 2 | Agent de campagne en mode `observer` puis `proposer` : budget et pauses, écran « À valider ». **Prérequis** : jeton d'utilisateur système posé sur le compte (D11) — aucune écriture sur un jeton OAuth qui expire | Première décision validée et exécutée |
| 3 | **3a** (§9 ter) : atelier de créas — textes, gabarits, motion, validation, téléchargement, sans Meta. **3b** : upload vers Meta et création d'annonce. **3c** (§9 quater) : agent de campagne qui prépare toute la campagne sous budget, sans rien publier | 3a : une créa validée se télécharge aux formats Meta. 3b : elle passe en ligne après validation. 3c : un clic prépare une campagne complète dans « À valider » |
| 4 | Mode `autonome` sous garde-fous, mesure des `outcome` | Une semaine sans intervention sans dépassement |
| 5 | Adaptateur Google Ads (lecture → conversions → écriture) | Google Ads dans le même tableau de bord |
| 6 | Adaptateur ChatGPT Ads (lecture + conversions, écriture dès que possible) | Trois régies côte à côte |
| 7 | Répartition entre régies : l'orchestrateur propose de déplacer du budget vers la régie au meilleur coût par affaire gagnée | Arbitrage multi-régies proposé chaque semaine |

---

### Découpage de la phase 0 (commits)

| # | Commit | Schéma |
|---|---|---|
| 1 | Registre des canaux `core/lib/channels.ts` : remplace les quatre copies, valeurs et ordre inchangés ; ce plan mis à jour | aucun (migration générée vide) |
| 2 | Canaux `meta-facebook` / `meta-instagram`, détection §4.8, `fbclid` conservé sur la soumission | migration commune 2 + 3 |
| 3 | Socle `modules/ads` : registre des régies, types, `ad-accounts`, `ad-campaigns`, `ad-metrics-daily`, `ads-settings`, nav « Publicité », admin seul | migration commune 2 + 3 |
| 4 | Adaptateur Meta en lecture + données simulées `ADS_META_MOCK`, testé (vitest) | — |
| 5 | Connexion : OAuth (state signé, jeton longue durée chiffré), jeton système, entrée « meta » des connexions du support + Tester | — |
| 6 | Synchro `/api/cron/ads-sync` (fenêtre 7 j, statuts `expire` / `erreur`, alerte J-7) + `vercel.json` | — |
| 7 | Tableau de bord `/admin/publicite` en lecture | — |

La migration commune est appliquée **une seule fois** sur la base partagée dev/prod,
après sauvegarde et feu vert explicite.

**Sauvegarde avant migration** : `pg_dump` du schéma `public` (format custom), dans
`~/tim-backups/` (dossier 700, fichier 600, hors iCloud), vérifié par relecture de
l'archive et comparaison du nombre de lignes table par table. ⚠️ Il contient des
données de prospects : **le supprimer une fois la phase 0 en production et stable.**

---

## 9 bis. Mise en production de la phase 0

**Décision du 29/09/2026 : le jeton d'utilisateur système est la voie principale dès
la mise en production.** Utilisateur système créé dans le portefeuille Tim Management,
app « TIM Support – Publicité », droit `ads_read` seul, jeton sans expiration. L'OAuth
reste dans le code en **secours** : pas d'adresse de retour déclarée chez Meta, pas de
produit « Facebook Login » ajouté à l'app pour l'instant.

### Variables Vercel (production) — noms seulement

| Variable | Statut | Rôle |
|---|---|---|
| `META_APP_ID` | **à poser** | Identifiant de l'app « TIM Support – Publicité » |
| `META_APP_SECRET` | **à poser** (sensible) | Clé secrète de l'app : signe chaque appel (`appsecret_proof`) et sert au bouton « Tester » |
| `META_ALLOWED_AD_ACCOUNTS` | **à poser** : `act_211325410243618` | Comptes connectables. **Fermée par défaut** : absente, aucun compte réel n'entre ni n'est synchronisé |
| `META_GRAPH_VERSION` | facultative | Défaut `v26.0` ; à poser seulement pour changer de version |
| `ADS_META_MOCK` | **ne jamais poser en production** | Données simulées ; absente = vraie API |
| `NEXT_PUBLIC_SITE_URL` | à vérifier | `https://support.tim-management.co` — ne sert qu'à l'OAuth de secours |
| `CRON_SECRET` | à vérifier (déjà utilisée) | Authentifie le cron `ads-sync` |
| `PAYLOAD_SECRET` | déjà posée — **ne pas la changer** | Chiffre les jetons des comptes : la changer oblige à les reconnecter |

Le **jeton d'utilisateur système n'est PAS une variable** : il se colle dans le
back-office (il est propre au compte, chiffré en base). Une variable posée sur Vercel
n'est prise en compte qu'au **déploiement suivant**.

### App Meta

- Rien à déclarer pour la voie principale : ni adresse de retour, ni Facebook Login.
- Dans le portefeuille : le compte publicitaire `act_211325410243618` doit être
  **attribué à l'utilisateur système** (droit de consultation des performances), sinon
  Meta répond que le jeton n'ouvre pas ce compte — et le back-office le dit.
- OAuth de secours, le jour où il servirait : ajouter Facebook Login et déclarer
  `https://support.tim-management.co/api/admin/ads/meta/callback`
  (et `http://localhost:3001/api/admin/ads/meta/callback` pour un poste de dev).

### Après le déploiement, dans l'ordre

1. *Système › Connexions du support* › Meta Ads › **Tester** : « L'app Meta est
   reconnue… Comptes autorisés : act_211325410243618 ».
2. *Publicité › Paramètres › Comptes publicitaires* › **Connecter un compte Meta** :
   l'identifiant est pré-rempli (seul compte autorisé), coller le jeton d'utilisateur
   système › **Vérifier et connecter**. Meta confirme que le jeton ouvre le compte et
   donne son nom, sa devise et son fuseau ; rien n'est enregistré avant.
3. Sur sa fiche, bouton **Synchroniser maintenant** ; vérifier campagnes et chiffres.
4. **Archiver le compte « [SIMULÉ] TIM — compte simulé »** (`act_000000000000`, créé
   le 29/09/2026 pour tester l'écran, il vit dans la base de production) : bouton
   *Archiver* (ou, en super-admin, *Supprimer définitivement…*). Ses campagnes et chiffres simulés sortent du tableau de bord,
   et le bandeau « Données simulées » disparaît. Le cron de production ne l'a jamais
   lu (compte simulé hors mode simulé, et hors liste autorisée) ; l'archivage reste
   possible bien qu'il soit hors liste.
5. Supprimer les sauvegardes `~/tim-backups/*.dump` une fois la phase 0 stable.

### Fusion et déploiement (COMMIT-ET-DEPLOIEMENT.md)

Sur feu vert explicite, **après** avoir posé les variables Vercel. Motif établi :
`refonte-support` est amenée au niveau de `publicite` (avance rapide), puis fusionnée
dans `main` en `--no-ff`, dans un worktree — le serveur de dev reste intact. Les
**quatre portes** sont rejouées sur le résultat de la fusion avant de pousser `main`.

---

## 9 ter. Phase 3a — Atelier de créas

> Statut : **commits 1 à 7 faits le 29/09/2026** sur la branche `publicite` (non
> déployés) — atelier utilisable : brief, textes, visuels, validation, téléchargement.
> Migration `20260929_095438` à appliquer avant tout essai (base partagée). Restent
> les commits 8 (fonds Imagen), 9 (motion) et 10 (vidéo Veo).
> Objectif : produire dans le back-office des créas **prêtes à publier** — textes,
> visuels statiques, motion, et en option vidéo générée — les faire valider, et les
> **télécharger** aux formats Meta. L'envoi à Meta (upload, création d'annonce) est la
> phase 3b : il attend le jeton d'utilisateur système et le droit `ads_management`.
> Rien de ce qui suit n'écrit chez Meta.

### Décisions du 29/09/2026

| Sujet | Décision |
|---|---|
| Brief | Sur une campagne `brouillon` créée dans le support — pas de collection à part |
| Modèle des textes | **L'Opus le plus récent** : `claude-opus-5-5` (vérifié le 29/09/2026 auprès de l'API Models : « Claude Opus 5.5 », publié le 21/09/2026). Déclaré à **un seul endroit** du code |
| Ton | **Vouvoiement par défaut.** Le tutoiement est une dimension testable : l'agent peut proposer des variantes en tutoiement, étiquetées « test de ton », comptées à part, soumises à validation comme toute créa. Champ `tone` (vous / tu) sur chaque texte et chaque créa |
| Dimensions testables | Même logique pour tout ce qu'on voudra tester (angle, accroche, format, visuel, bouton) : **une variante = une dimension étiquetée et mesurable** (`modules/ads/lib/dimensions.ts`) |
| Boutons d'action | **« En savoir plus », « S'inscrire », « Réserver »** (démo). Rien d'autre sans accord |
| Budgets | IA textes **5 €/jour et 50 €/mois** ; images **20 €/mois** ; vidéo générée **30 €/mois** |
| Images et vidéo | Imagen 4 et Veo, clé `GEMINI_API_KEY` (créée au commit 8) |
| Motion | Remotion sur Vercel Sandbox, si la licence gratuite s'applique (ci-dessous) |

**Licence Remotion — vérifiée le 29/09/2026.** La licence gratuite couvre « an
organization or team of individuals with up to 3 people », incorporée ou non, et elle
permet l'automatisation : « Free License Users may build automations without
purchasing Renders » ([conditions](https://www.remotion.dev/docs/terms),
[FAQ](https://www.remotion.dev/docs/license/faq)). LC DEV compte **1 salarié**.
⚠️ Réserve : le seuil compte « the total number of personnel across all involved parties
that operate the Remotion Software », et les effectifs de plusieurs entités qui
collaborent **s'additionnent**. Le back-office a aujourd'hui 4 comptes admin
(direction@, lafonso@, cpiancatelli@, mpetrini@) : si ces personnes ne relèvent pas
toutes de LC DEV, le total peut atteindre 4 et la licence entreprise devient
obligatoire. **À trancher avant le commit 9.**

Précision du 29/09/2026 : les comptes admin et super-admin sont **une seule équipe,
TIM**. Le seuil de Remotion compte les **personnes**, pas les comptes ni les licences :
`direction@` et `cpiancatelli@` sont la même personne (Charlie), ce qui ferait
**3 personnes** (Charlie, lafonso@, mpetrini@) → licence gratuite, si personne d'autre
n'utilise l'outil. À 4 personnes ou plus : « Remotion for Automators », 100 $/mois
minimum (0,01 $ par rendu) — pas un prix par siège.

**Confirmé le 29/09/2026 : seuls `direction@` et `cpiancatelli@` utiliseront
l'atelier — une seule personne, Charlie. Licence Remotion gratuite ; le commit 9
part sur Vercel Sandbox sans surcoût de licence.**

**Le kit de marque réutilise la charte existante.** Les couleurs de TIM et son logo
principal existent déjà dans *Système › Apparence* (ceux du contrat PDF) : le kit les
lit au lieu de les redemander. Il n'ajoute que ce qui est propre à la publicité — logo
pour fond sombre, polices, ton, mentions interdites, mentions légales. Les chiffres
autorisés sont une collection à part, `ad-facts`, à laquelle le brief se relie.

### Ce que la phase 3a ne fait PAS

- Aucun envoi à Meta, aucune annonce créée (phase 3b).
- Aucun agent qui décide seul : la génération se lance par un bouton, sur une
  campagne, et tout passe par « À valider ». L'agent créatif autonome (§7) viendra
  quand la boucle manuelle aura fait ses preuves.
- Aucune personne réaliste générée par IA présentée comme un client ou un salarié,
  aucun témoignage inventé (voir « Garde-fous », en code).

### Décision préalable à valider — le brief vit sur une campagne qui n'existe pas encore chez Meta

`ad-campaigns` est aujourd'hui un **miroir en lecture seule** de la régie (phase 0) :
ni création ni modification depuis le back-office. Or le brief se rédige **avant**
que la campagne existe chez Meta. Proposition :

- une campagne peut être **créée dans le support** à l'état `brouillon`, sans
  `externalId` ; c'est elle qui porte le brief et ses créas ;
- les champs miroir (état chez la régie, budget, objectif, chiffres) restent
  **verrouillés champ par champ** : les modifier ici ferait croire à une action chez
  Meta, le principe de la phase 0 tient ;
- au passage en 3b, la publication chez Meta pose l'`externalId` sur ce même
  enregistrement ; la synchro le retrouve par sa clé — pas de doublon.

Alternative écartée : une collection `ad-briefs` à part. Elle obligerait à relier
brief, créas et campagne Meta après coup — trois objets pour une seule chose.

### 1. Le kit de marque — global `ads-brand-kit`

Saisi une fois, lu par chaque génération. Réservé à l'admin.

| Champ | Contenu | Pourquoi |
|---|---|---|
| `logos` | SVG + PNG, variantes couleur / blanc / monochrome | Le gabarit choisit la variante selon le fond |
| `colors` | Couleurs de charte en hex : primaire, secondaire, fond clair, fond sombre, texte | Ce sont des **données de marque**, pas du style de l'interface : la règle « couleurs en tokens » (styles/_tokens.scss) concerne le CSS du back-office, pas le contenu d'une publicité |
| `fonts` | Fichiers **TTF ou OTF** (le moteur de rendu ne lit pas le WOFF2), graisses utilisées, **licence** | Une police sans licence d'usage publicitaire ne s'embarque pas dans une créa |
| `screenshots` | Captures de l'app, chacune étiquetée : plateforme (web / mobile), fonctionnalité (planning, pointage, véhicules…), sans données client réelles | La génération choisit la capture qui correspond à l'angle |
| `photos` | Photos de chantier / d'équipe, avec **droits** (origine, date, consentement des personnes visibles) | Une photo sans droits ne sort pas du back-office |
| `facts` | **Faits sourcés** : un chiffre, sa formulation, sa source (URL, étude, donnée interne datée) | Seuls ces chiffres peuvent apparaître dans une créa (garde-fou 3) |
| `forbidden` | Mentions interdites : mots, promesses, concurrents nommés, superlatifs (« n°1 », « le meilleur »…) | Refusés en code, pas seulement demandés au modèle |
| `voice` | Ton : tutoiement / vouvoiement, registre, exemples de phrases justes et fausses | Donné à Claude, relu par l'humain |
| `legal` | Mentions obligatoires éventuelles, raison sociale de l'annonceur | Ajoutées au fichier de textes téléchargé |

Stockage des fichiers : une collection dédiée **`ad-media`** (Vercel Blob, préfixe
`ads/`, admin seul), et non la médiathèque : celle-ci est lisible par les partenaires
selon des règles de propriété (RBAC), et les créas n'ont rien à y faire.

### 2. Le brief par campagne — groupe `brief` sur `ad-campaigns`

| Champ | Contenu |
|---|---|
| `audience` | La cible : métier (conducteur de travaux, gérant, RH…), taille d'entreprise (tranches du formulaire), zone |
| `pain` | La douleur, dans les mots du client : « le pointage papier me coûte 2 h par semaine » |
| `offer` | L'offre : démo, essai, tarif, période |
| `promise` | La promesse : ce qui change après — vérifiable |
| `proofs` | Les faits du kit de marque autorisés pour cette campagne (relation vers `facts`) |
| `forbidden` | Interdits propres à la campagne, en plus de ceux du kit |
| `landingUrl` | La page d'arrivée. Les **paramètres d'URL obligatoires** (§4.8) sont ajoutés automatiquement au téléchargement : `utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}` |
| `cta` | Le bouton Meta : « En savoir plus », « S'inscrire », « Demander un devis »… (liste fermée des CTA Meta) |
| `angles` | Facultatif : les angles souhaités. Vide, Claude en propose trois |

### 3. La génération de textes — Claude

- **Modèle** : Claude Opus 5 (`claude-opus-5`) par défaut. Le volume est faible et la
  qualité du français publicitaire se voit ; à confirmer (voir « Choix »).
- **Sortie structurée** (`output_config.format`, schéma JSON) : pas d'analyse de texte
  libre, chaque champ arrive à sa place.
- **Par génération : 3 angles × (5 textes principaux, 5 titres, 3 descriptions)**.
  5, c'est le maximum de variantes de texte qu'une annonce Meta accepte par champ :
  on ne produit rien qui ne pourra pas servir.
- **Limites Meta, vérifiées en code** (un texte hors limite est rejeté et régénéré,
  pas tronqué) :

  | Champ | Limite dure (en code) | Cible (visible sans « Voir plus ») |
  |---|---|---|
  | Texte principal | 500 caractères | 125 |
  | Titre | 40 | 27 |
  | Description | 30 | 30 |

- **Garde-fous en code (D9), après la réponse du modèle — le prompt les demande
  aussi, mais c'est le code qui décide :**
  1. longueur (tableau ci-dessus) ;
  2. mentions interdites (kit + brief), insensibles à la casse et aux accents ;
  3. **aucun chiffre non sourcé** : tout nombre, pourcentage ou durée présent dans
     un texte doit figurer dans les faits autorisés du brief — sinon rejet ;
  4. **aucun témoignage inventé** : pas de citation attribuée (« — Marc, conducteur
     de travaux »), pas de « nos clients disent », pas de note ou d'avis ;
  5. pas d'attribut personnel supposé du lecteur (« Vous êtes débordé ? ») — interdit
     par la politique publicitaire de Meta, et motif de refus d'annonce.

  Un texte rejeté est marqué avec la raison, visible dans l'atelier : on voit ce que
  le modèle a tenté, pas seulement ce qui est passé.
- **Coût** : environ 0,10 $ par génération complète sur Opus 5 (≈ 5 000 tokens
  d'entrée dont le kit de marque en cache, ≈ 3 000 de sortie ; 5 $ / 25 $ par
  million). Sonnet 5 : ≈ 0,04 $.
- **Plafond** : `core/lib/ai-budget.ts` connaît aujourd'hui un seul modèle (Haiku) et
  une seule dépense (l'assistant). Il devient **générique** : un tarif par modèle et
  par fournisseur (Claude, images, vidéo), et un compteur par usage. La publicité a
  son propre plafond jour et mois dans `ads-settings` (défaut proposé : 15 €/jour,
  §6). **Avant chaque appel**, le coût maximal possible (`max_tokens` × tarif de
  sortie, ou prix unitaire de l'image ou de la seconde de vidéo) doit tenir dans le
  reste du budget, sinon l'appel n'est pas lancé et l'écran dit pourquoi.

### 4. Les visuels statiques — gabarits

**Recommandation : Satori + sharp, dans une fonction Vercel.**
Un gabarit est un composant React (JSX + un sous-ensemble de CSS en flexbox) ;
[Satori](https://github.com/vercel/satori) le convertit en SVG, `sharp` — déjà dans le
projet, épinglé — le rastérise en PNG puis en JPEG sRGB. Rendu en une seconde environ,
sans navigateur, sans service externe, sans coût à l'unité.

| Format | Taille | Usage |
|---|---|---|
| 1:1 | 1080 × 1080 | Fil d'actualité |
| 4:5 | 1080 × 1350 | Fil d'actualité mobile — recommandé |
| 9:16 | 1080 × 1920 | Stories, Reels. **Zone sûre Meta unifiée (mars 2026)** : 14 % en haut, 35 % en bas, 6 % sur les côtés ; titre, logo et bouton restent dans la zone centrale |

- **4 gabarits** : « capture » (capture de l'app sur fond de marque + accroche),
  « chiffre » (un fait sourcé en grand, **avec sa source**), « photo » (photo chantier +
  dégradé), et « texte » (l'accroche seule, pour qu'une créa ait toujours un visuel tant
  que le kit n'a ni capture ni photo). Chacun en trois formats, par composition et non
  par recadrage. Le **même gabarit** pour toutes les créas d'une génération : deux
  angles avec deux visuels différents ne diraient plus lequel des deux a compté —
  changer de visuel est un test à part (dimension « visuel »).
- `satori` est déclaré externe (`serverExternalPackages`) et ses moteurs WebAssembly
  sont embarqués explicitement : empaqueté, il cherchait `hb.wasm` au mauvais endroit.
- Chaque rendu est **vérifié en code** : dimensions exactes, poids sous 30 Mo, texte
  dans la zone sûre (les boîtes de texte sont calculées, pas estimées).
- Les gabarits sont écrits dans le sous-ensemble CSS de Satori : ils se réutilisent
  **tels quels comme images dans le motion** (Remotion rend le CSS complet dans
  Chromium). Une seule source par gabarit.
- Écartés : Remotion `renderStill` pour les statiques (licence et Chromium pour un
  rendu qu'une fonction fait en une seconde) ; un navigateur headless (Puppeteer) en
  fonction Vercel (lourd, lent au démarrage).

**Fonds générés par IA (facultatif, par gabarit).** Recommandation : **Google Imagen 4
via l'API Gemini** — ~0,04 $ l'image en Standard (0,02 $ en Fast, 0,06 $ en Ultra).
Pourquoi lui :
1. une seule clé (`GEMINI_API_KEY`) servira aussi à la vidéo générée (Veo, §6) —
   un seul fournisseur, une seule facture, un seul plafond ;
2. les fonds sont des textures, des chantiers flous, des ambiances — pas du texte
   dans l'image, ce que le gabarit fait bien mieux ;
3. l'API Batch de Google divise le prix par deux si on génère en lot.

Alternatives écartées : FLUX via fal.ai (moins cher, ~0,003 à 0,055 $, mais un
fournisseur de plus) ; OpenAI GPT Image (prix comparable, un fournisseur de plus).
Règle : aucun visage réaliste généré présenté comme un vrai client ou salarié.

### 5. Le motion — Remotion

**Recommandation : Remotion, rendu sur Vercel Sandbox** (`@remotion/vercel`,
`renderMediaOnVercel`), plutôt que Remotion Lambda. Pourquoi : pas de compte AWS à
ouvrir ni à surveiller, les fichiers vont directement dans Vercel Blob, déjà utilisé.
Le rendu est lancé depuis une route, et la vidéo récupérée au passage suivant — le
rendu est asynchrone (D10).

- **Compositions** : 6 à 15 secondes, 30 i/s, H.264 + AAC, en 9:16 (Reels, Stories),
  4:5 et 1:1. Elles reprennent les gabarits statiques animés : entrée de la capture,
  accroche, fait sourcé, logo, appel à l'action. Musique : piste libre de droits
  fournie par TIM, ou sans son (sous-titres intégrés — la plupart des vidéos sont
  vues sans le son).
- **Coût du calcul** : de l'ordre de **0,02 $ par vidéo de 15 s** (Sandbox Pro :
  0,128 $/h de CPU actif, 0,0212 $/Go-h de mémoire ; estimation pour 4 vCPU pendant
  environ 1 min 30, à mesurer au premier rendu).
- **Licence Remotion — le vrai coût** : gratuite jusqu'à 3 personnes dans
  l'entreprise ; au-delà, licence entreprise obligatoire. Pour un usage automatisé,
  « Remotion for Automators » : 0,01 $ par rendu, **minimum 100 $/mois**. C'est ce
  minimum qui fait le prix du motion, pas le calcul. **À décider (voir « Choix »).**
- Alternative sans licence : une suite d'images fixes (les gabarits statiques) montée
  par ffmpeg dans un Sandbox — transitions et textes simples, rien de plus. Moins
  riche, gratuit ; proposée si la licence ne se justifie pas encore.
- Prérequis : Vercel **Pro** (Sandbox sur Hobby : 5 h de CPU par mois, sessions de
  45 min).

### 6. La vidéo générative — en option, plafonnée, en dernier

- **Recommandation : Veo 3.1 Fast via l'API Gemini** (même clé que les images) :
  0,12 $ par seconde en 1080p avec son → **environ 1 $ le plan de 8 s**. Veo 3.1 Lite :
  0,08 $/s en 1080p. Veo 3.1 Standard : 0,40 $/s — réservé si Fast ne suffit pas.
- Alternative : Runway Gen-4 Turbo, ~0,05 $/s (0,50 $ les 10 s), de l'image vers la
  vidéo — moins cher, mais un fournisseur et une clé de plus.
- Usage : des **plans d'ambiance** (chantier, engins, lever de jour) intégrés dans une
  composition Remotion, jamais une vidéo publicitaire entière, jamais une personne
  qui parle.
- **Plafonds en code** : budget vidéo mensuel séparé dans `ads-settings` (défaut
  proposé : 20 €), et le plafond de créas par campagne et par semaine (6, §6).
  Génération asynchrone : lancée à un passage, récupérée au suivant (D10).

### 7. La file de validation et le téléchargement

- **« À valider »** — la case réservée en tête du tableau de bord (phase 0) se remplit :
  nombre de créas `a-valider`, puis la file elle-même.
- **Une carte par créa** : aperçu dans ses trois formats côte à côte (9:16 avec la zone
  sûre en surimpression, désactivable), les textes avec leur compte de caractères
  (vert sous la cible, ambre entre la cible et la limite), les garde-fous passés, le
  coût de génération, l'angle et le fait utilisé.
- **Gestes** : « Valider » (le clic EST l'action : la créa passe `validee`),
  « Refuser » avec un motif (liste fermée + précision — il nourrira la génération
  suivante), « Régénérer les textes » / « Changer de fond ». Pas de case à cocher
  puis enregistrer.
- **Téléchargement** d'une créa validée, ou de toutes celles d'une campagne : un ZIP
  qui contient
  - les images en JPEG sRGB : `tim_<campagne>_<angle>_<format>_v<n>.jpg` (1080 × 1080,
    1080 × 1350, 1080 × 1920) ;
  - les vidéos en MP4 H.264 / AAC, 30 i/s, mêmes noms ;
  - un fichier `textes.csv` (et sa version `.txt` lisible) : textes principaux, titres,
    descriptions, CTA, **URL de destination et paramètres d'URL** prêts à coller dans
    le Gestionnaire de publicités.

  Le ZIP se construit en flux côté serveur (une petite dépendance, `fflate`). Les
  fichiers restent dans `ad-media` : le téléchargement ne déplace rien.
- Une créa téléchargée reste `validee` ; `en-ligne` n'existera qu'en 3b, quand c'est
  le support qui la publie — on ne marque pas en ligne ce qu'on ne voit pas en ligne.

### 8. Découpage en commits

Le schéma change aux commits 1, 2 et 4 : **une seule migration** pour les trois,
appliquée une fois sur la base partagée, après dump vérifié et feu vert (comme en
phase 0).

| # | Commit | Schéma |
|---|---|---|
| 1 | Kit de marque : global `ads-brand-kit`, collection `ad-media` (Blob `ads/`, admin seul) | migration commune |
| 2 | Brief : campagnes `brouillon` créables dans le support, groupe `brief`, champs miroir verrouillés champ par champ ; budgets IA et vidéo dans `ads-settings` | migration commune |
| 3 | `ai-budget` générique : tarifs par modèle et par fournisseur, compteur par usage, contrôle **avant** l'appel ; l'assistant existant passe dessus sans changer de comportement | — |
| 4 | Collection `ad-creatives` (§4.3) : textes, variantes, statut, origine, coût, garde-fous déclenchés | migration commune |
| 5 | Génération de textes : Claude en sortie structurée, les cinq garde-fous en code, bouton « Générer » sur la campagne | — |
| 6 | Gabarits statiques : Satori + sharp, 3 gabarits × 3 formats, contrôle des dimensions et de la zone sûre | — |
| 7 | File « À valider », tableau de bord, téléchargement ZIP | — |
| 8 | Fonds par Imagen 4 (facultatif par gabarit), sous plafond | — |
| 9 | Motion : Remotion sur Vercel Sandbox, rendu asynchrone — **après la décision de licence** | — |
| 10 | Vidéo générative : Veo, plafonnée — **en dernier, en option** | — |

Les commits 1 à 7 font un atelier utilisable (textes + visuels + validation +
téléchargement) sans aucune clé nouvelle hors Anthropic.

### 9. Ce que j'attends de toi

**Fichiers (pour le kit de marque)**
- Logo en **SVG** et PNG, variantes couleur / blanc.
- Couleurs de charte en hex.
- Polices en **TTF ou OTF**, avec leur licence (usage publicitaire).
- 10 à 20 **captures de l'app** en haute définition (web et mobile), sans données de
  vrais clients, chacune avec la fonctionnalité qu'elle montre.
- Photos de chantier / d'équipe **dont TIM a les droits**, avec l'accord des personnes
  visibles.
- La liste des **faits chiffrés avec leur source**, et celle des **mentions
  interdites**.
- Si motion avec musique : une piste libre de droits.

**Clés et comptes**
- `ANTHROPIC_API_KEY` : déjà posée (assistant). Vérifier le plafond mensuel sur la
  console Anthropic.
- `GEMINI_API_KEY` : Google AI Studio, facturation activée — seulement au commit 8
  (images) et 10 (vidéo).
- Vercel **Pro** et le bon projet lié en local (`vercel link` sur le projet de
  production) : le Sandbox s'authentifie par le jeton OIDC du projet (commit 9).
- Licence Remotion si elle est nécessaire (commit 9).

**Choix**
1. Le brief sur une campagne `brouillon` créée dans le support (recommandé) — ou une
   collection de briefs à part.
2. Le modèle des textes : Opus 5 (recommandé, ~0,10 $ la génération) ou Sonnet 5
   (~0,04 $).
3. Le motion : **combien de personnes chez TIM / LC DEV** utiliseront l'outil ? Jusqu'à
   3 : Remotion gratuit. Au-delà : Remotion à 100 $/mois minimum, ou le montage
   simple par ffmpeg, gratuit.
4. Les budgets : IA (texte + images) par jour et par mois ; vidéo générée par mois.
5. Les CTA Meta autorisés pour TIM, et le tutoiement ou le vouvoiement.

Sources des tarifs (relevés le 29/09/2026, à revérifier à la souscription) :
[Meta — limites de texte](https://adsuploader.com/blog/meta-ad-copy-specs),
[Meta — zones sûres 2026](https://adsuploader.com/blog/meta-ads-safe-zones),
[Remotion — licences](https://www.remotion.dev/docs/license/pricing),
[Remotion sur Vercel Sandbox](https://www.remotion.dev/docs/vercel-sandbox),
[Vercel Sandbox — tarifs](https://vercel.com/docs/sandbox/pricing),
[Gemini API — tarifs Veo et images](https://ai.google.dev/gemini-api/docs/pricing),
[Comparatif des API d'images 2026](https://www.buildmvpfast.com/api-costs/ai-image),
[Runway — tarifs API](https://fairstack.ai/blog/runway-pricing).

---

## 9 quater. Phase 3c — Agent de campagne

> Plan rédigé le 29/09/2026. **Rien n'est codé.** S'appuie sur l'atelier 3a
> (commits 1 à 7, en production) : l'agent se sert de ses outils, il n'en recopie
> aucun.

### Décisions du 29/09/2026 (plan validé)

Elles priment sur le texte qui suit quand il y a un écart.

| # | Sujet | Décision |
|---|---|---|
| 1 | Bibliothèque publicitaire Meta | Vérification d'identité : Charlie. Jeton de 60 jours : **rappel à J-7 et renouvellement à la main**, pas de rafraîchissement automatique. Date d'expiration saisie dans `ads-settings` |
| 2 | Concurrents | Une **liste de départ** fournie par Charlie. L'agent peut en **proposer** d'autres par mots-clés : ils n'entrent dans la liste qu'**après validation** par Charlie. Collection `ad-competitors` (§6) |
| 3 | Budget de préparation | **Séparé** : **5 € maximum par passage** de préparation (`agentPrepMaxEur`). La part IA quotidienne (total × part IA max) sert à l'**optimisation une fois la campagne publiée**, pas à la préparation |
| 4 | Valeurs par défaut | Part IA 15 %, plancher Meta 5 €/jour, plafond global des agents **15 €/jour** et **150 €/mois**, 2 niveaux, 3 agents simultanés, 12 par passage, 2 rejets par créa |
| 5 | Clients signés | **Chiffres anonymes uniquement**, région comprise. **Jamais** de nom d'entreprise ni de personne |
| 6 | Textes | Écrits par Opus via l'outil de l'atelier ; le rédacteur ne fait que cadrer |
| 7 | Audiences | Ciblage détaillé **et** Advantage+ comparés en test **seulement si le budget Meta suffit à alimenter les deux**. L'agent justifie le seuil dans le journal (chiffres à l'appui). Sinon, **Advantage+ seul** |
| 8 | Relance | L'agent **ajoute** des créas, il ne remplace **jamais**. Les créas non validées restent jusqu'au refus de Charlie |
| 9 | Modèles | Identifiants vérifiés sur l'API Anthropic le 29/09/2026 : `claude-opus-5-5`, `claude-sonnet-5-5` (sorti le 28/09), `claude-haiku-4-5`. **Sonnet 5.5 remplace Sonnet 5** partout dans ce plan. Un seul endroit : `modules/ads/lib/models.ts` |
| 10 | Budget Meta | Relire la page Meta sur les budgets quotidiens **dans un navigateur** avant de coder le moteur de budget (commit 2) |
| 11 | Ordre | L'atelier 3a (commits 1 à 7) est terminé et en production ; la 3c enchaîne. Rien n'est poussé sans feu vert |

**Ce que ces décisions changent dans la suite :**

- **Budget d'un passage de préparation** = `min(agentPrepMaxEur, ce qui reste du jour
  et du mois au plafond global)`. Il est réservé à l'orchestrateur au lancement. La
  pause « budget du jour épuisé » ne sert plus qu'au plafond **global** (15 €/jour,
  150 €/mois), quand plusieurs campagnes tournent.
- **Audiences** : la décision `audience` porte obligatoirement, **en champs
  structurés**, le budget Meta quotidien, le nombre d'ensembles de publicités, le CPL
  cible et les conversions attendues par semaine et par ensemble. Le code refuse un
  test à deux audiences si ces champs manquent. Le **seuil** reste le jugement de
  l'agent, écrit dans la justification.
- **Concurrents proposés** : ils arrivent dans « À valider ». Le bouton « Ajouter à
  la liste » **est** l'action (pas de validation intermédiaire), comme « Refuser ».
- **Relance** : le lancement vérifie le plafond hebdomadaire de créas par campagne
  (`creativesPerCampaignPerWeek`). S'il est atteint, le bouton l'annonce et dit
  quand il se libère.

### 1. Principe

Sur une campagne `brouillon`, on saisit **un objectif en une phrase** et **un budget
quotidien TOTAL** en euros, puis on clique sur **« Lancer l'agent »**. Un agent
orchestrateur prépare toute la campagne : positionnement, audiences Meta, angles,
textes, visuels, animations. Il dépose le tout dans **« À valider »**.

**En 3c, rien n'est publié chez Meta.** Les audiences et la répartition du budget
sont des **propositions** écrites dans le support. La publication viendra en 3b ;
toute modification de budget chez Meta passera alors par les garde-fous de la
phase 2 (§6) et par le niveau d'autonomie de la campagne (D5).

Le clic sur « Lancer l'agent » **est** l'action : il démarre le passage. Il n'y a
pas de bouton « valider » intermédiaire. Le bouton « Arrêter » **est** aussi
l'action : il arrête tout de suite l'arbre d'agents, et ce qui a déjà été produit
reste en place.

### 2. Les sous-agents dynamiques

**L'orchestrateur ne fait rien lui-même.** Il n'a accès qu'aux outils
d'orchestration :

- `creer_sous_agent(role, mission, outils, budgetEur)` ;
- `attendre_sous_agents` et `lire_resultat` ;
- `repartir_budget` ;
- `deposer_a_valider`, qui termine le passage.

Il crée autant de sous-agents qu'il le juge utile. Chaque création passe par le
code, qui vérifie :

- que le rôle existe dans le registre ;
- que chaque outil demandé est **autorisé pour ce rôle** (la liste de chaque rôle est
  écrite en code, pas choisie par le modèle) ;
- que le budget demandé tient dans ce qui reste au parent. Il est alors **réservé** :
  la somme des budgets des enfants ne dépasse jamais le budget du parent ;
- les limites de profondeur et de nombre de sous-agents simultanés.

Chaque création est une décision journalisée (`creation-sous-agent`), avec la
justification donnée par l'orchestrateur.

**Rôles au départ :**

| Rôle | Mission type | Outils autorisés | Modèle proposé |
|---|---|---|---|
| Stratège | Positionnement, audiences, angles | `lire_kit_marque`, `lire_site`, `lire_leads_par_canal`, `lire_clients_signes`, `lire_pubs_concurrents`, `proposer_positionnement`, `proposer_audiences`, `proposer_angles` | Opus (le raisonnement qui décide tout le reste) |
| Rédacteur | Textes d'un ou plusieurs angles | `generer_textes` (= la génération 3a) | Sonnet 5.5 pour cadrer ; les textes restent écrits par l'outil 3a, donc par Opus (`ADS_TEXT_MODEL`) |
| Directeur artistique | Choix des gabarits, des captures, des chiffres affichés, du motion | `lister_gabarits`, `lister_medias`, `rendre_visuels` (= rendu 3a), `rendre_motion` (après le commit 3a n° 9) | Sonnet 5.5 |
| Contrôleur | Accepte ou rejette une créa, avec motif | `verifier_crea` : d'abord les garde-fous en code de 3a (limites Meta, chiffre sans source, faux témoignage, attribut personnel, ton), puis un jugement sur la charte ; `rejeter` / `accepter` | Sonnet 5.5 |
| Analyste (phase 2) | Lire les résultats une fois publiée | `lire_perfs`, `lire_decisions_passees` | Sonnet 5.5 — **pas en 3c** |

**Extraction** (lecture et résumé des pages du site, des pubs concurrentes) : Haiku
4.5. C'est une fonction appelée **par** un outil du stratège, pas un agent. Elle
évite de payer du Opus pour lire du HTML.

**Garde-fous de l'arbre, en code** (`modules/ads/agent/limits.ts`, constantes non
réglables depuis l'admin) :

| Garde-fou | Valeur proposée | Au-delà |
|---|---|---|
| Profondeur de création | 2 (orchestrateur → sous-agent → sous-sous-agent) | `creer_sous_agent` refusé, avec le motif renvoyé au modèle |
| Sous-agents simultanés | 3 | La création attend qu'une place se libère (le pool Supabase fait 15 connexions) |
| Sous-agents par passage | 12 | Refus |
| Rejets du contrôleur par créa | 2 | La créa part « À valider » **marquée rejetée**, avec les motifs ; elle n'est pas réécrite une troisième fois |
| Tours de modèle par agent | 25 | L'agent est arrêté, son parent reçoit l'échec |
| **Budget** | voir §3 | **Aucun appel ne part s'il ne tient pas dans le budget restant** (coût maximal calculé *avant* l'appel, comme `claudeMaxCostUsd` en 3a) |

**Les sources du stratège :**

1. **Le kit de marque** (`ads-brand-kit`), les faits sourcés (`ad-facts`) et le brief
   de la campagne.
2. **Les pages de tim-management.co.** Elles sont lues par une récupération côté
   serveur, limitée à ce domaine (liste blanche en code), avec un texte extrait et
   résumé par Haiku. Ce n'est pas l'outil de navigation web de Claude : aucune autre
   page n'est lisible.
3. **Les leads passés par canal**, et surtout **ceux qui ont signé**. On réutilise la
   chaîne de `modules/analytics/lib/acquisition.ts` (lead → fiche → gagnée) et
   `partner-clients`. **Seuls des agrégats anonymes partent chez Claude** : métier,
   effectif, région, canal, délai de signature. Aucun nom, e-mail ni SIREN.
4. **Les pubs des concurrents**, via l'API de la bibliothèque publicitaire Meta (voir
   ci-dessous). Même principe que l'adaptateur Meta : une variable d'environnement
   bascule sur des données simulées tant que l'accès n'est pas ouvert.

**L'API de la bibliothèque publicitaire Meta depuis la France — vérifié le
29/09/2026 :**

- **Les pubs commerciales sont accessibles pour la France.** La documentation de
  l'endpoint `ads_archive` indique que les pubs qui n'ont atteint aucun pays de l'UE
  ne sont renvoyées que si elles portent sur des sujets sociaux, électoraux ou
  politiques. Une requête avec `ad_reached_countries=['FR']` et `ad_type=ALL` renvoie
  donc les pubs commerciales diffusées en France. C'est l'effet du DSA, article 39.
- **Ce qu'on obtient** (sources secondaires, à confirmer au commit 5 sur une vraie
  requête) :
  - les textes, titres et descriptions ;
  - les dates de diffusion et les plateformes ;
  - un lien vers l'aperçu de la pub ;
  - des champs propres à l'UE : couverture totale dans l'UE, âges, sexes et lieux
    ciblés, bénéficiaire et payeur.
- **Ce qu'on n'obtient pas pour les pubs commerciales** : les dépenses et les
  impressions (réservées aux pubs politiques). On voit ce que les concurrents disent,
  pas ce qui marche chez eux. **La durée de diffusion sert d'indice** : une pub qui
  tourne depuis des mois rapporte probablement.
- **Pas d'image exploitable directement** : l'API donne un lien d'aperçu, pas le
  fichier. Le stratège travaille donc sur les **textes** et sur les angles des
  concurrents. Ces textes servent d'analyse, jamais de modèle à recopier : le
  contrôleur rejette toute reprise.
- **Accès** : une **vérification d'identité d'une personne** (pièce d'identité et pays)
  sur Meta, puis une app avec le produit « Ad Library API ». Le jeton expire au bout
  de 60 jours ; il faudra le renouveler ou le rafraîchir (question 1).

### 3. Le budget par campagne

**Un seul chiffre saisi : le budget quotidien TOTAL, en euros.** L'agent le partage
entre :

- **l'IA** : les tokens Claude, convertis en euros par `core/lib/ai-pricing.ts` et
  comptés dans le registre `ad-ai-usage` ;
- **la dépense Meta**.

Chaque partage est une décision `repartition-budget` journalisée, avec sa
justification (« phase de préparation : 100 % de la part IA utile, Meta à 0 tant
que rien n'est publié »).

**Bornes en code, réglables par campagne dans ces bornes :**

| Borne | Défaut | Plage autorisée par le code |
|---|---|---|
| Total quotidien | saisi | > 0 ; plafonné par le plafond mensuel du compte (§6) |
| Part IA maximale | 15 % du total | 0 à 50 % |
| Dépense Meta plancher | 5 €/jour | ≥ 0 ; total − part IA max ≥ plancher, sinon la saisie est refusée |

**Invariants, vérifiés en code avant chaque appel et à chaque décision :**

1. `IA du jour ≤ part IA décidée ≤ total × part IA max`. C'est un plafond dur :
   l'appel qui dépasserait ne part pas.
2. `Meta décidée + IA décidée ≤ total`, et `Meta décidée ≥ plancher`.
3. **Tant que la campagne n'est pas publiée, seule la part IA est consommée.** Le
   budget Meta décidé reste une proposition.
4. Le plafond global d'`ads-settings` reste au-dessus de tout (`agentDailyEur`
   15 €/jour et `agentMonthlyEur` 150 €/mois, toutes campagnes confondues).
   L'interrupteur général coupe aussi les agents.

> **Décision du 29/09/2026** : la préparation a son **propre budget**, 5 € maximum
> par passage (`agentPrepMaxEur`). Les invariants 1 et 2 (part IA quotidienne)
> s'appliquent à l'**optimisation une fois la campagne publiée**, pas à la
> préparation.

**Quand le plafond global du jour est épuisé** (plusieurs campagnes le même jour),
le passage se met en pause (`en-pause-budget`) et reprend le lendemain, là où il
s'était arrêté (§5). Le budget de 5 € du passage, lui, ne se renouvelle pas : une
fois dépensé, le passage dépose ce qu'il a.

**Meta raisonne à la semaine — page relue dans un navigateur le 29/09/2026**
(Chrome, version française de
[Meta — À propos des budgets quotidiens](https://www.facebook.com/business/help/190490051321426)).
Ce qu'elle dit, citations à l'appui :

| Règle | Texte de Meta |
|---|---|
| Plafond du jour | « Pour chaque jour se terminant à minuit, les dépenses ne seront pas supérieures à **175 %** de votre budget quotidien. » |
| Plafond de la semaine | « Pour chaque semaine se terminant **le samedi à minuit**, les dépenses ne seront pas plus de **sept fois** supérieures à votre budget quotidien. » — semaine civile, **du dimanche au samedi**, pas 7 jours glissants |
| Partage du budget entre ensembles de publicités | S'il est activé, les plafonds montent : pour 100 €/jour, **210 €** un jour et **840 €** la semaine (soit 2,1 × et 8,4 ×) |
| Démarrage ou changement de budget en milieu de semaine | Meta repart de zéro pour le reste de la semaine : **nouveau budget × jours restants + jusqu'à 25 % du budget quotidien**. Exemple de Meta : passage de 100 € à 50 € le mercredi à midi → au plus 212,50 € du mercredi au samedi, **plus** ce qui a été dépensé du dimanche au mardi |
| Changement en cours de journée | Le plafond du jour devient 175 % du **budget le plus élevé** défini ce jour-là |
| Date de fin en cours de semaine | Budget × jours de diffusion de la semaine + jusqu'à 25 % |

Ce que ça impose au suivi :

- **La jauge Meta est hebdomadaire**, semaine du dimanche au samedi. Une journée
  jusqu'à 1,75 × le budget Meta est normale : elle s'affiche « dans la tolérance
  Meta », pas en alerte.
- **Le plafond de la semaine se calcule par segments**, pas en « 7 × le budget
  actuel ». À chaque changement de budget (ou au démarrage), un nouveau segment
  commence : `budget × jours restants + 25 % du budget`. Le plafond de la semaine
  est la dépense des segments passés plus celui du segment en cours. Le moteur de
  budget (commit 2) reproduit ce calcul, exemples de Meta en tests.
- **Le partage du budget entre ensembles de publicités** porte les plafonds à 2,1 ×
  et 8,4 ×. En 3b, l'agent ne l'active pas sans le dire : le moteur prend le
  multiplicateur en paramètre, et la jauge affiche lequel s'applique.
- **L'alerte** se déclenche quand la dépense réelle dépasse le plafond calculé :
  Meta n'a alors pas respecté sa règle.
- **Le total se garantit à la semaine**, pas au jour : un jour donné, le total peut
  **paraître** dépassé à cause de Meta. C'est prévu et expliqué sous la jauge.
- **La semaine suit le fuseau du compte publicitaire**, pas Paris. Il est lu sur
  `ad-accounts`.
- **Conséquence pour la phase 2** : un changement de budget en milieu de semaine
  rouvre une marge de 25 %. Des changements fréquents font donc dépenser un peu
  plus. Le délai minimal de 72 h entre deux modifications (§6) le limite déjà.

### 4. La salle de contrôle, par campagne

Un onglet « Agent » sur la campagne (`/admin/publicite/campagnes/[id]/agent`). Il
est rafraîchi toutes les 5 s tant qu'un passage tourne, et arrêté sinon. C'est du
polling : un flux temps réel serait plus complexe pour un gain nul à cette échelle.

- **L'arbre des agents, en direct** : qui a créé qui, rôle, mission, état (pastille),
  tokens et coût. Une ligne par agent, indentée sous son parent. Le coût s'affiche
  en regard du budget réservé à cet agent.
- **Le fil d'activité**, lisible par un humain :
  - « Le stratège lit 4 pages du site » ;
  - « Le contrôleur rejette la créa 3 : chiffre “40 %” sans source ».
  
  Chaque phrase est **écrite par le code** à partir du nom de l'outil et de ses
  arguments : pas de JSON brut, et pas de modèle payé pour résumer.
- **Les jauges** :
  - IA : jour et semaine, dépensé et restant ;
  - Meta : semaine et jour, dépensé et restant. Avant la publication, la jauge Meta
    affiche « pas encore publiée ».
- **Le journal des décisions** : répartitions du budget, choix d'angles et
  d'audiences, rejets du contrôleur, créations de sous-agents. Chacune porte sa
  justification. On filtre par type.
- **Les boutons** : « Lancer l'agent » (si aucun passage ne tourne), « Arrêter »
  (pendant un passage).

**Vue globale**, dans le tableau de bord Publicité : une carte « Agents » avec
toutes les campagnes, leur passage en cours ou le dernier, le nombre d'agents
actifs, et le coût IA du jour (total et par campagne, face au plafond global).

Dans **« À valider »**, les créas de l'agent arrivent comme celles de 3a. Elles
sont précédées d'une carte **« Proposition de l'agent »** pour la campagne :
positionnement, audiences, répartition du budget, et lien vers la salle de
contrôle.

### 5. Technique

**Anthropic SDK et tool use, sans autre framework.** On utilise une boucle manuelle
(`messages.create`, ou le stream avec `finalMessage` pour les appels longs), et pas
le *tool runner*. Chaque tour doit être **écrit en base avant le suivant**, pour
pouvoir reprendre.

Deux contraintes d'Opus 5.5 :

- La réflexion est toujours active. Les blocs de réflexion d'un tour sont donc
  stockés avec la réponse et renvoyés tels quels.
- Un `tool_choice` forcé renvoie une erreur 400. La fin d'un agent passe donc par son
  outil `terminer`. Si le modèle s'arrête sans l'appeler, le code relance une fois,
  puis déclare l'échec.

**Identifiants de modèles à un seul endroit** (`modules/ads/lib/models.ts`, qui
contient déjà `ADS_TEXT_MODEL`) :

```ts
export const ADS_AGENT_MODELS = {
  orchestrateur: "claude-opus-5-5",
  stratege: "claude-opus-5-5",
  redacteur: "claude-sonnet-5-5",
  "directeur-artistique": "claude-sonnet-5-5",
  controleur: "claude-sonnet-5-5",
  extraction: "claude-haiku-4-5",
} as const satisfies Record<AgentRole | "extraction", ClaudeModel>;
```

`claude-sonnet-5-5` s'ajoute à `CLAUDE_PRICES` : 2 $ / 10 $ par million de tokens en
entrée / sortie, 2,50 $ en écriture de cache et 0,20 $ en lecture (grille
d'Anthropic du 29/09/2026). Comme Opus 5.5, il n'accepte pas de `tool_choice`
forcé.

**Les outils de l'agent sont ceux de l'atelier.** Chaque outil est une entrée du
registre (`modules/ads/agent/tools/`) : nom, description, schéma d'entrée, rôles
autorisés, fonction, phrase du fil. La fonction **appelle** le code 3a existant :

| Outil de l'agent | Code 3a appelé |
|---|---|
| `generer_textes` | `generateCreatives` (`copy/generate.ts`) — garde-fous et budget compris |
| `verifier_crea` | `guard` (`copy/guardrails.ts`) |
| `rendre_visuels` | `renderCreativeVisuals` (`render/visuals.ts`) |
| `lister_gabarits` | `render/templates.tsx` |
| `lire_kit_marque` | `loadGenerationContext` |
| `deposer_a_valider` | le statut `a-valider` des créas, déjà lu par la file 3a |
| comptage des coûts | `recordAdsUsage` / `assertAdsBudget` (`spend.ts`), avec le passage et l'agent en plus |

**Vercel Workflows ou cron et étapes en base.**

Vercel Workflows est disponible pour tous depuis avril 2026 (directives `"use
workflow"` et `"use step"`). Il apporte des étapes durables, des reprises
automatiques, des attentes, des sous-workflows et un tableau de suivi. Son coût
serait négligeable ici : 0,02 $ les 1 000 événements, environ 3 événements par
étape, soit quelques centimes par mois.

**Je recommande quand même le cron avec les étapes en base**, pour quatre raisons :

1. **La base est de toute façon la source de vérité.** La salle de contrôle, le
   journal des décisions et l'audit lisent `ad-agent-steps`. Avec Workflows, l'état
   vivrait **deux fois** : chez Vercel (conservé 7 jours sur Pro, puis effacé) et chez
   nous. C'est exactement le doublon qu'on s'interdit.
2. **Le modèle de rejeu de Workflows** exige un code d'orchestration déterministe.
   Or un arbre créé dynamiquement par un modèle se prête mal à cette discipline, et
   on ajouterait un plugin de compilation (`withWorkflow` dans `next.config`), une
   dépendance et une façon de faire nouvelle dans un dépôt qui tourne déjà sur une
   quinzaine de crons.
3. **Une étape ici, c'est un appel de modèle ou un outil**, qui tient dans une
   fonction de 300 s. On n'a besoin ni d'attentes de plusieurs jours, ni de milliers
   d'étapes.
4. **La reprise reste simple à écrire :**
   - un verrou à bail sur le passage (`leaseUntil`) évite qu'il soit traité deux
     fois ;
   - chaque étape a une clé d'idempotence ;
   - la conversation d'un agent se **reconstruit** à partir de ses étapes.

**Comment ça avance :**

- Le clic lance la première étape.
- Chaque étape finie enchaîne la suivante avec `after()`, sans attendre le cron.
- Un cron `ads-agent-tick`, **chaque minute**, reprend les passages dont le bail a
  expiré (fonction tuée, déploiement, erreur). Il relance aussi ceux en pause de
  budget quand le jour change.

**À revoir** si on a besoin plus tard d'attentes humaines longues au milieu d'un
passage, ou de dizaines de campagnes en parallèle. Workflows redeviendrait alors
intéressant.

### 6. Modèle de données

Une **seule migration**, appliquée après un dump vérifié et ton feu vert. Les
collections `ad-agent-runs` et `ad-decisions` sont prévues en §4.4 et §4.5 mais
**n'existent pas encore dans le code** : 3c les crée, en y ajoutant ce qui lui
manque. Aucun champ ne s'appelle `texts`, `numbers`, `rels` ou `locales` (tables
réservées de Payload, test existant).

**`ad-agent-runs` — un passage (un clic sur « Lancer l'agent »)**

| Champ | Type | Rôle |
|---|---|---|
| `campaign` | relation | La campagne |
| `objective` | textarea | La phrase saisie |
| `status` | select | `en-cours` · `en-pause-budget` · `a-valider` · `termine` · `arrete` · `echoue` |
| `startedBy`, `startedAt`, `finishedAt` | relation / dates | Qui, quand |
| `limits` | json | Photo des bornes au lancement : part IA, plancher, profondeur, simultanés, rejets |
| `leaseUntil` | date | Verrou de reprise |
| `tokens`, `costEur` | group / number | Totaux, recalculés à partir des étapes |
| `summary` | textarea | Ce que l'orchestrateur a déposé, en 5 lignes |
| `error` | text | Motif d'échec ou d'arrêt |

**`ad-agents` — un nœud de l'arbre (nouvelle collection)**

| Champ | Type | Rôle |
|---|---|---|
| `run` | relation | Le passage |
| `parent` | relation → `ad-agents` | Vide pour l'orchestrateur |
| `depth` | number | 0 pour l'orchestrateur |
| `role` | select | `orchestrateur` · `stratege` · `redacteur` · `directeur-artistique` · `controleur` · `analyste` |
| `mission` | textarea | Écrite par le parent |
| `tools` | select multiple | Sous-ensemble des outils autorisés pour ce rôle |
| `model` | text | Lu dans `ADS_AGENT_MODELS` à la création |
| `budgetEur`, `spentEur` | number | Réservé par le parent / consommé |
| `tokens` | group | Entrée, sortie, cache lu, cache écrit |
| `status` | select | `en-attente` · `en-cours` · `termine` · `echoue` · `arrete` |
| `result` | json | Ce que l'agent renvoie à son parent (via `terminer`) |

**`ad-agent-steps` — une étape (nouvelle collection)**

| Champ | Type | Rôle |
|---|---|---|
| `run`, `agent` | relations | — |
| `seq` | number | Ordre dans l'agent (unique par agent) |
| `kind` | select | `modele` · `outil` |
| `tool` | text | Nom de l'outil |
| `input`, `output` | json | Pour `modele` : les blocs de la réponse (réflexion comprise), pour rejouer la conversation |
| `line` | text | **La phrase du fil d'activité** |
| `tokens`, `costEur` | group / number | Pour `modele` |
| `status` | select | `en-cours` · `fait` · `echoue` |
| `idempotencyKey` | text, unique | Une étape reprise ne s'exécute pas deux fois |
| `startedAt`, `finishedAt` | dates | — |

**`ad-decisions` — le journal (§4.4, créé ici)** : les champs de §4.4, plus `agent`
et `step`, et plus ces types :

- `repartition-budget` ;
- `positionnement` ;
- `angle` ;
- `audience` ;
- `rejet-controleur` ;
- `creation-sous-agent`.

Les décisions internes à la préparation naissent `executee` (le code les a
appliquées dans le support). Toute décision qui toucherait Meta naît `proposee`,
et 3c n'en exécute aucune.

**Le budget, sur `ad-campaigns`** : un groupe `agentBudget` avec :

- `totalDailyEur` ;
- `maxAiSharePct` ;
- `metaFloorEur` ;
- `split` (part IA et part Meta en vigueur, avec la date et la décision
  d'origine). C'est une copie de la dernière `repartition-budget`, pour que les
  jauges ne relisent pas tout le journal.

**Le registre de dépense `ad-ai-usage`** reçoit deux relations, `run` et `agent`, et
le type de dépense `agent`. Les jauges se **calculent** :

- l'IA à partir d'`ad-ai-usage` ;
- Meta à partir d'`ad-metrics-daily`.

Rien n'est stocké en double.

**`ads-settings`** reçoit :

- `agentDailyEur` (15 €) et `agentMonthlyEur` (150 €) : le plafond IA global des
  agents, toutes campagnes confondues ;
- `agentPrepMaxEur` (5 €) : le budget maximal d'un passage de préparation ;
- `adLibraryTokenExpiresAt` : la date d'expiration du jeton de la bibliothèque
  publicitaire, pour le rappel à J-7.

**`ad-competitors` — les concurrents suivis (nouvelle collection)**

| Champ | Type | Rôle |
|---|---|---|
| `name` | text | Nom affiché |
| `pageId` | text, **unique, obligatoire** | L'identifiant de la page Meta, référence du concurrent et clé de `search_page_ids`. On y colle un lien de la bibliothèque publicitaire (l'identifiant est extrait de `view_all_page_id`) ou l'identifiant seul ; un lien sans identifiant est refusé avec la marche à suivre ; un doublon est refusé en nommant le concurrent déjà présent (décision du 29/09/2026) |
| `sourceUrl` | text, lecture seule | Le lien collé, tel quel |
| `status` | select | `suivi` · `propose` · `refuse` |
| `proposedBy` | relation → `ad-agent-runs` | Vide pour la liste de départ |
| `keywords`, `rationale` | text / textarea | Les mots-clés qui l'ont fait trouver, et pourquoi l'agent le propose |
| `decidedAt` | date | Ajout ou refus par Charlie |

Seuls les concurrents `suivi` sont lus par l'outil `lire_pubs_concurrents`.
L'outil `proposer_concurrent` crée une ligne `propose`, jamais `suivi`.

### 7. Coût IA estimé pour préparer une campagne

Hypothèse : une campagne de 6 créas, un rejet du contrôleur sur deux créas. Tarifs
du 29/09/2026 :

- Opus 5.5 : 4 $ / 20 $ par million de tokens en entrée / sortie ;
- Sonnet 5.5 : 2 $ / 10 $ ;
- Haiku 4.5 : 1 $ / 5 $.

Le cache est actif sur les instructions système et le contexte de marque.

| Poste | Volume estimé | Coût |
|---|---|---|
| Orchestrateur (Opus), ~10 tours | 200 k lus en cache, 25 k entrée neuve, 15 k sortie avec réflexion | ~0,55 $ |
| Stratège (Opus) | 40 k entrée, 10 k sortie | ~0,40 $ |
| Extraction des sources (Haiku) | ~10 pages et 30 pubs : 60 k entrée, 10 k sortie | ~0,10 $ |
| Rédacteur (Sonnet) + génération 3a (Opus), 2 lots + 2 réécritures | cadrage ~0,15 $ ; génération ~0,10 $ par lot | ~0,50 $ |
| Directeur artistique (Sonnet) | 20 k entrée, 5 k sortie | ~0,10 $ |
| Contrôleur (Sonnet), 8 vérifications | 60 k entrée, 8 k sortie | ~0,20 $ |
| Rendu Satori | calcul serveur | 0 $ |
| Motion (Remotion sur Sandbox), si activé | ~0,02 $ par vidéo de 15 s | ~0,10 $ |
| **Total** | | **~1,95 $ ≈ 1,80 €** |

**Fourchette réaliste : 1,50 à 3 € par préparation.** Le pire cas est plafonné par
construction : ce que la part IA de la campagne autorise, soit `total × part IA max`
par jour. Le chiffre réel sera mesuré au premier passage et noté ici.

### 8. Découpage en commits

Les quatre portes avant chaque commit. **Une seule migration**, au commit 1.

| # | Commit | Schéma |
|---|---|---|
| 1 | Collections `ad-agent-runs`, `ad-agents`, `ad-agent-steps`, `ad-decisions` ; groupe `agentBudget` sur les campagnes ; `run`, `agent` et le type `agent` sur `ad-ai-usage` ; `ad-competitors` ; `agentDailyEur`, `agentMonthlyEur`, `agentPrepMaxEur`, `adLibraryTokenExpiresAt` dans `ads-settings`. Accès : rôles admin, écriture par le serveur seul | migration |
| 2 | Moteur de budget, **pur et testé** : bornes, invariants, part IA du jour, semaine Meta (dimanche → samedi, fuseau du compte), réservation parent → enfants ; Sonnet 5.5 dans `CLAUDE_PRICES` ; `ADS_AGENT_MODELS` | — |
| 3 | Moteur d'agents : registre des rôles et des outils, boucle de tool use avec chaque tour écrit en base, reconstruction de la conversation, bail et idempotence, limites de l'arbre. Tests avec un **faux modèle** (pas de réseau, cf. `setup-isolation`) | — |
| 4 | Outils branchés sur l'atelier 3a (textes, garde-fous, rendu, kit, dépôt « À valider ») et outils d'orchestration (`creer_sous_agent`, `repartir_budget`, `terminer`) ; phrases du fil | — |
| 5 | Sources du stratège : pages du site (liste blanche, extraction Haiku), agrégats anonymes leads / signés, bibliothèque publicitaire Meta (mode simulé par variable d'environnement tant que l'accès n'est pas ouvert) | — |
| 6 | Pilotage : route « Lancer l'agent » / « Arrêter », enchaînement par `after()`, cron `ads-agent-tick` chaque minute (`vercel.json`) | — |
| 7 | Salle de contrôle : arbre, fil, jauges, journal | — |
| 8 | Vue globale au tableau de bord, carte « Proposition de l'agent » dans « À valider », icônes du menu ; mise à jour de `docs/REGLES-SUPPORT.md` | — |
| 9 | Outil `rendre_motion`, **après** le commit 3a n° 9 (Remotion) | — |

Les commits 1 à 8 donnent un agent complet sur les gabarits statiques. Le premier
vrai passage se fera sur une campagne de test, avec un budget de préparation
volontairement bas (1 €), pour vérifier l'arrêt sur budget et la reprise en
conditions réelles.

### 9. Questions (réponses : voir « Décisions du 29/09/2026 » en tête de section)

1. **La bibliothèque publicitaire Meta demande la vérification d'identité d'une
   personne.** La tienne ? Le jeton expire au bout de 60 jours : on le renouvelle à
   la main (rappel dans le support) ou on code le rafraîchissement ?
2. **Les concurrents** : tu fournis une liste de pages Facebook, ou l'agent cherche
   par mots-clés (« logiciel BTP », « pointage chantier ») ?
3. **La part IA avant la publication** : elle reste bornée par `total × part IA max`
   (proposé), ou tu préfères un budget de préparation à part, en une fois ?
4. **Les valeurs par défaut** : part IA 15 %, plancher Meta 5 €/jour, plafond global
   des agents 15 €/jour, profondeur 2, 3 agents simultanés, 12 par passage, 2 rejets.
5. **Les clients signés** : les agrégats anonymes (métier, effectif, région, canal,
   délai) te conviennent, ou tu exclus aussi la région ?
6. **Les textes** : ils restent écrits par Opus via l'outil 3a (décision 3a, un seul
   endroit), le rédacteur en Sonnet ne faisant que cadrer. C'est d'accord ?
7. **Les audiences proposées** : ciblage détaillé (métiers, âges, lieux), Advantage+
   audience de Meta, ou les deux avec la comparaison comme dimension de test ?
8. **Un nouveau lancement sur une campagne qui a déjà des créas** : il **ajoute** des
   créas (proposé, dans la limite hebdomadaire `creativesPerCampaignPerWeek`) ou il
   **remplace** celles qui ne sont pas encore validées ?

Sources (relevées le 29/09/2026) :

- [Meta — À propos des budgets quotidiens](https://www.facebook.com/business/help/190490051321426),
  avec l'explication par un tiers : [Jon Loomer — Updates to Meta Ads Budgeting](https://www.jonloomer.com/updates-to-meta-ads-budgeting/) ;
- [Meta — référence de `ads_archive`](https://developers.facebook.com/docs/graph-api/reference/ads_archive/) ;
- [Meta — API de la bibliothèque publicitaire](https://www.facebook.com/ads/library/api/) ;
- sources secondaires sur les champs UE et l'accès :
  [AdLibrary — DSA et dépôts de publicités](https://adlibrary.com/posts/eu-dsa-ad-repositories-developers),
  [AdLibrary — limites de l'API](https://adlibrary.com/posts/meta-ad-library-api-limitations),
  [Swipekit — accès et limites](https://swipekit.app/articles/meta-ad-library-api) ;
- [Vercel Workflows — tarifs et limites](https://vercel.com/docs/workflows/pricing),
  [Vercel Workflows](https://vercel.com/docs/workflows).

---

## 9 quinquies. Apprentissage et rythme des agents

> Plan demandé le 29/09/2026. **Rien n'est codé.** Une partie entre dans la 3c
> (elle n'a besoin d'aucune donnée de Meta) ; le reste forme la **3d**, qui ne
> peut commencer qu'une fois des campagnes publiées (3b) et le jeton d'écriture
> posé (phase 2).

### 1. Ce qui entre où

| Élément | Phase | Pourquoi là |
|---|---|---|
| Consignes permanentes, refus → consigne proposée | **3c** | Les refus de créas existent déjà (atelier 3a) ; l'agent de préparation doit les lire dès son premier passage |
| Carnet d'apprentissages : lecture au démarrage, citation dans les décisions, promotion en global | **3c** | Même raison. En 3c, il ne se remplit que par les refus et les consignes |
| Registre des tests, verdicts | **3d** | Un verdict demande des résultats Meta par annonce, et les leads qualifiés rattachés à l'annonce (phase 1 : `utm_content={{ad.id}}`, déjà dans les paramètres d'URL) |
| Rythme (continu, jour, semaine, mois), alertes, fatigue | **3d** | Il n'y a rien à surveiller avant la publication |

### 2. Ce que dit Meta — pages relues dans le navigateur le 29/09/2026

- **Phase d'apprentissage** : un ensemble de publicités en sort « généralement
  après environ **50 résultats** dans la semaine suivant la dernière modification
  importante ». Pendant cette phase, les performances sont moins stables et le
  coût par résultat plus élevé. Source :
  [Meta — À propos de la phase d'apprentissage](https://www.facebook.com/business/help/112167992830700).
- **Modifications importantes**, qui relancent la phase d'apprentissage :
  - toute modification du ciblage, du contenu publicitaire, de l'évènement
    d'optimisation ou de la stratégie d'enchère ;
  - **l'ajout d'une nouvelle publicité à l'ensemble** ;
  - une pause d'au moins sept jours (relance à la reprise) ;
  - le budget, la limite de dépense ou l'objectif de coût, **selon l'ampleur**
    (100 € → 101 € non, 100 € → 1 000 € peut-être).

  Source : [Meta — Modifications importantes et phase d'apprentissage](https://www.facebook.com/business/help/316478108955072).

**Conséquences pour les agents :**

- **Les nouvelles créas n'entrent qu'au passage hebdomadaire, groupées** : une
  seule relance d'apprentissage par semaine et par ensemble, pas une par créa.
  Le passage quotidien **prépare** les remplacements, il ne les ajoute pas.
- **Une pause de 7 jours ou plus** relance l'apprentissage : l'agent le sait
  avant de la proposer, et le journal le dit.
- **Le garde-fou « ±20 % de budget par décision » (§6) reste**. Meta ne donne
  pas de seuil chiffré pour « l'ampleur », donc 20 % est notre prudence, pas
  une règle de Meta.

### 3. Règles, en code

1. **Pas de verdict sous le seuil.** Tant que le volume et la durée minimum ne
   sont pas atteints, un test est « en attente de volume » : aucune conclusion ne
   s'écrit, et le code refuse `conclure_test`.
2. **Le verdict est calculé par le code, pas par le modèle** : comparaison
   statistique des variantes, probabilité que la meilleure le soit vraiment. Le
   modèle **interprète** le verdict ; il ne le fabrique pas.
3. **Rien n'assouplit un garde-fou codé.** Budgets, règles Meta, chiffres
   sourcés, faux témoignages : ce sont des vérifications en code, exécutées après
   le modèle. Une consigne ou un apprentissage n'est qu'un texte donné au modèle ;
   il ne peut ni sauter une vérification, ni en changer un seuil. Le prompt le
   dit aussi, mais la garantie vient du code.
4. **Un apprentissage de campagne ne devient global qu'après validation de
   Charlie.**
5. **Charlie peut modifier ou supprimer toute ligne** du carnet, des consignes et
   des tests. L'historique reste dans les décisions qui les ont cités (copie du
   texte au moment de la citation).
6. **« Attendre » est une décision.** Sous le volume minimum, pendant les 7
   premiers jours, ou pendant la phase d'apprentissage de Meta, l'agent décide
   `attente`, avec sa raison journalisée. On sait pourquoi rien n'a bougé.

### 4. Modèle de données

**`ad-tests` — le registre des tests (3d)**

| Champ | Type | Rôle |
|---|---|---|
| `campaign`, `run` | relations | La campagne, le passage qui l'a ouvert |
| `hypothesis` | textarea | « Un angle “temps gagné” coûte moins cher par lead qualifié qu'un angle “zéro papier” » |
| `dimension` | select | `ton` · `angle` · `accroche` · `format` · `visuel` · `cta` · **`audience`** (à ajouter à `TEST_DIMENSIONS`) |
| `variants` | array | `label`, `creatives` (relation → `ad-creatives`, plusieurs) ou `audience` (json), `adsetExternalId` |
| `metric` | select | `cpl-qualifie` (défaut) · `cpl` · `ctr` · `cout-par-signe` |
| `minResults`, `minDays` | number | Volume et durée minimum **par variante** avant verdict. Défauts : 50 résultats (seuil de Meta) et 14 jours pour le CPL qualifié (délai de qualification) |
| `maxDays` | number | Au-delà, le test se clôt « sans verdict » plutôt que de tourner indéfiniment. Défaut : 42 jours |
| `status` | select | `en-cours` · `en-attente-de-volume` · `conclu` · `sans-verdict` · `abandonne` |
| `results` | json | Photo des chiffres par variante au moment du verdict |
| `winner`, `confidence`, `probability` | text / select / number | Écrits par le code. Confiance : `forte` (≥ 95 %), `moyenne` (≥ 80 %) ; en dessous, pas de gagnant |
| `interpretation` | textarea | Ce que le modèle en retient, en une ou deux phrases |
| `openedAt`, `closedAt` | dates | — |

**`ad-learnings` — le carnet d'apprentissages (3c)**

| Champ | Type | Rôle |
|---|---|---|
| `statement` | text | La conclusion, **une phrase** |
| `scope` | select | `campagne` · `global` |
| `campaign` | relation | Si `campagne` |
| `confidence` | select | `faible` · `moyenne` · `forte` |
| `source` | select | `test` · `refus` · `consigne` · `resultat-decision` |
| `sourceTest`, `sourceDecision`, `sourceCreative` | relations | La preuve, selon la source |
| `status` | select | `actif` · `global-propose` (attend la validation de Charlie) · `archive` |
| `learnedAt`, `revalidateAt` | dates | Revalidation par défaut à **90 jours** ; passée la date, l'apprentissage est lu avec la mention « à revalider » et revu au bilan mensuel |
| `promotedBy`, `promotedAt` | relation / date | La validation en global |

**`ad-instructions` — les consignes (3c)**

| Champ | Type | Rôle |
|---|---|---|
| `text` | textarea | « Jamais de chantier de nuit sur les visuels » |
| `scope`, `campaign` | select / relation | `global` ou une campagne |
| `origin` | select | `saisie` · `refus` |
| `sourceCreative`, `refusalReason` | relation / text | Pour une consigne née d'un refus |
| `status` | select | `active` · `proposee` · `ecartee` |
| `confirmedBy`, `confirmedAt` | relation / date | — |

**Refus → consigne.** Un refus de créa porte déjà un motif (liste fermée de 3a)
et un détail. L'agent (Haiku, moins d'un centime) propose une consigne
généralisée, née `proposee`. Elle apparaît dans « À valider » sous la créa
refusée, avec deux boutons : **« En faire une consigne »** (le clic l'active, et
le texte reste modifiable) et **« Non »**. Sans IA disponible, le texte proposé
est le motif et le détail, tels quels.

**Ce qui change sur les collections de la 3c :**

| Collection | Ajout | Rôle |
|---|---|---|
| `ad-agent-runs` | `kind` : `preparation` · `quotidien` · `hebdomadaire` · `mensuel` | Le même moteur sert aux quatre rythmes |
| `ad-agent-runs` | `learningsRead`, `instructionsRead` (json) | Ce que l'agent avait sous les yeux au démarrage (identifiants et texte copié) |
| `ad-decisions` | `learnings`, `instructions` (relations, plusieurs) + `citations` (json, texte copié) | Quels apprentissages ont servi à quelle décision. L'outil qui propose une décision exige ses `appuis` ; le code vérifie qu'ils existent |
| `ad-decisions` | `kind` : + `attente` · `test` · `alerte` | « Attendre » journalisé, ouverture et clôture de test, urgence |
| `ad-campaigns` | groupe `cadence` (3d) | Voir §5 |

**`ad-alerts` — les urgences, en code, sans IA (3d)**

| Champ | Type | Rôle |
|---|---|---|
| `campaign`, `adExternalId` | relation / text | Où |
| `kind` | select | `pub-refusee` · `depense-anormale` · `diffusion-nulle` · `lien-casse` |
| `detail`, `detectedAt`, `resolvedAt` | text / dates | — |
| `decision` | relation → `ad-decisions` | La pause proposée ou exécutée, selon le niveau d'autonomie |

### 5. Rythme d'analyse et de décision (3d)

Réglable par campagne (groupe `cadence` sur `ad-campaigns`), dans des bornes en
code. Défauts :

| Rythme | Quand | Qui | Ce qu'il fait | Peut modifier ? |
|---|---|---|---|---|
| Continu | À chaque synchro, et toutes les heures pour la page d'arrivée | **Code, sans IA** | Pub refusée, dépense anormale (au-delà de 175 % du budget du jour, le plafond annoncé par Meta), diffusion à zéro depuis 24 h, page d'arrivée en erreur | **Seulement l'urgence** : proposer la pause, ou l'exécuter en mode `autonome` |
| Quotidien | 7 h (Paris) | Sonnet 5.5, passage léger | Lit les chiffres, détecte la fatigue (fréquence > 3 **et** taux de clic en baisse de 30 % sur 7 jours face aux 7 précédents), **prépare** des remplacements | **Non**, hors urgence |
| Hebdomadaire | Lundi 8 h, sur la semaine Meta écoulée (dimanche → samedi, fuseau du compte) | Opus 5.5, passage complet | Budget, pauses, nouvelles créas **groupées**, angles, audiences, répartition IA / Meta, ouverture et clôture de tests | Oui, sous les garde-fous et le niveau d'autonomie |
| Mensuel | Premier lundi du mois | Opus 5.5 | Bilan : coût par lead qualifié et par client signé ; revue du carnet (apprentissages à revalider, promotions en global à proposer) | Non : il propose |

**Bornes, en code :**

- **Gel des 7 premiers jours** d'une campagne, sauf urgence.
- **Volume minimum** : aucune décision de budget, de pause ou d'audience sur un
  ensemble encore en phase d'apprentissage (moins de ~50 résultats depuis sa
  dernière modification importante). La décision est `attente`.
- **Fenêtre du CPL qualifié** : 14 à 30 jours (21 par défaut), à cause du délai
  de qualification. Un lead de la veille n'est pas encore qualifié : il ne compte
  pas comme un échec.
- **72 h entre deux modifications d'un même objet** (§6) : un plancher, pas un
  rythme. Le rythme, c'est la semaine.
- Les passages quotidiens, hebdomadaires et mensuels puisent dans la **part IA
  quotidienne** de la campagne (total × part IA max), comme décidé le 29/09.

**Coût estimé par campagne et par mois** : quotidien ~0,05 € × 30 ; hebdomadaire
~0,80 € × 4,3 ; mensuel ~1 €. Soit **~6 € par mois**, à comparer à la part IA :
30 €/jour × 15 % = 4,50 €/jour. À mesurer au premier mois.

### 6. Place dans le découpage en commits

**Ajouts à la 3c** (après le commit 4 de §9 quater, avant la salle de contrôle) :

| # | Commit | Schéma |
|---|---|---|
| 4 bis | Consignes et carnet : collections `ad-learnings` et `ad-instructions` ; `kind`, `learningsRead`, `instructionsRead` sur les passages ; `learnings`, `instructions`, `citations` et le type `attente` sur les décisions. Lecture au démarrage, `appuis` exigés par les outils de décision | **migration** (la deuxième de la 3c, après celle des concurrents ; celle du commit 1 est déjà appliquée) |
| 4 ter | Refus → consigne proposée (Haiku, repli sans IA), boutons dans « À valider » ; promotion d'un apprentissage en global | — |
| 7 | La salle de contrôle montre, sous chaque décision, les apprentissages et consignes cités | — |

**Phase 3d** (après la 3b et la phase 2) :

| # | Commit | Schéma |
|---|---|---|
| 1 | `ad-tests`, `ad-alerts`, groupe `cadence`, dimension `audience`, types de décision `test` et `alerte` | migration |
| 2 | Moteur de verdict, **pur et testé** : seuils, probabilité, confiance, « sans verdict » | — |
| 3 | Alertes en code (synchro + contrôle horaire de la page d'arrivée) | — |
| 4 | Ordonnanceur des rythmes dans `ads-agent-tick` : quotidien, hebdomadaire (semaine Meta), mensuel ; gel des 7 jours ; phase d'apprentissage | — |
| 5 | Détection de la fatigue et préparation des remplacements | — |
| 6 | Passage hebdomadaire complet : ouverture et clôture de tests, créas groupées | — |
| 7 | Bilan mensuel et revue du carnet | — |
| 8 | Écrans : registre des tests, alertes, rythme dans la salle de contrôle ; `REGLES-SUPPORT.md` | — |

### 7. Questions

1. **Le volume réaliste.** À 30 € de CPL, 50 leads **qualifiés** par variante,
   c'est 1 500 € par variante. Avec les budgets de départ, un test sur le CPL
   qualifié mettra des mois. Proposition : **un seul test à la fois par
   campagne**, avec des variantes franchement différentes, et un verdict
   « provisoire » sur le CPL simple (50 leads), confirmé plus tard sur le CPL
   qualifié. D'accord ?
2. **Revalidation** à 90 jours par défaut : ça te va ?
3. **Alertes** : par e-mail en plus du tableau de bord, ou tableau de bord seul ?
4. **Urgence en mode `proposer`** : la pause attend ton clic (proposé), ou une
   pub **refusée par Meta** peut se mettre en pause seule quel que soit le mode ?

---

## 10. Questions ouvertes

1. **Formulaires instantanés Meta ou page d'arrivée** sur le site ? Les deux sont prévus
   (§4.7) ; lequel en premier change la phase 1.
2. **Accès Marketing API** : app Meta dédiée, vérification d'entreprise, niveau d'accès
   nécessaire pour `ads_management` sur nos propres comptes. La phase 0 n'a besoin que de
   `ads_read` et avance sur données simulées ; la question redevient bloquante en phase 2,
   avec le portefeuille business et le jeton d'utilisateur système (D11).
3. **Rendu Remotion** : les fonctions Vercel ne conviennent pas à un rendu vidéo long.
   Remotion Lambda, ou un petit service à part ?
4. **Budgets** : plafond publicitaire mensuel de départ, budget IA mensuel.
5. **Qui valide** : admin seul, ou un rôle « marketing » (cf. `RBAC-PLAN.md`) ?
6. **Usage hors TIM** (clients Ninety Digital) : pas prévu ici. Si le besoin arrive, les
   comptes publicitaires devront être rattachés à un « annonceur » — le modèle le permet
   (un champ sur `ad-accounts`), mais on ne le construit pas d'avance.
