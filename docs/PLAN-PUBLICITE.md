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
| D11 | **Deux jetons Meta possibles par compte** : le jeton OAuth longue durée, et un **jeton d'utilisateur système** collé à la main | L'OAuth de Meta ne donne pas de jeton de rafraîchissement : le jeton longue durée vit ~60 jours. Il est daté (`tokenExpiresAt`), une alerte part à **J-7**, et le compte passe `expire` à l'échéance. Le jeton d'utilisateur système (Business Manager) n'expire pas : c'est **la cible** dès que le portefeuille business de TIM est en place, il prime sur l'OAuth quand il est posé, et il est **obligatoire avant que les agents puissent écrire (phase 2)** |

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
historique. Archiver et réactiver se font par le menu ⋯ de la fiche ; réactiver
recalcule l'état d'après les jetons.

**Une reconnexion retrouve toujours le même enregistrement**, par sa clé
`platform + externalId` (index unique) : l'OAuth remplace le jeton, remet l'échéance
et l'alerte J-7 à zéro et sort le compte de l'archive ; coller un jeton
d'utilisateur système fait de même. Jamais un second compte pour le même `act_…`.

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
| 3 | Agent créatif : textes, images, vidéo, motion, upload vers Meta | Une créa générée passe en ligne après validation |
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
