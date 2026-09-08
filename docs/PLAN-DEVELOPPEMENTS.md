# Suivi des développements — Plan & décisions

> Objectif : **savoir où on en est** sur chaque chose à faire, quelle qu'en soit la
> nature — une idée remontée par un prospect, un bug signalé dans un ticket, une
> évolution demandée par un client, un travail interne.
> Statut : **Phases 0 à 3 faites** (08/09/2026) — modèle, rattachements et vues
> sont en place, la migration est appliquée. Restent les phases 4 et 5 (journal
> automatique, tableau de bord).

---

## 1. Le problème, tel qu'il se pose aujourd'hui

Les demandes arrivent par trois portes et n'atterrissent nulle part :

| Porte | Ce qui existe | Ce qui manque |
|---|---|---|
| Ticket de support | `tickets` avec un type `suggestion` | Une suggestion reste dans le fil du ticket. Personne ne sait si elle est étudiée, refusée ou déjà en cours |
| Prospect / client | `partner-clients` (opportunités), historique d'activités | « Ils signent si on fait X » est écrit dans une note. Six mois plus tard, X est perdu |
| Interne | rien | Dette technique, refontes, incidents : aucune trace structurée |

Et il n'existe aucun moyen de répondre à la question qui commande la priorisation :
**combien de clients attendent la même chose ?**

⚠️ Piège de vocabulaire : la collection `features` (module `editorial`) n'est **pas**
un développement — c'est la **fiche de documentation publiée** sur le site support.
Le développement, c'est le travail ; la feature, c'est ce qu'on en documente une fois
livré. Les deux se lient (§4), ils ne fusionnent pas.

---

## 2. Décisions verrouillées (validées le 08/09/2026)

