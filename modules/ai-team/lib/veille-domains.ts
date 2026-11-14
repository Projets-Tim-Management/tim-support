/**
 * QUI FAIT SA VEILLE, ET SUR QUOI (ai-team/lib/veille) — à part, pour que la
 * page, la revue et la conversation lisent la liste sans charger le moteur de
 * veille. L'ordre est celui du dimanche soir.
 */
export type VeilleDomain = {
  /** L'équipe : SEA (publicité payante, Margaux) ou SEO (visibilité gratuite, Serge). */
  team: "sea" | "seo";
  channel: "google" | "chatgpt" | "meta" | null;
  title: string;
  focus: string;
  /** Le repère du marché que sa veille cherche, et auquel la maîtrise compare ses résultats. */
  repere: string;
};

const CPL = "le coût par lead qualifié de ton canal (en €), pour un éditeur SaaS B2B — tous canaux payants pour la direction";

export const VEILLE_DOMAINS: Record<string, VeilleDomain> = {
  "sea-google": {
    team: "sea",
    repere: CPL,
    channel: "google",
    title: "Méthode Google Ads",
    focus:
      "Google Ads pour un éditeur de logiciel B2B en France : structure de compte et correspondances, mots-clés négatifs, enchères quand on a peu de conversions, suivi des leads qualifiés jusqu'à Google (conversions hors ligne), niveau de qualité et pages d'atterrissage, nouveautés de la plateforme et de son API.",
  },
  "sea-chatgpt": {
    team: "sea",
    repere: CPL,
    channel: "chatgpt",
    title: "Méthode ChatGPT Ads",
    focus:
      "ChatGPT Ads (les annonces d'OpenAI dans ChatGPT) : comment la diffusion choisit les conversations, formats et rédaction des annonces, ciblage, pixel et conversions, retours d'annonceurs (surtout B2B), règles et nouveautés de la plateforme — elle est récente et change vite : date chaque information.",
  },
  "sea-meta": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode Meta Ads",
    focus:
      "Meta Ads (Facebook, Instagram) pour générer des leads B2B auprès des entreprises du BTP et des artisans : créas qui marchent, formulaires instantanés ou site, campagnes Advantage+, qualité des leads, renvoi des leads qualifiés à Meta (Conversions API), nouveautés de la plateforme.",
  },
  "sea-mesure": {
    team: "sea",
    repere: CPL,
    channel: null,
    title: "Méthode de mesure",
    focus:
      "Mesure et attribution des leads B2B : suivi des conversions de bout en bout (formulaire → démo → client), GA4, Conversions API de Meta, import des conversions hors ligne dans Google Ads, conversions de ChatGPT Ads, paramètres de suivi des liens, attribution multi-canal, consentement et RGPD — et ce qui change dans ces outils.",
  },
  "sea-stratege": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode de stratégie créative",
    focus:
      "Stratégie créative des publicités Meta pour un logiciel B2B vendu aux entreprises du BTP et aux artisans : angles qui convertissent, douleurs et bénéfices qui parlent au BTP, tests d'angles, fatigue créative, ce que font les meilleurs annonceurs B2B.",
  },
  "sea-redacteur": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode de rédaction publicitaire",
    focus:
      "Rédaction publicitaire Meta en B2B (BTP, artisans) : accroches, textes courts, titres, appels à l'action, ton, preuves, longueur selon le placement, ce qui fait cliquer puis demander une démo.",
  },
  "sea-directeur-artistique": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode de direction artistique",
    focus:
      "Visuels et vidéos des publicités Meta en B2B : formats et ratios par placement, premières secondes d'une vidéo, contenus façon terrain (chantier, utilisateur), lisibilité mobile, tendances créatives qui performent.",
  },
  "sea-controleur": {
    team: "sea",
    repere: CPL,
    channel: "meta",
    title: "Méthode de contrôle",
    focus:
      "Conformité et qualité des publicités : règles publicitaires de Meta (motifs de refus, allégations, mentions), droit français de la publicité (allégations, comparatif, RGPD), cohérence avec le produit réel de TIM, et ce qui change dans ces règles.",
  },
  "chef-sea": {
    team: "sea",
    repere: CPL,
    channel: null,
    title: "Méthode de direction SEA",
    focus:
      "Direction d'une acquisition payante multi-canal pour un éditeur SaaS B2B vendu aux entreprises du BTP en France : répartir le budget entre les canaux au coût par lead qualifié, mesurer jusqu'au client signé, tester (méthode, volume minimal, durée), repères de coût par lead et de conversion du marché B2B SaaS et du BTP, ce que font les meilleures agences.",
  },
  // ─── L'équipe SEO/GEO (14/11/2026) : la même veille, chaque dimanche soir.
  "chef-seo": {
    team: "seo",
    channel: null,
    title: "Méthode de direction SEO & GEO",
    repere: "le taux de conversion d'une visite gratuite (moteurs, IA) en lead, en %, pour un éditeur SaaS B2B",
    focus:
      "Direction de la visibilité gratuite d'un éditeur SaaS B2B vendu aux entreprises du BTP en France : ce qui change dans Google (mises à jour du cœur, AI Overviews, AI Mode, Discover) et dans la recherche par IA (ChatGPT, Perplexity, Gemini, Copilot), comment les meilleures agences SEO/GEO priorisent et mesurent jusqu'au lead qualifié, repères de trafic et de conversion organique B2B, ce qui marche aux États-Unis et arrive en France.",
  },
  "seo-analyste": {
    team: "seo",
    channel: null,
    title: "Méthode d'analyse de bout en bout",
    repere: "le taux de conversion d'une visite gratuite (moteurs, IA) en lead, en %, pour un éditeur SaaS B2B",
    focus:
      "Analyse SEO de bout en bout : GA4 et Search Console (nouveautés, limites), attribution des visites venues des IA, suivi jusqu'au lead qualifié et au client, audit de conversion des pages B2B (formulaires, preuves, appels à l'action), repères de conversion organique SaaS B2B, ce que font les meilleures équipes en France et aux États-Unis.",
  },
  "seo-concurrence": {
    team: "seo",
    channel: null,
    title: "Méthode de veille concurrentielle",
    repere: "le taux de conversion d'une visite gratuite (moteurs, IA) en lead, en %, pour un éditeur SaaS B2B",
    focus:
      "Veille concurrentielle SEO des éditeurs de logiciels du BTP et du SaaS B2B : comment lire les mouvements d'un concurrent (pages, thèmes, comparatifs, pages « alternative à »), les formats qui gagnent en ce moment, les éditeurs BTP français et leurs équivalents américains (Procore, Buildertrend…) qui ouvrent la voie.",
  },
  "seo-contenu": {
    team: "seo",
    channel: null,
    title: "Méthode de stratégie de contenu",
    repere: "le taux de conversion d'une visite gratuite (moteurs, IA) en lead, en %, pour un éditeur SaaS B2B",
    focus:
      "Stratégie de contenu SEO et GEO pour le SaaS B2B : pages qui vendent (produit, comparatifs, alternatives, problèmes métier), rafraîchissement, contenus « citables » par les IA, E-E-A-T, ce que les mises à jour de Google récompensent ou punissent, ce qui marche aux États-Unis et en France, le vocabulaire du BTP.",
  },
  "seo-visibilite-ia": {
    team: "seo",
    channel: null,
    title: "Méthode de visibilité dans les IA (GEO)",
    repere: "la part des réponses d'IA où la marque leader d'une catégorie de logiciel B2B est nommée, en %",
    focus:
      "GEO — être recommandé par ChatGPT, Perplexity, Gemini, Copilot et Google AI Overviews / AI Mode : comment chaque IA choisit ses sources, ce qui est prouvé, corrélé ou spéculatif, études et mesures récentes (États-Unis d'abord, France ensuite), nouveautés des IA (recherche, achats, annonces), outils de mesure.",
  },
  "seo-technique": {
    team: "seo",
    channel: null,
    title: "Méthode SEO technique",
    repere: "la part des pages d'un site B2B bien tenu indexées par Google, en %",
    focus:
      "SEO technique : indexation, rendu JavaScript (Next.js), vitesse et Core Web Vitals, données structurées, robots des moteurs et des IA (GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended…), sitemaps, canoniques, ce que changent Google et les IA dans leur façon d'explorer — documentation officielle d'abord.",
  },
  "seo-autorite": {
    team: "seo",
    channel: null,
    title: "Méthode d'autorité et de relations presse",
    repere: "la part des sites de référence d'une catégorie (comparateurs, annuaires, médias) où un éditeur B2B bien installé est présent, en %",
    focus:
      "Autorité et notoriété en ligne d'un éditeur B2B : comparateurs et annuaires de logiciels (Capterra, G2, Appvizer…), avis clients, médias et salons du BTP, forums et Reddit, fiches d'entité (Wikidata, Google), relations presse numériques — ce qui fait que les moteurs et les IA citent une marque, en France et aux États-Unis. Jamais de faux avis.",
  },
  "seo-reseaux": {
    team: "seo",
    channel: null,
    title: "Méthode réseaux & vidéo",
    repere: "le taux d'interaction (interactions ÷ vues) d'un compte B2B qui performe sur YouTube, LinkedIn ou Instagram, en %",
    focus:
      "Réseaux sociaux et vidéo pour un logiciel B2B du BTP : YouTube (recherche, rétention, formats courts), LinkedIn (algorithme, posts de dirigeants, vidéos), Instagram et Facebook, contenus terrain, ce qui amène des démos et pas seulement des vues — tendances françaises et américaines, nouveautés des plateformes.",
  },
};


export const VEILLE_KEYS = Object.keys(VEILLE_DOMAINS);
/** La veille de l'équipe de Margaux (sa revue, sa conversation) et celle de l'équipe de Serge. */
export const SEA_VEILLE_KEYS = VEILLE_KEYS.filter((k) => VEILLE_DOMAINS[k].team === "sea");
export const SEO_VEILLE_KEYS = VEILLE_KEYS.filter((k) => VEILLE_DOMAINS[k].team === "seo");
