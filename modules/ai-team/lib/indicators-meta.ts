/**
 * LE CATALOGUE DES INDICATEURS des objectifs (feuille de route, 14/11/2026 :
 * « il faut pouvoir en créer autant qu'on veut et différents — des objectifs
 * de revenu, de visibilité, de se faire connaître, de clics sur le site, sur la
 * page contact ou autre »).
 *
 * La liste seule (lisible par la page) ; la mesure est dans lib/indicators.
 * Chaque indicateur dit sa famille, son unité, ce qui est mieux, sa fenêtre
 * (un stock à date, ou un flux sur 30 jours ou sur le dernier mois complet),
 * s'il a un PASSÉ (sa courbe se remplit dès la création de l'objectif), et un
 * éventuel paramètre (la page à suivre). « Saisie manuelle » couvre le reste.
 *
 * LE SEUL CATALOGUE (relecture du 15/11/2026 : la feuille de route en avait deux, celui des objectifs et celui des
 * courbes de la photo du lundi). `weekly` : l'indicateur est aussi relevé sur la photo du lundi — sa courbe s'affiche
 * dans l'onglet Courbes, semaine après semaine (lib/roadmap-calc lit sa valeur dans chaque photo).
 */

export type IndicatorGroup = "Revenu" | "Pipeline" | "Leads" | "Visibilité Google" | "Site" | "Réseaux & IA" | "Autre";
export type IndicatorMeta = {
  key: string;
  group: IndicatorGroup;
  label: string;
  unit: "€" | "%" | "nb";
  better: "up" | "down";
  /** Ce que mesure le chiffre, en une phrase courte. */
  help: string;
  /** La courbe se remplit avec le passé (12 mois) dès la création. */
  history: boolean;
  /** Un paramètre à saisir (la page à suivre). */
  param?: { label: string; placeholder: string };
  /** Les équipes dont le chef peut le proposer. */
  teams: ("sea" | "seo" | "com")[];
  /** Relevé sur la photo du lundi (courbe hebdomadaire). */
  weekly?: true;
};

