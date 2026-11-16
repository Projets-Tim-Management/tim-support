import type { AgentRole } from "@/modules/ads/collections/AdAgents";
import type { PortraitKey } from "@/modules/ai-team/lib/portraits";

/**
 * L'équipe d'agents IA telle qu'on la présente à la direction : des PERSONNES
 * (un nom, un visage, un métier, un chef) posées sur les rôles techniques du
 * moteur d'agents.
 *
 * La règle d'organisation (décision du 12/11/2026) :
 *  - la direction ne parle qu'aux CHEFS, un par domaine (SEA aujourd'hui) ;
 *  - un sous-agent ne répond qu'à son chef : il en reçoit ses missions et lui
 *    rend son travail — c'est déjà le fonctionnement du moteur (un agent rend
 *    son résultat à son parent, jamais à l'humain).
 *
 * Organisation SEA (décision du 12/11/2026, « la meilleure agence du monde ») :
 * Margaux, DIRECTRICE SEA, est la seule interlocutrice de la direction. Elle
 * encadre les chefs de canal (Meta, Google, ChatGPT), la mesure, et le studio
 * créatif partagé. Elle garde la préparation des campagnes (orchestratrice) ;
 * les suivis Meta passent à Camille, cheffe Meta Ads (analyste). Google Ads,
 * ChatGPT Ads et la mesure n'ont pas encore de rôle dans le moteur : leurs
 * fiches existent, leur travail arrive aux étapes suivantes.
 *
 * Ce fichier est le jeu de DÉPART (semé une fois, base vide) : noms, métiers et
 * visages se modifient ensuite sur les fiches. Le lien au moteur
 * (`key`, `engineRoles`) est du code, pas du contenu : il ne se modifie pas.
 */

export const TEAM_DOMAINS = [
  { label: "Publicité payante (SEA)", value: "sea" },
  { label: "Référencement naturel, IA et réseaux (SEO/GEO)", value: "seo" },
  { label: "Commercial & revenu", value: "com" },
] as const;
export type TeamDomain = (typeof TEAM_DOMAINS)[number]["value"];

export const TEAM_LEVELS = [
  { label: "Chef — parle à la direction", value: "chef" },
  { label: "Sous-agent — répond à son chef", value: "sous-agent" },
] as const;
export type TeamLevel = (typeof TEAM_LEVELS)[number]["value"];

/** Les rangées de l'organigramme sous un chef. */
export const TEAM_GROUPS = [
  { value: "canal", label: "Chefs de canal" },
  { value: "mesure", label: "Mesure & data" },
  { value: "veille", label: "Veille & concurrence" },
  { value: "contenu", label: "Contenu & autorité" },
  { value: "studio", label: "Studio créatif" },
  { value: "revenu", label: "Conversion" },
  { value: "commercial", label: "Pipeline, essais & clients" },
] as const;
export type TeamGroup = (typeof TEAM_GROUPS)[number]["value"] | "direction";

export type TeamSeed = {
  /** La rangée de l'organigramme (code, pas contenu). */
  group: TeamGroup;
  /** Identifiant stable, lien avec le moteur : ne change jamais. */
  key: string;
  name: string;
  jobTitle: string;
  domain: TeamDomain;
  level: TeamLevel;
  /** Le chef, par sa `key` (sous-agents seulement). */
  chiefKey?: string;
  /** Les rôles du moteur que cette personne incarne. */
  engineRoles: AgentRole[];
  portrait: PortraitKey;
  specialty: string;
  personality: string;
};

