# Dashboard admin — checklists (recherche + spec d'implémentation)

Trois checklists qui pilotent la construction du dashboard : **structure & données**,
**UX/UI & graphiques**, **performance**. Chaque case cochée = décision appliquée
dans le code (`admin/dashboard/`).

---

## A. Structure & données (le fond)

Fondé sur les patterns récurrents des meilleurs dashboards (F-pattern, hiérarchie,
5–9 métriques/écran, cards à icône + tendance).

- [ ] **Une intention claire, lisible en 5 s** : « qu'est-ce qui demande mon action
      aujourd'hui ? ». Le haut du dashboard répond à ça (tickets à traiter, soumissions
      en attente, commandes à honorer).
- [ ] **Hiérarchie F-pattern** : KPI les plus critiques en **haut-gauche**, taille
      décroissante vers le bas-droite. Le chiffre le plus important est visuellement
      dominant.
- [ ] **5–9 métriques par écran** (pas plus) : on résiste à tout empiler. Le reste
      va dans les vues de liste des collections.
- [ ] **Par compartiment** (une section = un domaine), dans l'ordre de priorité
      métier : **Support → Partenaires → Éditorial → Système**.
- [ ] **Chaque KPI = card** : libellé (sentence case) · valeur (compacte : 1 284 /
      12,9 k) · delta signé vs période nommée (couleur = direction × « est-ce bien »)
      · mini-tendance (sparkline). Icône ligne à gauche.
- [ ] **Indicateurs d'état réservés** : vert/ambre/rouge = statut (bon/attention/
      critique), jamais une couleur de « série ». Toujours icône + libellé, pas la
      couleur seule.
- [ ] **Données FIABLES** : chaque métrique calculée depuis les champs réels des
      collections (agrégation server-side, `overrideAccess` maîtrisé), pas d'estimation.
      Documenter la source de chaque chiffre (champ + filtre) dans le code.
- [ ] **Actions directes** : chaque card mène à la vue filtrée correspondante
      (ex. « 5 tickets non lus » → liste tickets filtrée). Zéro cul-de-sac.
- [ ] **États vides gérés** : « Rien à signaler 🎉 » plutôt qu'un 0 sec ou un graphe vide.

## B. UX / UI & graphiques (la forme)

Méthode dataviz (choisir la forme AVANT la couleur ; valider la palette ; specs de
marques) + principes NN/g (préattentif, anti-chartjunk, divulgation progressive).

- [ ] **La forme suit le job des données** (jamais « un joli graphe »):
  - valeur unique (+ tendance) → **stat tile**, pas un graphe à 1 barre ;
  - poignée de chiffres → **rangée de KPI** ;
  - évolution dans le temps → **ligne / aire** (1 série) ;
  - comparer des magnitudes → **barres** (horizontales si libellés longs) ;
  - part d'un tout → **barre empilée** ou **donut** (≤ 5 parts) ;
  - une part contre une limite (stock, quota) → **meter**.
- [ ] **Une seule échelle Y** — jamais de double axe (erreur n°1). Deux mesures
      d'échelles différentes = deux graphes.
- [ ] **Couleur par le job** : catégoriel (identité, ordre fixe, jamais cyclé) /
      séquentiel (magnitude, une teinte) / divergent (polarité) / statut (état).
      Palette dérivée des tokens `var(--tim-…)`.
- [ ] **Palette VALIDÉE** au script dataviz (CVD ΔE, contraste) — light **et** dark ;
      on ne juge pas « à l'œil ».
- [ ] **Specs de marques** : barres ≤ 24px, bout arrondi 4px ; lignes 2px ; aires à
      ~10 % d'opacité ; grille hairline 1px récessive ; gap de 2px entre marques.
- [ ] **Anti-chartjunk** : pas de 3D, d'ombres portées sur les données, de dégradés
      décoratifs, de légendes redondantes. Le texte porte les tokens de texte, pas la
      couleur de série.
- [ ] **Légende dès 2 séries** ; labels directs sélectifs (jamais un chiffre sur
      chaque point).
- [ ] **Interaction** : tooltip au survol sur chaque graphe (crosshair sur les
      lignes, par-marque sur barres/donut). Filtres de période sur une ligne au-dessus.
- [ ] **Accessibilité** : identité jamais par la couleur seule (icône/label) ;
      contrastes AA ; dark mode pensé (pas un simple flip).
- [ ] **Boutons d'action = icône + tooltip** (créer un ticket, une récompense, etc.),
      `aria-label` obligatoire, tooltip au survol/focus.
- [ ] **Rendu vérifié à l'œil** après coup : pas de collision de labels, pas de
      débordement horizontal, responsive.

## C. Performance

Fondé sur : agréger côté serveur, charger l'essentiel d'abord, éviter le sur-fetch.

- [ ] **Agrégation server-side** : compter/sommer via la DB (`count`, requêtes
      ciblées), **jamais** `find` de tous les docs pour compter en JS.
- [ ] **`depth: 0` + `limit` maîtrisé + `select`** sur toutes les lectures du
      dashboard : on ne rapatrie que les champs utiles.
- [ ] **Requêtes parallèles** (`Promise.all`) pour toutes les métriques d'un rendu.
- [ ] **Server Component** : le dashboard lit via la Local API au rendu serveur,
      zéro cascade de fetch client au montage.
- [ ] **Graphiques SVG légers, faits main** (sparkline/barres/donut) — **aucune lib
      de charting** (pas de Recharts/Chart.js) : moins de JS, pas de dépendance, CSP-safe.
- [ ] **Séries bornées** : agrégats par jour/semaine sur une fenêtre fixe (ex. 30 j),
      pas des milliers de points.
- [ ] **Pas de travail bloquant** : si une métrique est lourde, la dégrader
      proprement (placeholder) plutôt que bloquer tout le rendu.
- [ ] **Cache raisonnable** : `React.cache` pour dédupliquer les lectures d'un même
      rendu ; envisager une revalidation courte si besoin.
- [ ] **Budget** : viser un rendu du dashboard < ~1 s en conditions normales ;
      mesurer (les requêtes apparaissent dans les logs `next dev`).

---

### Sources (recherche)
- Dashboard design best practices 2025/2026 — [resolution.de](https://www.resolution.de/post/dashboard-design-best-practices/), [context.dev](https://www.context.dev/blog/dashboard-design-best-practices), [improvado.io](https://improvado.io/blog/dashboard-design-guide), [5of10.com](https://5of10.com/articles/dashboard-design-best-practices/)
- UX / choix de graphiques — NN/g : [Choosing Chart Types](https://www.nngroup.com/videos/choosing-chart-types/), [Clutter-Free Charts](https://www.nngroup.com/videos/chartjunk/), [Preattentive dashboards](https://www.nngroup.com/articles/dashboards-preattentive/)
- Performance dashboard — [zigpoll (loading perf)](https://www.zigpoll.com/content/how-can-we-optimize-the-loading-performance-of-our-interactive-dashboard-to-enhance-user-engagement-on-both-desktop-and-mobile-devices), [edgedelta (observability)](https://edgedelta.com/company/blog/importance-of-dashboard-performance-in-observability)
- Méthode graphiques : skill dataviz (forme→couleur→validation, specs de marques).
