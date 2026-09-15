# Contrôle de facturation Pennylane

Ce que dit chaque fiche client du support (les licences saisies à la main, onglet
« Licences par profil ») face à ce que Pennylane facture réellement (les lignes de
l'abonnement récurrent). Le but : ne rater ni un client jamais facturé, ni une
licence facturée en trop ou en moins, ni un prix qui a dérivé.

**Rien n'est automatisé.** Le support lit Pennylane, constate, et c'est vous qui
corrigez — la fiche d'un côté, l'abonnement dans Pennylane de l'autre.

## Où ça se voit

- **Menu Facturation → Rapprochement** (`/admin/facturation`) : toutes les fiches
  « Gagnée », les écarts en tête. Filtres « À traiter / Tous / Conformes ».
  Chaque ligne se déplie : les constats, puis le tableau profil par profil
  (fiche · Pennylane · écart · prix fiche · prix Pennylane).
- **Fiche client → onglet Licences par profil** : encart « Facturation
  Pennylane » sous le tableau. Il compare ce qui est *saisi* (même pas encore
  enregistré) à l'abonnement : on corrige une quantité, l'écart se met à jour.
- **Terminal** : `npx tsx scripts/facturation-check.ts` (ajouter `--tout` pour
  voir aussi les conformes).

Réservé aux admins : les partenaires ne voient ni le lien, ni l'encart.

## Ce qui est contrôlé

| Constat | Gravité |
|---|---|
| Fiche « Gagnée » introuvable dans Pennylane (ni SIREN, ni nom) | erreur |
| Client Pennylane sans abonnement, ou abonnement arrêté / terminé / brouillon | erreur |
| Quantité différente pour un profil | erreur |
| Facturé par Pennylane alors que la fiche n'est pas « Gagnée » (résilié, test…) | erreur |
| SIREN différent entre la fiche et Pennylane (rapproché par le nom) | erreur |
| Prix unitaire différent pour un profil | avertissement |
| Lignes en double dans l'abonnement (même produit plusieurs fois) | avertissement |
| Lignes hors licences (forfait de mise en place, développement…) | avertissement |
| Périodicité différente (fiche mensuelle, abonnement Pennylane tous les 3 mois) | erreur |
| Les mois d'une facture multi-mois ne se répètent pas à l'identique | erreur |
| Mode de paiement / délai de règlement différents | avertissement |
| Facture en retard de paiement (échéance dépassée, reste dû) | erreur |
| Mois attendu sans facture émise (selon la périodicité) | erreur |
| Abonnement Pennylane qu'aucune fiche ne réclame (« facturé sans fiche ») | section à part |

## Tout est par mois

Les licences d'une fiche sont des quantités **par mois**, et c'est ce qu'on suit
mois après mois pour ajuster la facturation. La « Périodicité de facturation »
de la fiche (onglet Contrat client) dit combien de mois une facture couvre.

Côté Pennylane, la récurrence (`recurring_rule` : mensuelle × intervalle) donne
le même nombre de mois ; une facture trimestrielle répète ses lignes dans trois
sections « Mois 1 / 2 / 3 ». Le rapprochement ramène quantités et montant
**au mois** (÷ nombre de mois), affiche « facturé tous les 3 mois · 522 € HT
par facture », et alerte si les sections ne se répètent pas à l'identique.

## Remises de ligne

Sur chaque ligne de licences de la fiche, le menu « ⋮ » à côté du prix pose une
remise en € par licence ou en %, comme sur une ligne d'abonnement Pennylane.
Le prix comparé est le prix **réellement facturé** (remise déduite) des deux
côtés ; le prix avant remise est rappelé en petit. Une licence offerte (18 € −
18 €) vaut 0 des deux côtés — et compte pour 0 dans le CA et la commission.

## Plusieurs lignes pour un même profil

Un groupe facturé par entité (« Maçonnerie », « Échafaudage » dans la
description des lignes) a légitimement plusieurs lignes d'un même produit :
elles sont additionnées et le détail s'affiche sous la quantité. « Lignes en
double » ne s'affiche que si deux lignes sont strictement identiques (même
produit, même mention, même mois).

## Paiements, mois après mois

Avec le scope `customer_invoices:readonly`, le rapprochement lit aussi les
factures émises. Dans chaque encart, la liste des factures (date, échéance,
montant, reste dû, état : payée / à échoir / en retard) et les **mois attendus
sans facture**. Une facture en retard (échéance dépassée, pas soldée) ou un mois
sans facture met la fiche « À traiter » ; la tuile « Paiements en retard » les
compte.