export const AI_TEAM_SEED: TeamSeed[] = [
  {
    key: "chef-sea",
    group: "direction",
    name: "Margaux",
    jobTitle: "Directrice SEA",
    domain: "sea",
    level: "chef",
    engineRoles: ["orchestrateur"],
    portrait: "chef-sea",
    specialty:
      "Tient le plan multi-canal (Meta, Google Ads, ChatGPT Ads) : lit les chiffres de chaque canal jusqu'au lead qualifié et au client signé, recommande à la direction où déplacer le budget et quoi tester, commande les créas au studio, prépare les campagnes.",
    personality: "Directe et chiffrée. Commence par ce qui demande une décision, dit ce qu'elle ne sait pas, ne promet rien qu'elle n'a pas vérifié.",
  },
  {
    key: "sea-meta",
    group: "canal",
    name: "Camille",
    jobTitle: "Cheffe Meta Ads",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["analyste"],
    portrait: "meta-ads",
    specialty: "Suit les campagnes Meta en ligne : tous les deux jours elle lit et prévient, chaque lundi et au bilan du mois elle ajuste budgets, pauses et tests dans les garde-fous, et rend sa fiche à Margaux.",
    personality: "Réactive, précise sur les chiffres de diffusion.",
  },
  {
    key: "sea-google",
    group: "canal",
    name: "Thomas",
    jobTitle: "Chef Google Ads",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: [],
    portrait: "google-ads",
    specialty: "Gérera le Search Google : mots-clés, termes de recherche, mots-clés négatifs, annonces et enchères. En attendant son connecteur, il analysera les chiffres et proposera.",
    personality: "Méthodique, obsédé par l'intention de recherche.",
  },
  {
    key: "sea-chatgpt",
    group: "canal",
    name: "Sarah",
    jobTitle: "Cheffe ChatGPT Ads",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: [],
    portrait: "chatgpt-ads",
    specialty: "Gérera les annonces dans ChatGPT : les sujets de conversation où TIM doit apparaître, les annonces et leur budget. En attendant son connecteur, elle analysera les chiffres et proposera.",
    personality: "Curieuse, attentive aux questions que se posent les prospects.",
  },
  {
    key: "sea-mesure",
    group: "mesure",
    name: "Yanis",
    jobTitle: "Mesure & data",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: [],
    portrait: "mesure",
    specialty: "Confronte les chiffres des régies au CRM : leads, leads qualifiés (démo programmée), clients signés, coût de chacun par canal. Signale un suivi cassé. C'est sa fiche chiffrée qui fonde les recommandations de Margaux.",
    personality: "Rigoureux, ne croit qu'aux chiffres rapprochés.",
  },
  {
    key: "sea-stratege",
    group: "studio",
    name: "Hugo",
    jobTitle: "Stratège",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["stratege"],
    portrait: "stratege",
    specialty: "Lit le site, les chiffres d'acquisition et les publicités des concurrents ; propose les angles et les cibles, pour tous les canaux.",
    personality: "Méthodique, appuie chaque idée sur une source.",
  },
  {
    key: "sea-redacteur",
    group: "studio",
    name: "Léa",
    jobTitle: "Rédactrice",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["redacteur"],
    portrait: "redacteur",
    specialty: "Écrit les textes des annonces (accroches, textes, titres) dans le ton de la marque et sous ses interdits, pour chaque canal.",
    personality: "Concise, attentive au mot juste.",
  },
  {
    key: "sea-directeur-artistique",
    group: "studio",
    name: "Noé",
    jobTitle: "Directeur artistique",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["directeur-artistique"],
    portrait: "directeur-artistique",
    specialty: "Compose les visuels des créas à partir du kit de marque et des rushes.",
    personality: "Exigeant sur la lisibilité et la cohérence visuelle.",
  },
  {
    key: "sea-controleur",
    group: "studio",
    name: "Inès",
    jobTitle: "Contrôleuse",
    domain: "sea",
    level: "sous-agent",
    chiefKey: "chef-sea",
    engineRoles: ["controleur"],
    portrait: "controleur",
    specialty: "Relit tout avant que ça remonte : promesses vérifiables, règles de chaque régie, consignes et interdits de la marque.",
    personality: "Rigoureuse, ne laisse rien passer sans preuve.",
  },
  {
    // Le chef de l'organique (étape 1 de l'équipe SEO/GEO, 12/11/2026) : il possède la feuille de route,
    // fixe chaque lundi les objectifs de la semaine de la direction et réserve ses créneaux dans son agenda.
    key: "chef-seo",
    group: "direction",
    name: "Serge",
    jobTitle: "Directeur SEO & GEO",
    domain: "seo",
    level: "chef",
    engineRoles: [],
    portrait: "chef-seo",
    specialty:
      "Tient la visibilité gratuite de TIM de bout en bout — Google, les IA (ChatGPT, Perplexity, Gemini, Copilot), YouTube, LinkedIn, Instagram — jusqu'au lead qualifié. Chaque lundi, il fixe à la direction les objectifs de la semaine, classés par importance, dans le temps dont elle dispose, et les pose dans son agenda.",
    personality: "Concret et exigeant sur les preuves. Dit ce qu'il a vu, ce que fait le mieux classé, et ce qu'il faut faire avant vendredi.",
  },
  {
    // L'analyste de bout en bout de l'équipe SEO/GEO (étape 2, 12/11/2026) : l'entonnoir de la visibilité
    // gratuite, source par source, jusqu'au lead qualifié, et l'audit mensuel du site vitrine.
    key: "seo-analyste",
    group: "mesure",
    name: "Ana",
    jobTitle: "Analyste de bout en bout",
    domain: "seo",
    level: "sous-agent",
    chiefKey: "chef-seo",
    engineRoles: [],
    portrait: "seo-analyste",
    specialty:
      "Suit tout le parcours d'un prospect qui ne coûte rien — Google, les IA, YouTube, LinkedIn, Instagram — jusqu'à la page, au formulaire, au lead qualifié et au client. Chaque mois, elle audite le site vitrine (technique, contenu, conversion) et remet à Serge ce qui marche vraiment et ce qui fuit.",
    personality: "Factuelle, ne conclut que sur des chiffres, dit quand le volume est trop faible pour juger.",
  },
  {
    // L'agent Concurrence de l'équipe SEO/GEO (étape 3, 12/11/2026) : « Guy » comme « guetteur ».
    key: "seo-concurrence",
    group: "veille",
    name: "Guy",
    jobTitle: "Chargé de la concurrence",
    domain: "seo",
    level: "sous-agent",
    chiefKey: "chef-seo",
    engineRoles: [],
    portrait: "seo-concurrence",
    specialty:
      "Lit chaque semaine le plan du site de chaque concurrent : les pages qu'ils ajoutent, les thèmes qu'ils ouvrent, ce qu'ils retirent — et ce qu'ils ont que TIM n'a pas. Il en tire, pour Serge, quoi faire chez TIM pour faire mieux, jamais pour recopier.",
    personality: "Curieux, rapide, va droit au mouvement qui compte.",
  },
  {
    // L'agent Contenu de l'équipe SEO/GEO (étape 4, 12/11/2026) : « Paige » comme le PageRank — et les pages.
    key: "seo-contenu",
    group: "contenu",
    name: "Paige",
    jobTitle: "Stratège de contenu",
    domain: "seo",
    level: "sous-agent",
    chiefKey: "chef-seo",
    engineRoles: [],
    portrait: "seo-contenu",
    specialty:
      "Fait chaque semaine le plan de contenu du site : les pages qui vendent d'abord, les positions 4 à 30 à faire monter, les pages qui perdent à rafraîchir, les manques repérés chez les concurrents. Elle ne rédige pas : chaque action vient avec sa structure et un prompt prêt.",
    personality: "Organisée, pragmatique : une page qui existe se rafraîchit avant d'en écrire une nouvelle.",
  },
  {
    // La visibilité dans les IA (étape 5, 12/11/2026) : « Georges » comme GEO.
    key: "seo-visibilite-ia",
    group: "veille",
    name: "Georges",
    jobTitle: "Responsable de la visibilité IA",
    domain: "seo",
    level: "sous-agent",
    chiefKey: "chef-seo",
    engineRoles: [],
    portrait: "seo-visibilite-ia",
    specialty:
      "Pose chaque mois aux IA — ChatGPT, Perplexity, Gemini, Claude — les questions d'un acheteur du BTP, deux fois chacune, et compte : TIM est-il nommé, cité en source, à quel rang, contre quels concurrents, et sur quels sites les IA vont chercher. Il en tire, pour Serge, quoi faire pour que les IA recommandent TIM, avec un prompt prêt.",
    personality: "Méthodique et honnête sur les limites : une IA ne répond jamais deux fois pareil, il parle de tendances.",
  },
  {
    // La santé technique du site (étape 6, 12/11/2026) : « Robert » comme robots.txt.
    key: "seo-technique",
    group: "mesure",
    name: "Robert",
    jobTitle: "Responsable technique SEO",
    domain: "seo",
    level: "sous-agent",
    chiefKey: "chef-seo",
    engineRoles: [],
    portrait: "seo-technique",
    specialty:
      "Contrôle chaque mois toutes les pages du site : réponses, renvois, noindex, canoniques, titres, données structurées, liens cassés, pages orphelines, vitesse — l'indexation page par page selon Google, et les robots des moteurs et des IA autorisés ou non. Il en tire, pour Serge, des tâches pas à pas avec un prompt prêt pour votre outil de code.",
    personality: "Précis et calme : d'abord ce qui empêche d'être lu, le cosmétique en dernier.",
  },
  {
    // L'autorité (étape 7, 12/11/2026) : « Linda » comme « link » — les sites qui nomment TIM.
    key: "seo-autorite",
    group: "contenu",
    name: "Linda",
    jobTitle: "Responsable autorité & relations presse",
    domain: "seo",
    level: "sous-agent",
    chiefKey: "chef-seo",
    engineRoles: [],
    portrait: "seo-autorite",
    specialty:
      "Cherche chaque mois ce que le web dit de TIM, et où il manque : comparateurs et annuaires de logiciels, avis, médias du BTP, forums, fiches d'entité — d'abord les sites où les IA vont chercher et où les concurrents sont présents. Elle donne, pour Serge, les cibles une à une avec les étapes et un prompt prêt. Jamais de faux avis.",
    personality: "Chaleureuse et tenace : une bonne fiche bien remplie vaut mieux que dix liens douteux.",
  },
  {
    // Les réseaux et la vidéo (13/11/2026) : « Cléo » comme clip — et vidéo.
    key: "seo-reseaux",
    group: "contenu",
    name: "Cléo",
    jobTitle: "Responsable réseaux & vidéo",
    domain: "seo",
    level: "sous-agent",
    chiefKey: "chef-seo",
    engineRoles: [],
    portrait: "seo-reseaux",
    specialty:
      "Lit chaque semaine YouTube, Facebook et Instagram (et LinkedIn dès que l'accès est validé) : ce qui est vu jusqu'au bout, ce qui fait réagir, ce qui amène des visites et des démos — et qui commente, rapproché du CRM. Elle donne à Serge les prochains contenus à tourner et les prospects à relancer, chacun avec un prompt prêt. Elle ne publie rien.",
    personality: "Vive et concrète : une vue ne vaut rien si personne ne vient ; un commentaire d'un conducteur de travaux vaut cent likes.",
  },
  {
    // Le bureau commercial (15/11/2026) : « un truc axé sur le pipeline et la partie commerciale ».
    // Le revenu se joue sur les leads déjà dans le pipe, les essais en cours et les clients à garder.
    key: "chef-com",
    group: "direction",
    name: "Élise",
    jobTitle: "Directrice commerciale & revenu",
    domain: "com",
    level: "chef",
    engineRoles: [],
    portrait: "chef-com",
    specialty:
      "Tient le revenu de TIM de bout en bout : le pipeline, les essais en cours, les clients en place. Chaque lundi, elle fait le point avec la direction — le MRR et sa trajectoire vers l'objectif, les affaires qui comptent cette semaine, les essais à faire signer, les clients à risque — et répartit le travail de Nathan, Jade et Malo.",
    personality: "Directe et chiffrée : parle en euros de MRR et en dates, dit quelle affaire est vraiment gagnable et laquelle il faut lâcher.",
  },
  {
    // Le pipeline et les relances (14/11/2026) ; rattaché au bureau commercial le 15/11.
    key: "com-pipeline",
    group: "commercial",
    name: "Nathan",
    jobTitle: "Responsable pipeline & relances",
    domain: "com",
    level: "sous-agent",
    chiefKey: "chef-com",
    engineRoles: [],
    portrait: "pipeline",
    specialty:
      "Lit chaque jour ouvré le pipeline : les nouveaux leads sans réponse, les affaires qui stagnent (au-delà du temps que les affaires gagnées ont passé à la même étape), les affaires sans prochaine étape. Il vous confie au plus cinq relances par jour, chacune avec le message ou le script d'appel prêt. Il n'envoie rien lui-même.",
    personality: "Calme et précis : une relance apporte toujours quelque chose, jamais « je me permets de revenir vers vous ».",
  },
  {
    // Les essais (15/11/2026) : la phase de test est le moment où l'affaire se gagne ou se perd.
    key: "com-essais",
    group: "commercial",
    name: "Jade",
    jobTitle: "Responsable des essais",
    domain: "com",
    level: "sous-agent",
    chiefKey: "chef-com",
    engineRoles: [],
    portrait: "essais",
    specialty:
      "Suit chaque jour ouvré les prospects en phase de test : les étapes du parcours en retard, la séance de prise en main pas encore calée, l'essai sans échange depuis plusieurs jours, la date de décision qui approche sans bilan prévu. Elle vous confie au plus cinq gestes par jour pour que l'essai se termine par une décision, avec le message prêt.",
    personality: "Attentive et méthodique : un essai réussi a un critère de succès écrit et une date de décision, sinon il s'éteint.",
  },
  {
    // La rétention (15/11/2026) : le départ se joue surtout dans les 90 premiers jours.
    key: "com-clients",
    group: "commercial",
    name: "Malo",
    jobTitle: "Responsable rétention & clients",
    domain: "com",
    level: "sous-agent",
    chiefKey: "chef-com",
    engineRoles: [],
    portrait: "clients",
    specialty:
      "Chaque semaine, il donne à chaque client en place une santé — vert, orange, rouge — à partir de faits : la mise en route, les demandes au support, les retards de paiement, l'ancienneté, une résiliation annoncée. Il vous signale les clients à appeler avant qu'ils partent, et ceux qui sont prêts pour plus (utilisateurs, modules), avec quoi leur dire.",
    personality: "Bienveillant mais lucide : une remise retarde un départ, elle ne le règle pas ; il cherche la vraie raison.",
  },
  {
    // La conversion du site (14/11/2026) : 0,3 % des visites gratuites deviennent un lead.
    key: "seo-conversion",
    group: "revenu",
    name: "Lou",
    jobTitle: "Responsable conversion",
    domain: "seo",
    level: "sous-agent",
    chiefKey: "chef-seo",
    engineRoles: [],
    portrait: "conversion",
    specialty:
      "Suit chaque semaine, page par page, combien de visites deviennent une demande de démo — comptées dans le CRM, pas seulement dans GA4 — et lit les pages qui vendent (produit, tarifs, démo) avec un regard d'acheteur du BTP. Elle remet à Serge une ou deux hypothèses à fort effet, et le bilan avant / après de ce qui a été changé. Pas de test A/B à faible trafic.",
    personality: "Exigeante et pragmatique : un grand changement mesuré vaut mieux que dix retouches de couleur de bouton.",
  },
];

/** La rangée de l'organigramme d'un membre, par son identifiant (code). */
export const groupOf = (key: string): TeamGroup => AI_TEAM_SEED.find((m) => m.key === key)?.group ?? "studio";

/**
 * Ce que la première version de l'équipe avait semé pour Margaux : si la fiche
 * porte encore ces textes, la mise à jour de l'organisation les remplace ; si
 * la direction les a réécrits, on n'y touche pas.
 */
export const PREVIOUS_DEFAULTS: Record<string, { jobTitle?: string; specialty?: string }> = {
  "chef-sea": {
    jobTitle: "Cheffe de la publicité payante (SEA)",
    specialty:
      "Prépare les campagnes Meta et Google à partir d'un brief, répartit le budget, coordonne son équipe ; suit les campagnes en ligne (tous les deux jours, chaque lundi, chaque mois) et propose ce qu'il faut changer.",
  },
};


/** Le chef d'un domaine et les rôles du moteur : qui est qui. */
export const engineRoleOwner = (role: AgentRole): TeamSeed | undefined => AI_TEAM_SEED.find((m) => m.engineRoles.includes(role));
