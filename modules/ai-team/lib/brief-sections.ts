/**
 * LA FICHE PRODUIT & POSITIONNEMENT de TIM (14/11/2026) — le document que
 * TOUS les agents lisent avant de travailler, pour parler de TIM avec les
 * mêmes mots, à la même cible, avec les mêmes preuves.
 *
 * Bâtie sur ce qui marche en B2B (recherche du 14/11/2026) : partir des
 * ALTERNATIVES (ce que le client ferait sans TIM — Excel, papier, un autre
 * logiciel, ne rien faire), puis ce que TIM a d'unique, la valeur que ça
 * apporte et sa preuve, les clients pour qui cette valeur compte le plus, et la
 * catégorie. Pour une entreprise de cette taille : une cible tirée des
 * MEILLEURS clients (pas de toute la base), qui n'est PAS pour TIM, les
 * déclencheurs d'achat, les objections — surtout la peur de se tromper, qui
 * fait perdre plus d'affaires que les concurrents —, et les MOTS EXACTS des
 * clients, chacun rattaché à sa source. Pas de personas inventés, pas de
 * modèle de marché : ça ne sert pas à 20 clients.
 *
 * La liste seule (lisible par la page) ; le reste est dans lib/brief.
 */

export type BriefSection = { key: string; label: string; help: string; rows: number };

export const BRIEF_SECTIONS: BriefSection[] = [
  { key: "promesse", label: "La promesse, en une phrase", help: "Ce que TIM change pour le client, dans ses mots à lui.", rows: 2 },
  { key: "categorie", label: "La catégorie", help: "Comment le client cherche ce genre d'outil (« logiciel de gestion BTP », « logiciel de devis artisan »…).", rows: 2 },
  { key: "alternatives", label: "Ce qu'ils font sans TIM", help: "Excel, papier, un autre logiciel, un ERP, ne rien faire — et ce qui ne va pas avec chacun.", rows: 5 },
  { key: "differences", label: "Ce que TIM a d'unique, et ce que ça apporte", help: "Ce que les alternatives n'ont pas, la valeur pour le client, et sa preuve.", rows: 5 },
  { key: "preuves", label: "Les preuves", help: "Chiffres, clients, témoignages qu'on peut citer.", rows: 4 },
  { key: "cible", label: "Les clients idéaux", help: "Tirés des meilleurs clients (ceux qui ont signé vite, utilisent beaucoup, restent) : métier, taille, nombre de chantiers.", rows: 4 },
  { key: "declencheurs", label: "Ce qui les fait chercher maintenant", help: "L'événement qui déclenche l'achat : croissance, une erreur coûteuse, un nouveau chantier, une obligation…", rows: 3 },
  { key: "horsCible", label: "Qui n'est pas pour TIM", help: "À ne pas viser, ou à disqualifier vite.", rows: 3 },
  { key: "decideurs", label: "Qui décide, qui utilise", help: "Un ou deux rôles : le gérant, le conducteur de travaux, l'assistante… et ce qui compte pour chacun.", rows: 3 },
  { key: "objections", label: "Les objections, et la réponse", help: "Les freins entendus — surtout la peur de se tromper (adoption par les équipes, reprise des données) — avec la réponse et sa preuve.", rows: 6 },
  { key: "messages", label: "Les messages", help: "Une promesse, trois piliers, une preuve par pilier.", rows: 4 },
  { key: "offre", label: "L'offre et l'action visée", help: "Prix ou fourchette, essai, démo : ce qu'on demande au prospect de faire.", rows: 3 },
  { key: "mots", label: "Les mots à employer, et à éviter", help: "Le vocabulaire du BTP qui parle (« situations de travaux », « chantier »), le jargon à bannir (« solution digitale », « optimiser vos process »).", rows: 4 },
  { key: "apprentissages", label: "Ce qu'on a appris", help: "Ce qui a marché ou pas chez TIM — messages, offres, canaux —, daté.", rows: 4 },
];

export const QUOTE_TAGS = [
  { label: "Douleur", value: "douleur" },
  { label: "Déclencheur", value: "declencheur" },
  { label: "Objection", value: "objection" },
  { label: "Alternative", value: "alternative" },
  { label: "Résultat", value: "resultat" },
] as const;