export const INDICATORS: IndicatorMeta[] = [
  { key: "mrr", group: "Revenu", label: "MRR", unit: "€", better: "up", help: "Revenu mensuel récurrent HT des clients en contrat, d'après leurs fiches.", history: true, teams: ["sea", "seo", "com"] },
  { key: "mrr-nouveau-30j", group: "Revenu", label: "Nouveau MRR signé (30 j)", unit: "€", better: "up", help: "MRR des contrats démarrés sur les 30 derniers jours.", history: true, teams: ["sea", "seo", "com"] },
  { key: "clients-actifs", group: "Revenu", label: "Clients actifs", unit: "nb", better: "up", help: "Clients en contrat à la date.", history: true, teams: ["com"] },
  { key: "mrr-signature", group: "Pipeline", label: "MRR en signature", unit: "€", better: "up", help: "Montant mensuel des affaires « En signature ».", history: false, teams: ["com"] },
  { key: "mrr-test", group: "Pipeline", label: "MRR en test", unit: "€", better: "up", help: "Montant mensuel des affaires « En phase de test ».", history: false, teams: ["com"] },
  { key: "pipeline-pondere", group: "Pipeline", label: "Pipeline pondéré", unit: "€", better: "up", help: "Affaires en cours pondérées par étape : signature 70 %, test 40 %, attente d'engagement 30 %, démo 15 %, qualification et attente longue 5 %, nouvelle 3 %.", history: false, teams: ["com"] },
  { key: "leads-30j", group: "Leads", label: "Leads (30 j)", unit: "nb", better: "up", help: "Demandes reçues par le site sur 30 jours, tous canaux.", history: true, teams: ["sea", "seo"] },
  { key: "leads-qualifies-30j", group: "Leads", label: "Leads qualifiés (30 j)", unit: "nb", better: "up", help: "Demandes des 30 derniers jours arrivées à « Démo programmée » ou plus.", history: true, teams: ["sea", "seo", "com"] },
  { key: "clics-google", group: "Visibilité Google", label: "Clics Google (mois)", unit: "nb", better: "up", help: "Clics depuis Google sur le dernier mois complet (Search Console).", history: true, teams: ["seo"] },
  { key: "impressions-google", group: "Visibilité Google", label: "Impressions Google (mois)", unit: "nb", better: "up", help: "Affichages dans Google sur le dernier mois complet : se faire voir.", history: true, teams: ["seo"] },
  { key: "position-google", group: "Visibilité Google", label: "Position moyenne Google", unit: "nb", better: "down", help: "Place moyenne dans Google sur le dernier mois complet.", history: true, teams: ["seo"] },
  { key: "clics-marque", group: "Visibilité Google", label: "Recherches de la marque (mois)", unit: "nb", better: "up", help: "Clics sur des recherches qui contiennent « TIM » (moyenne mensuelle sur 3 mois) : se faire connaître.", history: false, teams: ["seo"] },
  { key: "clics-hors-marque", group: "Visibilité Google", label: "Clics hors marque (mois)", unit: "nb", better: "up", help: "Clics sur des recherches sans « TIM » (moyenne mensuelle sur 3 mois) : être trouvé par ceux qui ne vous connaissent pas.", history: false, teams: ["seo"] },
  { key: "visites-site", group: "Site", label: "Visites du site (mois)", unit: "nb", better: "up", help: "Sessions sur le dernier mois complet, toutes sources (GA4).", history: true, teams: ["sea", "seo"] },
  { key: "visites-moteurs", group: "Site", label: "Visites venues des moteurs (mois)", unit: "nb", better: "up", help: "Sessions venues de Google, Bing… en gratuit, sur le dernier mois complet.", history: true, teams: ["seo"] },
  { key: "visites-ia", group: "Site", label: "Visites venues des IA (mois)", unit: "nb", better: "up", help: "Sessions venues de ChatGPT, Perplexity, Gemini… sur le dernier mois complet.", history: true, teams: ["seo"] },
  { key: "vues-page", group: "Site", label: "Vues d'une page (mois)", unit: "nb", better: "up", help: "Vues d'une page du site sur le dernier mois complet (GA4).", history: true, param: { label: "Page", placeholder: "/contact" }, teams: ["sea", "seo"] },
  { key: "ia-mentions", group: "Réseaux & IA", label: "TIM nommé par les IA", unit: "%", better: "up", help: "Part des réponses des IA qui nomment TIM (mesure du mois de Georges).", history: false, teams: ["seo"], weekly: true },
  { key: "abonnes-reseaux", group: "Réseaux & IA", label: "Abonnés sur les réseaux", unit: "nb", better: "up", help: "YouTube, Facebook et Instagram réunis (dernier relevé de Cléo).", history: false, teams: ["seo"] },
  { key: "vues-reseaux", group: "Réseaux & IA", label: "Vues sur les réseaux (28 j)", unit: "nb", better: "up", help: "Vues des vidéos et publications sur 28 jours (dernier relevé de Cléo).", history: false, teams: ["seo"] },
  { key: "pages-indexees", group: "Réseaux & IA", label: "Pages indexées par Google", unit: "%", better: "up", help: "Part des pages contrôlées indexées (contrôle du mois de Robert).", history: false, teams: ["seo"], weekly: true },
  // Relevés chaque lundi sur la photo de la semaine (fiche des canaux, 3 mois glissants ; et les rapports du mois).
  { key: "leads-qualifies-total", group: "Leads", label: "Leads qualifiés, tous canaux (3 mois)", unit: "nb", better: "up", help: "Tous les leads arrivés à « Démo programmée » ou plus, sur 3 mois glissants.", history: true, teams: ["sea", "seo", "com"], weekly: true },
  { key: "seo-leads-qualifies", group: "Leads", label: "Leads qualifiés gratuits (3 mois)", unit: "nb", better: "up", help: "Leads venus de Google, des IA ou des réseaux arrivés à « Démo programmée » ou plus, sur 3 mois glissants.", history: true, teams: ["seo"], weekly: true },
  { key: "sea-leads-qualifies", group: "Leads", label: "Leads qualifiés payants (3 mois)", unit: "nb", better: "up", help: "Leads venus de Meta, Google Ads et ChatGPT Ads arrivés à « Démo programmée » ou plus, sur 3 mois glissants.", history: true, teams: ["sea"], weekly: true },
  { key: "sea-cout-lead-qualifie", group: "Leads", label: "Coût par lead qualifié payant (3 mois)", unit: "€", better: "down", help: "Dépense publicitaire divisée par les leads qualifiés payants, sur 3 mois glissants.", history: true, teams: ["sea"], weekly: true },
  { key: "seo-clics-hors-marque", group: "Visibilité Google", label: "Clics hors marque (3 mois)", unit: "nb", better: "up", help: "Clics depuis Google sur des recherches sans « TIM », total des 3 derniers mois.", history: true, teams: ["seo"], weekly: true },
  { key: "seo-conversion", group: "Site", label: "Conversion des visites gratuites", unit: "%", better: "up", help: "Part des visites venues des moteurs, des IA et des réseaux qui deviennent un lead.", history: true, teams: ["seo"], weekly: true },
  { key: "autorite-presence", group: "Réseaux & IA", label: "Présence sur les sites de référence", unit: "%", better: "up", help: "Part des comparateurs, annuaires et médias suivis où TIM est présent (rapport du mois de Linda).", history: true, teams: ["seo"], weekly: true },
  { key: "reseaux-interactions", group: "Réseaux & IA", label: "Interactions sur les réseaux", unit: "%", better: "up", help: "Interactions par vue sur YouTube, Facebook et Instagram, 28 derniers jours (relevé de Cléo).", history: true, teams: ["seo"], weekly: true },
  { key: "manuel", group: "Autre", label: "Saisie manuelle", unit: "nb", better: "up", help: "Un chiffre que vous mettez à jour vous-même.", history: false, teams: [] },
];

/** Les indicateurs relevés chaque lundi : les courbes de l'onglet Courbes. */
export const WEEKLY_INDICATORS = INDICATORS.filter((x) => x.weekly);

export const indicatorOf = (key: string | null | undefined): IndicatorMeta | undefined => INDICATORS.find((i) => i.key === key);
export const INDICATOR_GROUPS: IndicatorGroup[] = ["Revenu", "Pipeline", "Leads", "Visibilité Google", "Site", "Réseaux & IA", "Autre"];
