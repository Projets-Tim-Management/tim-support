# Accueil du back-office — ce qu'il fait, et pourquoi

Refonte du 16/09/2026. L'ancien tableau de bord empilait quatre compartiments
de chiffres (support, partenaires, éditorial, système) et sept graphiques. Tout
cela existe désormais, en mieux et sur une période choisie, dans **Analyses**.
La page d'accueil ne répond plus qu'à une question : **« qu'est-ce qui demande
mon action aujourd'hui ? »**

## Ce qu'on a regardé ailleurs

Linear (Inbox), Notion Home, Attio, Pipedrive, HubSpot, Stripe — le même motif :

1. une salutation datée et **un seul** bouton de création (« + Nouveau ») ;
2. le **temps** bien visible : le mois, la journée (en tête, côte à côte) ;
3. **3–4 chiffres au plus**, chacun renvoyant vers l'analyse détaillée ;
4. des **cartes d'objets vivants** (un test en cours, une opportunité) avec la
   prochaine étape, plutôt que des agrégats ;
5. bordures fines, beaucoup d'air, une seule couleur d'accent, états vides
   positifs, tout cliquable.

## La page (admin et partenaire-métier, le même écran scopé)

| Bloc | Contenu | Source |
| --- | --- | --- |
| En-tête | « Bonjour Charlie · mercredi 16 septembre », la phrase du matin (« 4 actions aujourd'hui, 2 en retard »), « + Nouveau » | `HomeHeader`, `NewMenu` |
| Aujourd'hui | le mois et la journée, tâches **et** étapes de parcours, cochables des deux côtés | `AgendaBoard`, `data-agenda.ts`, `api/admin/journey-step` |
| Phases de test | une carte par parcours ouvert : J+x sur N, la barre, la prochaine étape et **qui** doit la faire, l'échéance | `TestCards` |
| En chiffres | CA mensuel HT (avec le nombre de factures à valider sur le rapprochement), clients actifs, opportunités ouvertes, tickets ouverts — pictogramme teinté, valeur, contexte, flèche → chacun mène à sa page | `KeyFigures` |

| Sur 3 / 6 / 12 mois | un seul graphique : le CA HT en bâtons dégradés (axe € à gauche), nouveaux prospects (violet) et clients signés (vert) en lignes (axe nombre à droite) ; commutateur de période, 3 mois par défaut, douze mois servis une fois | `MonthlyOverview` |

Le rôle **support** garde sa vue tickets (`SupportSection`) ; le
**partenaire-utilisateur** garde son programme de points (`PartnerSection`).

## Règles tenues

- **Lecture serveur, jamais plus de cinq requêtes en parallèle** (pooler
  Supabase à 15) ; les parcours sont lus une fois pour l'agenda et les cartes.
- **Une seule vérité** : cocher une étape sur l'accueil écrit sur le parcours,
  par la même règle que la fiche (état, date, auteur) — les garde-fous de la
  collection s'appliquent.
- **Aucune couleur en dur** : tout passe par `var(--tim-…)`.
- **Un seul graphique**, celui des douze mois ; les analyses fines vivent dans Analyses.