Sur la fiche client, l'historique mensuel gagne une colonne **Paiement**
(admins) : la facture du mois et son état, « Aucune facture » si une était
attendue, ou « couvert par la facture de … » pour les mois d'une facture
trimestrielle.

## L'historique mensuel : règles

`modules/partner/lib/history.ts` (décision du 15/09/2026) :

- **Affaire non gagnée** (pipeline, test, perdue) : les licences saisies sont
  un devis, un brouillon de suivi — **rien n'entre dans l'historique**.
- **Gagnée** : la première ligne est datée du **mois de démarrage de la
  facturation** — l'abonnement Pennylane dès qu'il existe, sinon la date de
  contrat — jamais avant, même si on enregistre plus tôt. Ensuite une ligne par
  mois où la configuration change ; le mois en cours se met à jour ; chaque
  ligne porte son tampon « Conforme / Écart Pennylane ».
- **Résiliée / archivée** : l'historique est conservé, on n'y ajoute plus rien.
- Les fiches anciennes se recalent d'elles-mêmes au prochain enregistrement ;
  `npx tsx scripts/historique-recaler.ts` (puis `--appliquer`) le fait d'un coup.

## Analyses → Facturation

`/admin/analyses/facturation` (`modules/partner/admin/analytics/`) : CA HT/mois
sous contrat, licences, commissions, remises, impayés, conformité ; évolution
mois / trimestre / année ; graphiques (Recharts, palette `--tim-chart-*`
validée) et tableaux triables avec export CSV. La facturation d'un client y
**commence à son abonnement Pennylane** (sinon au contrat) : les dates de
contrat antérieures à la bascule Pennylane ne créent aucun CA. Les chiffres
sont calculés dans `modules/partner/lib/billing-analytics.ts` (pur, testé).

## Comment les deux côtés sont reliés

1. **Par SIREN** (`siren` de la fiche ↔ `reg_no` du client Pennylane) — un fait.
2. À défaut, **par le nom** (raison sociale ou nom de la fiche, normalisés :
   sans accents, ponctuation ni forme juridique) — mais jamais vers un client
   Pennylane déjà pris par un SIREN. Le rapprochement par le nom est signalé.

Les profils sont reconnus par la **référence produit** Pennylane, à défaut par le
libellé :

| Profil (support) | Produit Pennylane | Réf. |
|---|---|---|
| Admin | Licence TIM — Administration | `LA-Tim` |
| Conducteur de travaux | Licence TIM — Conducteur de travaux | `LCT-Tim` |
| Chef de chantier | Licence TIM — Chef de chantier | `LCC-Tim` |
| Chef d'équipe | Licence TIM — Chef d'équipe | `LCE-Tim` |
| Compagnon | Licence TIM — Compagnon | `LC-Tim` |

Si un produit est renommé ou recréé dans Pennylane, garder ces références (ou
mettre à jour `PENNYLANE_PRODUCT_REFS` dans `modules/partner/lib/billing-check.ts`).

## Connexion à Pennylane

- Variable **`PENNYLANE_API_TOKEN`** (`.env.local` en dev, variables du projet
  Vercel en prod). Token d'entreprise créé dans Pennylane → *Paramètres →
  Connectivité → Développeurs*, plan Essentiel ou supérieur.
- Permissions **lecture seule** uniquement : *Abonnements de facturation*,
  *Clients*, *Produits*, *Factures client* (pour le suivi des paiements ; sans ce
  scope, le rapprochement des licences fonctionne quand même). Rien d'autre — le
  support n'écrit jamais dans Pennylane.
- Le token n'est affiché qu'une fois à la création. S'il expire ou est révoqué,
  l'écran affiche « Pennylane refuse le token » : en générer un nouveau, remplacer
  la variable, redéployer.
- Lecture en cache **une heure** côté serveur ; bouton « Actualiser » pour
  forcer. Limite Pennylane : 25 requêtes / 5 s — une lecture complète en fait
  une trentaine, par petits lots.

Code : `modules/partner/lib/pennylane.ts` (client API), `billing-check.ts`
(comparaison, pure, testée dans `tests/billing-check.test.ts`),
`billing-report.ts` (assemblage), `modules/partner/admin/BillingCheckView.tsx`
(écran), `PennylaneCompare.tsx` (encart fiche), `BillingRows.tsx` (tableau profil par profil, lecture ou édition).