| # | Décision | Conséquence |
|---|---|---|
| D1 | **Une seule collection** pour tout ce qui se développe, avec un champ `type` | Bug, feature, dépannage et dette technique vivent sur le même tableau. Pas de silo |
| D2 | **Trois axes séparés** : `type` (ce que c'est) × `status` (où on en est) × `priority` (dans quel ordre) | « En urgence » est une **priorité**, pas un statut — sinon on perd l'avancement en le déclarant urgent |
| D3 | **Beaucoup de statuts**, rendus lisibles par **5 phases** | Le Kanban groupe ses colonnes par phase ; les onglets de la liste filtrent par phase |
| D4 | ~~**Labels transverses**~~ — **abandonné le 08/09/2026** | L'idée était de qualifier librement ce qui n'est ni type, ni statut, ni priorité. À l'usage, les labels demandés doublaient les axes existants (« bug » = un Type, « pas pressé » = la Priorité *Basse*), et un quatrième axe libre finissait par contredire les trois autres sur la même carte. Supprimé, collection comprise |
| D8 | **Les statuts sont du contenu**, pas du code (ajout du 08/09/2026) | Collection `dev-statuses` : on crée, renomme, recolore et réordonne les colonnes du Kanban depuis « Paramètres › Statuts », sans migration. Les PHASES, elles, restent en code — elles structurent l'écran et le raisonnement |
| D5 | ~~**Features hiérarchiques**~~ (collection `dev-groups`) — **abandonné le 08/09/2026** | Un rangement en arborescence des développements, thématique ou par client. Jamais utilisé : zéro feature créée, zéro développement rattaché, et le mot entrait en collision avec le vocabulaire de l'équipe (« une feature » = un développement). Supprimé, collection comprise |
| D6 | **Admin seul** | Collections masquées et refusées aux autres rôles. Les champs de liaison sur le ticket et l'opportunité sont eux aussi réservés à l'admin |
| D7 | **Pas de versions / jalons** pour l'instant | Un champ texte « version cible » suffira si le besoin se confirme. Aucune collection `releases` |

---

## 3. Modèle de données

Nouveau module `modules/dev`, groupe de nav **« Développements »**.

### 3.1 `developments` — l'unité de travail

| Champ | Type | Rôle |
|---|---|---|
| `number` | number auto (`referenceNumber`) | Référence citable : « le dev #142 » |
| `title` | text requis | Le besoin en une ligne |
| `description` | textarea | La demande, dans les mots du demandeur si possible |
| `type` | select | `feature` · `evolution` · `bug` · `depannage` · `technique` · `etude` |
| `status` | relation → `dev-statuses` | Où on en est — une colonne du Kanban |
| `priority` | select | `urgente` · `haute` · `normale` · `basse` — mêmes valeurs et mêmes pastilles que les tickets |
| `platforms` | relation → `platforms`, multi | **Réutilise** la collection existante (Web / Mobile) |
| `opportunities` | relation → `partner-clients`, multi | **Qui le demande.** C'est la clé de la priorisation |
| `tickets` | relation → `tickets`, multi | Les demandes entrantes à l'origine |
| `feature` | relation → `features` | La fiche de doc, une fois livré |
| `assignee` | relation → `users` | **Assigné à** — un membre de l'équipe TIM, facultatif |
| `dueDate` | date | Échéance **promise** — celle qui engage vis-à-vis d'un client |
| `startedAt` / `deliveredAt` | date auto | Horodatés au passage de statut (patron `stampResolvedAt` des tickets) |
| `demandCount` | number auto, indexé | Nombre d'opportunités demandeuses. Recalculé à l'enregistrement, sert au **tri « le plus demandé »** |
| `rank` | number, caché | **Ordre d'importance** dans la colonne du Kanban : 1 en haut. Posé en glissant les cartes |
| `internalNotes` | textarea | Notes internes |
| `checklist` | array | **Le corps de la fiche** : un point par ligne (`done`, `title`, `description`, `comments`) — voir §3.1 bis |
| `checklistProgress` | text auto | « 3/7 », recalculé à l'enregistrement. Colonne de liste et carte du Kanban |
| `links` | array | Ce qui vit **ailleurs** : maquette Figma, page Notion, dépôt, document partagé. Rendus en pastilles cliquables, le service reconnu à son signe ([`lib/links.ts`](../modules/dev/lib/links.ts)) |
| `documents` | array | Fichiers déposés ici : maquettes, spécifications, exports, captures. Champ partagé avec les tickets et les opportunités ([`core/fields/documents.ts`](../core/fields/documents.ts)) |

### 3.1 bis Le corps d'un développement : une checklist

La barre latérale garde visible ce qu'on regarde et ce qu'on change tous les jours
(statut, type, priorité, feature, assignation, demandeurs, échéance) ; le reste —
plateformes, compteurs, dates de jalons, notes internes, fiche de doc — descend dans un
bloc **replié par défaut**. Quatorze champs empilés obligeaient à faire défiler la page
pour trouver le statut, qui est la première chose qu'on vient voir.

La fiche n'a **pas d'onglets** : titre, puis la demande en un paragraphe, puis la
checklist. Elle se lit de haut en bas, et rien de ce qui sert à travailler n'est caché
derrière un clic. Tout le reste — statut, type, priorité, feature, demandeurs, tickets
d'origine, échéance, notes internes — vit dans la **barre latérale**, qui est le
contexte et non le travail.

Les descriptions sont des **zones de texte simples**, comme partout ailleurs dans le
back-office. L'éditeur riche a été essayé puis retiré (08/09/2026) : il s'affiche à nu,
sans cadre, et une demande de client n'a besoin ni de titres ni de listes à puces — elle
a besoin d'être lisible et de se coller sans perdre sa forme. Effet de bord bienvenu :
l'ouverture depuis un ticket ne convertit plus rien, le texte passe tel quel.

| Champ d'un point | Rôle |
|---|---|
| `done` | Coché = acquis. La ligne repliée le montre, et l'intitulé se barre |
| `title` | L'intitulé, lisible sans déplier |
| `description` | Ce qu'il faut faire, ou vérifier pour considérer le point acquis (zone de texte simple, facultatif) |
| `assignee` | Les membres de l'équipe qui prennent CE point, facultatif. Leurs initiales s'affichent dans la barre (deux, puis « +N ») |
| `comments` | Le fil de **discussion** du point, ouvert par une icône. Chaque message porte `body` / `author` / `at`, plus `askedTo` : la personne dont on attend une réponse |

Un fil de commentaires **par point** et non un fil général : une question se pose
toujours sur quelque chose de précis, et dans un fil global il faut tout relire pour
retrouver ce qui a été décidé — donc on décide deux fois.

Le fil est rendu par un composant dédié (`Discussion`) et non par l'interface de
tableau de Payload. Il tient dans une **icône** : le fil se déplie juste en dessous,
à l'endroit du clic — pas dans un tiroir latéral, qui recouvre l'écran et fait perdre
de vue la tâche dont la discussion parle. Affiché en entier sous chaque point, il transformait une checklist de dix points
en dix conversations à dépasser pour lire les tâches — alors qu'on ne consulte une
discussion que lorsqu'on s'y intéresse. **La donnée ne change pas de forme** : c'est
toujours le tableau `comments`, et l'API reste lisible ailleurs.

#### Demander une réponse à quelqu'un

En écrivant, on peut désigner la personne dont on attend la réponse (`askedTo`). Le
message devient une **question en attente**, et le reste tant que cette personne n'a
pas repris la parole dans le fil.

Une question en attente **ne bloque jamais rien** : ni la validation d'un point, ni
l'enregistrement de la fiche. On répond quand on peut.

Rien n'est stocké pour ça — **aucun drapeau « résolu »** à entretenir, donc rien qui
puisse mentir : l'état se déduit du fil ([`lib/discussion.ts`](../modules/dev/lib/discussion.ts)),
et une réponse suffit à le changer. La règle est volontairement grossière : le premier
message de la personne sollicitée, postérieur à la question, la ferme. Savoir si le
contenu répond vraiment est le travail des humains.

Une question en attente se voit à trois endroits, du plus proche au plus lointain :
1. dans le fil, sous le message (« ⏳ En attente de Marie ») ;
2. sur la **barre du point**, à côté du compteur de messages ;
3. sur le **tableau de bord de la personne sollicitée** (bandeau `DevNotifications`),
   parce qu'une question posée dans une fiche que personne n'a de raison de rouvrir
   revient à écrire dans un carnet fermé.

L'assignation existe à trois échelles — le développement, la feature, le point de
checklist — **partout facultative et partout MULTIPLE** : un travail se partage, et on
assigne quand on sait, pas pour remplir un champ. Sur un point de checklist elle se fait
en cliquant un visage (composant `AssigneePicker`) : la photo de profil, ou les
initiales à défaut, et le nom + l'e-mail au survol. Un menu déroulant demandait trois
gestes et n'affichait qu'un nom une fois refermé. Une seule définition de champ ([`fields/assignee.ts`](../modules/dev/fields/assignee.ts))
pour les trois, avec la même liste filtrée aux **rôles internes** (super-admin, admin,
support). Les comptes partenaires partagent la collection `users` : sans ce filtre, on
pourrait assigner un développement à un client.

Les points s'affichent **ouverts**, celui qu'on vient d'ajouter compris : on clique
« Ajouter » pour écrire, pas pour déplier ensuite. Le titre est requis, la description
facultative — un intitulé suffit le plus souvent.

Le champ `description`, juste sous le titre, **n'est pas remplacé** par la checklist :
il porte la demande dans les mots du demandeur, et c'est lui que l'ouverture depuis un
ticket pré-remplit. La checklist dit ce qu'on en fait.

L'avancement (« 3/7 ») est recalculé à l'enregistrement, et s'affiche **sur la carte du
Kanban** avec sa barre : le statut dit où on en est dans le flux, la checklist dit ce
qu'il reste à faire dedans.

### 3.2 Les statuts : du contenu, rangé en 5 phases

Les statuts vivent dans la collection **`dev-statuses`** — un statut = une colonne
du Kanban. On en ajoute, on les renomme, on les recolore et on les déplace depuis
« Développements › Paramètres › Statuts ». Aucune migration : c'était le prix de
l'enum Postgres, et c'est ce qui a fait renoncer à cette rigidité. C'est aussi ce
qui a rendu les labels inutiles (D4) — la souplesse qu'ils apportaient est passée
là où elle avait un sens, dans les colonnes elles-mêmes.

Trois champs portent tout le comportement :

| Champ | Rôle |
|---|---|
| `phase` | Le bandeau sous lequel la colonne se range (5 valeurs, définies en code) |
| `roles` | Ce que le statut **déclenche** : `démarre` (date le démarrage), `livre` (date la livraison), `clôt` (sort des vues de travail). Sans rôle, c'est une étape de passage |
| `position` | L'ordre des colonnes. Espacé de 10 dans le jeu livré : on intercale sans renuméroter. Deux flèches dans la liste déplacent une colonne |

Les **rôles** sont la pièce maîtresse : le code ne peut pas deviner qu'un statut
créé en back-office signifie « c'est livré ». Sans eux, un nouveau statut aurait
été une étiquette inerte et plus aucune date de jalon n'aurait été posée.

Les **phases** restent en code (`modules/dev/lib/devStatus.ts`) : elles ne sont pas
un réglage mais la structure de l'écran — cinq bandeaux, cinq onglets, et la
frontière entre « ça avance » et « ça n'avance plus ».

| Phase | Colonnes en vigueur (jeu resserré par l'équipe le 08/09/2026) | Couleur |
|---|---|---|
| **Entrée** | En qualification | bleu |
| **Étude** | En investigation *(bug : reproduire, diagnostiquer)* · En attente de validation | indigo · violet |
| **Réalisation** | En développement · En test | ambre · turquoise |
| **Livraison** | En production · À documenter · Terminé | vert · rose · vert |
| **Hors flux** | En attente · Non retenu · Abandonné · Doublon | ardoise · rouge · gris · gris |

Les couleurs suivent la température du flux : **froid** tant qu'on réfléchit
(bleu, indigo, violet), **chaud** quand on travaille (ambre), **turquoise puis
vert** quand ça se vérifie et que ça part, **éteint** quand c'est sorti du flux.
Deux couleurs se répètent, et seulement là où elles disent la même chose : le
vert de « En production » et de « Terminé » (c'est livré), le gris d'« Abandonné »
et de « Doublon » (c'est classé). « À documenter » tranche volontairement au
milieu des verts — c'est la colonne qu'on ne doit pas oublier.

La 5ᵉ phase s'appelle **Hors flux** et non « Fin » : « En attente » n'est pas une
fin mais une pause, et un développement bloqué doit rester visible comme quelque
chose à débloquer. La ranger avec les fins l'aurait fait disparaître des vues de
travail ; la laisser dans « Réalisation » aurait fait mentir le tableau.

Deux colonnes méritent leur justification :
- **En investigation** : un bug non reproduit n'est pas « en développement ». Le
  distinguer, c'est voir d'un coup d'œil combien de signalements attendent un
  diagnostic.
- **À documenter** : le pont vers le site support. Un dev livré mais non documenté
  est un dev que le client ne trouvera pas — cette colonne l'empêche de disparaître.

Le jeu livré au départ comptait 18 colonnes ; l'équipe en a retenu 12. Le tableau
ci-dessus fait foi, et `DEV_STATUS_SEED` (code) le recopie — il ne sert qu'à
amorcer une base vierge.

Deux garde-fous, parce que le contenu est modifiable : on **ne supprime pas** un
statut qui porte encore des développements (message explicite, il faut les
déplacer d'abord), et un développement dont le statut aurait disparu retombe dans
la première colonne plutôt que de sortir du tableau.

---

## 4. Ce que ça change dans les écrans existants

| Écran | Ajout |
|---|---|
| **Ticket** | Onglet **« Développement »** (admin seul) : le **même tiroir de création** que sur une opportunité, pré-rempli depuis le ticket (sujet, demande, nature, urgence — [`lib/fromTicket.ts`](../modules/dev/lib/fromTicket.ts)), qui rattache le ticket ; dessous, la liste des développements qui en sont issus |
| **Opportunité** | Onglet **« Besoins »** : bouton **« Créer un développement »** ouvrant un tiroir (titre, description, checklist, type, priorité) — le client est rattaché d'office comme demandeur. Dessous, la liste de ses développements. Le tiroir affichait aussi `leadNotes` ; retiré, parce que sur les fiches reprises du CRM ce champ contient l'historique de la reprise et non un besoin |
| **Feature (doc)** | Lien inverse vers le développement d'origine, en lecture seule |
| **Dashboard** | Tuile « en développement / urgents / à documenter » |

---

## 5. Les vues

1. **Liste** — onglets rapides par **phase** (patron `PartnerClientsStatusTabs`), colonnes
   `number · priority · type · title · group · demandCount · status`, triable par
   « le plus demandé ».
L'**ordre d'importance** se pose sur le Kanban, en glissant une carte à la place
qu'elle mérite dans sa colonne : le haut de la pile est le prochain à faire. La colonne
d'arrivée est renumérotée de 1 à N et seules les cartes dont le rang change sont
écrites. Des rangs pleins plutôt que des demi-positions calculées : on raisonne en
« première », « deuxième », et un rang qu'on peut lire est un rang qu'on peut corriger.
La position affichée sur chaque carte vient de l'ORDRE rendu, jamais du rang stocké —
qui peut laisser des trous quand une carte part dans une autre colonne. Une fiche sans
rang tombe en bas : ne pas avoir été classée n'est pas une priorité.

2. **Kanban** — une colonne par statut, **regroupées sous un en-tête de phase** : 18 colonnes
   restent lisibles quand elles sont rangées en 5 blocs. Patron `PartnerClientsBoard`,
   switcher liste/tableau réutilisé de `PartnerClientsViewSwitcher`.

---

## 6. Phasage

| Phase | Contenu | État |
|---|---|---|
| **0** | Décisions (ce document) | ✅ |
| **1** | Socle données : `devStatus.ts`, `devMeta.ts`, `developments`, migration `20260908_115341`, nav, RBAC admin-seul | ✅ |
| **2** | Rattachements : onglet « Développement » sur le ticket, onglet « Besoins » sur l'opportunité, tiroir de création partagé par les deux (`CreateDevelopment`), `demandCount`, rattachement automatique au client d'une feature | ✅ |
| **3** | Vues : bascule Kanban/Tableau, vues rapides par phase, Kanban à colonnes groupées par phase avec glisser-déposer | ✅ |
| **3 bis** | Statuts éditables (`dev-statuses`, rôles, positions, garde-fous), sous-menu « Paramètres », renommage « Chantiers » → « Features ». Migration `20260908_122143` | ✅ |
| **3 ter** | Couleurs des colonnes réparties, « En relecture » → « En test », **suppression des labels** (D4). Migration `20260908_130357` | ✅ |
| **3 quater** | Checklist dans le corps d'un **développement** (points cochables, description, fil de commentaires par point, avancement sur la carte du Kanban). Migrations `20260908_131658` puis son déplacement | ✅ |
| **4** | Journal automatique des changements de statut (patron `client-activities` / `journal.ts`) | à faire |
| **5** | Tableau de bord : en cours / urgents / à documenter (le pont vers la fiche de doc `features` est déjà là, champ `feature`) | à faire |

**Ce que le système fait tout seul** (`modules/dev/hooks/`) : le rang de tri du
statut, les dates de démarrage et de livraison (posées au premier passage, jamais
réécrites sur un aller-retour), le compte des clients demandeurs, et le
rattachement d'un développement au client de sa feature — sans quoi la fiche de
l'opportunité n'aurait pas montré ses propres besoins sur-mesure.

**Rappels d'exécution** (voir [COMMIT-ET-DEPLOIEMENT.md](COMMIT-ET-DEPLOIEMENT.md)) :
base Supabase **partagée dev/prod** → `push` interdit, migration obligatoire à chaque
phase touchant le schéma ; aucune couleur en dur (tokens `styles/_tokens.scss`) ;
déploiement en prod uniquement sur accord explicite.
