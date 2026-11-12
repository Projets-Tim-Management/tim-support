/**
 * Les connexions DU SUPPORT — les API que ce back-office utilise lui-même.
 *
 * Aucune clé ne vit ici : elles sont sur Vercel (et dans .env.local), et
 * c'est le bon endroit — un coffre par environnement, une prise en compte au
 * déploiement, jamais une clé de dev active en prod dans la seconde. Cette
 * table dit seulement, pour chaque connexion, À QUOI elle sert, QUELLES
 * variables elle attend, OÙ est la doc — et l'écran Paramètres lit
 * `process.env` pour dire ce qui est posé et ce qui manque.
 *
 * Pur : la liste et le masquage se testent ; les appels réseau vivent dans
 * support-connections-test.ts.
 */
export type EnvVar = {
  name: string;
  /** Sans elle, la connexion ne marche pas. Les autres ont une valeur par défaut. */
  required: boolean;
  /** Ce que c'est, en une ligne. */
  hint: string;
};

export type SupportConnection = {
  key: "pennylane" | "brevo" | "insee" | "google" | "anthropic" | "meta" | "search-console" | "pagespeed" | "bing-webmaster" | "ga4-data" | "google-ads" | "openai-ads";
  name: string;
  /** Pictogramme : une lettre, sans dépendre d'un logo externe. */
  mark: string;
  /** À quoi elle sert dans le support — ce qui casse si elle tombe. */
  purpose: string;
  /** Ce qu'on lit et écrit. */
  scope: string[];
  docUrl: string;
  /** Où l'on règle la clé chez eux. */
  consoleUrl?: string;
  env: EnvVar[];
  /** Ce que fait le bouton « Tester ». */
  testLabel: string;
  /**
   * Variable qui, posée à « 1 », remplace l'API par des données SIMULÉES. La
   * connexion compte alors comme configurée — on peut la tester et s'en servir —
   * mais l'écran le dit en toutes lettres : un chiffre inventé ne doit jamais
   * passer pour un vrai.
   */
  simulatedBy?: string;
};

export const SUPPORT_CONNECTIONS: SupportConnection[] = [
  {
    key: "pennylane",
    name: "Pennylane",
    mark: "P",
    purpose:
      "Le rapprochement : comparer les licences des fiches à ce que l'abonnement facture, signer le mois, voir les impayés. Sans elle, l'écran Facturation et les analyses de CA facturé sont vides.",
    scope: ["Clients, abonnements et lignes (lecture)", "Factures clients et état de paiement (lecture)", "Aucune écriture"],
    docUrl: "https://pennylane.readme.io/",
    consoleUrl: "https://app.pennylane.com",
    env: [
      { name: "PENNYLANE_API_TOKEN", required: true, hint: "Jeton d'entreprise, lecture seule (scope factures clients inclus)." },
      { name: "PENNYLANE_API_BASE", required: false, hint: "Base de l'API externe v2 — défaut app.pennylane.com/api/external/v2." },
    ],
    testLabel: "Lire la liste des clients",
  },
  {
    key: "brevo",
    name: "Brevo",
    mark: "B",
    purpose:
      "L'envoi de tous les e-mails du support (parcours, séquences, alertes) par SMTP, et l'API pour l'import des affaires et la synchronisation des désinscriptions.",
    scope: ["SMTP transactionnel (envoi)", "Deals et historique (lecture)", "Désinscriptions et suppressions (lecture / écriture)"],
    docUrl: "https://developers.brevo.com/",
    consoleUrl: "https://app.brevo.com/settings/keys/api",
    env: [
      { name: "BREVO_API_KEY", required: true, hint: "Clé API v3." },
      { name: "BREVO_SMTP_USER", required: true, hint: "Identifiant SMTP (envoi des e-mails)." },
      { name: "BREVO_SMTP_KEY", required: true, hint: "Clé SMTP." },
      { name: "EMAIL_FROM", required: true, hint: "Expéditeur par défaut — doit être vérifié chez Brevo." },
      { name: "EMAIL_FROM_NAME", required: false, hint: "Nom d'expéditeur affiché." },
    ],
    testLabel: "Lire le compte Brevo",
  },
  {
    key: "insee",
    name: "INSEE — API Sirene",
    mark: "I",
    purpose:
      "Le préremplissage d'une fiche client : raison sociale, SIREN/SIRET, adresse. Sans elle, la recherche sur la fiche ne répond plus et les SIREN se saisissent à la main.",
    scope: ["Recherche d'établissements par nom, SIREN ou SIRET (lecture)"],
    docUrl: "https://portail-api.insee.fr/",
    consoleUrl: "https://portail-api.insee.fr/",
    env: [
      { name: "INSEE_API_KEY", required: true, hint: "Clé d'application du portail INSEE." },
      { name: "INSEE_API_BASE", required: false, hint: "Défaut api.insee.fr/api-sirene/3.11." },
      { name: "INSEE_API_KEY_HEADER", required: false, hint: "Défaut X-INSEE-Api-Key-Integration." },
    ],
    testLabel: "Chercher « TIM MANAGEMENT »",
  },
  {
    key: "google",
    name: "Google Workspace",
    mark: "G",
    purpose:
      "Les agendas des partenaires (créneaux de prise en main et de bilan, événements et liens de visio) et les boîtes mail connectées (échanges remontés dans l'historique des opportunités).",
    scope: ["Calendar : disponibilités, événements (lecture / écriture)", "Gmail : messages échangés (lecture)"],
    docUrl: "https://developers.google.com/workspace",
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    env: [
      { name: "GOOGLE_CLIENT_ID", required: true, hint: "Application OAuth « agenda »." },
      { name: "GOOGLE_CLIENT_SECRET", required: true, hint: "Son secret." },
      { name: "GOOGLE_MAIL_CLIENT_ID", required: true, hint: "Application OAuth « messagerie »." },
      { name: "GOOGLE_MAIL_CLIENT_SECRET", required: true, hint: "Son secret." },
    ],
    testLabel: "Rafraîchir les agendas connectés",
  },
  {
    key: "anthropic",
    name: "Anthropic (Claude)",
    mark: "A",
    purpose:
      "L'assistant qui répond aux questions, en bas à droite : Claude lit le support par des outils de lecture et explique. Sans elle, les rappels restent, le champ de question disparaît.",
    scope: ["Aucune donnée écrite chez eux", "Les questions et les données lues pour y répondre transitent par l'API (conservation 30 jours par défaut)", "Modèle : Claude Haiku 4.5 — le moins cher"],
    docUrl: "https://docs.anthropic.com/",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    env: [
      { name: "ANTHROPIC_API_KEY", required: true, hint: "Clé API du compte Anthropic (plafond de dépense à régler sur la console)." },
      { name: "ASSISTANT_AI_DAILY_LIMIT", required: false, hint: "Questions par jour et par compte — défaut 100." },
      { name: "ASSISTANT_AI_DAILY_BUDGET_EUR", required: false, hint: "Plafond de dépense par jour, tous comptes — défaut 10 €." },
    ],
    testLabel: "Poser une question minimale à Claude",
  },
  {
    key: "meta",
    name: "Meta Ads (Facebook / Instagram)",
    mark: "M",
    purpose:
      "Le module Publicité : connecter les comptes publicitaires Meta, lire leurs campagnes et leurs chiffres chaque nuit. Sans elle, le tableau de bord Publicité ne reçoit plus rien — les chiffres déjà lus restent.",
    scope: [
      "Marketing API, lecture seule (ads_read) : comptes, campagnes, métriques quotidiennes",
      "Aucune écriture en phase 0 : ni budget, ni statut, ni annonce",
      "Jetons des comptes : utilisateur système (sans échéance, voie principale) ou OAuth (~60 jours, secours), chiffrés en base",
      "Seuls les comptes de META_ALLOWED_AD_ACCOUNTS peuvent entrer",
    ],
    docUrl: "https://developers.facebook.com/docs/marketing-api/",
    consoleUrl: "https://developers.facebook.com/apps/",
    env: [
      { name: "META_APP_ID", required: true, hint: "Identifiant de l'app Meta (developers.facebook.com)." },
      { name: "META_APP_SECRET", required: true, hint: "Clé secrète de l'app." },
      { name: "META_ALLOWED_AD_ACCOUNTS", required: true, hint: "Comptes connectables, séparés par des virgules (act_211325410243618). Absente : aucun compte réel n'entre." },
      { name: "META_GRAPH_VERSION", required: false, hint: "Version de l'API Graph — défaut v26.0." },
      { name: "ADS_META_MOCK", required: false, hint: "« 1 » = données simulées, aucun appel à Meta. À retirer dès que l'app existe." },
    ],
    testLabel: "Obtenir un jeton d'application auprès de Meta",
    simulatedBy: "ADS_META_MOCK",
  },
  {
    key: "search-console",
    name: "Google Search Console",
    mark: "S",
    purpose:
      "Analyses → SEO & GEO : clics, impressions, CTR et position sur Google, par requête, par page, par appareil — et les opportunités (requêtes en 2e page). Sans elle, le bloc « Moteurs de recherche » reste vide.",
    scope: [
      "Search Analytics, lecture seule (webmasters.readonly)",
      "Compte de service Google Cloud, ajouté comme utilisateur « Restreint » de la propriété",
      "Le rapport « IA générative » (AI Overviews / AI Mode) n'est pas dans l'API : il se lit dans Search Console",
    ],
    docUrl: "https://developers.google.com/webmaster-tools/v1/how-tos/search_analytics",
    consoleUrl: "https://search.google.com/search-console/users",
    env: [
      { name: "GSC_SERVICE_ACCOUNT_JSON", required: true, hint: "La clé JSON du compte de service (collée telle quelle ou en base64)." },
      { name: "GSC_SITE_URL", required: true, hint: "La propriété, exactement comme dans Search Console : « sc-domain:exemple.fr » ou « https://www.exemple.fr/ »." },
      { name: "SEO_BRAND_TERMS", required: false, hint: "Mots de la marque, séparés par des virgules — défaut « tim management,tim-management,timmanagement »." },
    ],
    testLabel: "Lire les clics d'un jour",
  },
  {
    key: "pagespeed",
    name: "PageSpeed Insights",
    mark: "V",
    purpose:
      "Analyses → SEO & GEO, « Santé technique » : Core Web Vitals réels (LCP, INP, CLS) et scores Lighthouse des pages clés, sur mobile. Relu une fois par jour.",
    scope: ["Audit public des pages listées (lecture)", "Données terrain CrUX quand le site a assez de trafic Chrome"],
    docUrl: "https://developers.google.com/speed/docs/insights/v5/get-started",
    consoleUrl: "https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com",
    env: [
      { name: "PAGESPEED_API_KEY", required: true, hint: "Clé d'API Google Cloud, restreinte à la PageSpeed Insights API (gratuite)." },
      { name: "SEO_KEY_URLS", required: false, hint: "Pages à auditer, séparées par des virgules (12 au plus) — défaut : l'accueil de GSC_SITE_URL." },
    ],
    testLabel: "Auditer la première page clé",
  },
  {
    key: "bing-webmaster",
    name: "Bing Webmaster Tools",
    mark: "W",
    purpose:
      "Analyses → SEO & GEO : clics et requêtes Bing. L'index de Bing nourrit Copilot et une partie de ChatGPT Search — y être bien indexé, c'est aussi du GEO.",
    scope: ["Trafic et requêtes (lecture)", "Le rapport « AI Performance » (citations Copilot) n'a pas encore d'API : il se lit dans Bing Webmaster Tools"],
    docUrl: "https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi",
    consoleUrl: "https://www.bing.com/webmasters/apikey",
    env: [
      { name: "BING_WEBMASTER_API_KEY", required: true, hint: "Paramètres → Accès API → Clé API." },
      { name: "BING_SITE_URL", required: false, hint: "Le site tel que déclaré dans Bing (https://www.exemple.fr/) — défaut : déduit de GSC_SITE_URL." },
    ],
    testLabel: "Lire le trafic Bing",
  },
  {
    key: "ga4-data",
    name: "Google Analytics 4 (lecture)",
    mark: "4",
    purpose:
      "Analyses → SEO & GEO : toutes les visites envoyées par Google, Bing et les assistants IA (ChatGPT, Gemini, Perplexity…) — pas seulement celles qui deviennent des prospects — et ce qu'elles font sur le site. L'envoi des conversions vers GA4 (Measurement Protocol) est une autre chose, déjà branchée.",
    scope: [
      "Data API, lecture seule (analytics.readonly) : visites par source, page d'arrivée, engagement, conversions",
      "Même compte de service que Search Console (GSC_SERVICE_ACCOUNT_JSON), ajouté en « Lecteur » sur la propriété",
      "Ne voit que les visiteurs qui acceptent les cookies : un plancher, dont l'évolution reste juste",
    ],
    docUrl: "https://developers.google.com/analytics/devguides/reporting/data/v1",
    consoleUrl: "https://analytics.google.com/analytics/web/",
    env: [{ name: "GA4_PROPERTY_ID", required: true, hint: "L'ID de la propriété GA4 (un nombre, Administration → Détails de la propriété) — pas l'ID de mesure G-…" }],
    testLabel: "Lire les visites des 7 derniers jours",
  },
  {
    key: "google-ads",
    name: "Google Ads (lecture)",
    mark: "A",
    purpose:
      "Équipe IA : ce que lit Thomas, chef Google Ads — campagnes, dépense, termes de recherche, mots-clés, conversions — et la vraie dépense Google de la fiche des canaux. Sans elle, Thomas reste « Arrive bientôt » et la fiche prend les relevés Pennylane.",
    scope: [
      "API Google Ads, lecture seule : le compte de service (GSC_SERVICE_ACCOUNT_JSON) est utilisateur « Lecture seule » du compte",
      "Projet Google Cloud en accès « Explorer » (2 880 opérations par jour) ; plus de jeton développeur depuis le 09/09/2026",
      "Aucune écriture : budgets et mots-clés négatifs se changent dans la console, via « Vos demandes »",
    ],
    docUrl: "https://developers.google.com/google-ads/api/docs/start",
    consoleUrl: "https://ads.google.com/aw/accountsettings/accessandsecurity",
    env: [
      { name: "GOOGLE_ADS_CUSTOMER_ID", required: true, hint: "L'identifiant du compte Google Ads (335-848-3794), avec ou sans tirets." },
      { name: "GOOGLE_ADS_LOGIN_CUSTOMER_ID", required: false, hint: "Seulement si l'accès passe par un compte administrateur (MCC) : son identifiant." },
      { name: "GOOGLE_ADS_API_VERSION", required: false, hint: "Version de l'API — défaut v24." },
    ],
    testLabel: "Lire le nom du compte Google Ads",
  },
  {
    key: "openai-ads",
    name: "ChatGPT Ads (lecture)",
    mark: "C",
    purpose:
      "Équipe IA : ce que lit Sarah, cheffe ChatGPT Ads — campagnes, dépense, clics, conversions du pixel — et la vraie dépense ChatGPT de la fiche des canaux. Sans elle, Sarah reste « Arrive bientôt » et la fiche prend les relevés Pennylane.",
    scope: [
      "API annonceur OpenAI (api.ads.openai.com), lectures seulement : le support ne fait que des GET",
      "La clé d'API annonceur du Gestionnaire de publicités (Paramètres › Général) — pas une clé de conversion, qui ne lit rien",
      "Aucune écriture : budgets et annonces se changent dans le Gestionnaire, via « Vos demandes »",
    ],
    docUrl: "https://developers.openai.com/ads",
    consoleUrl: "https://ads.openai.com",
    env: [{ name: "OPENAI_ADS_API_KEY", required: true, hint: "La clé d'API annonceur (Gestionnaire de publicités › Paramètres › Général). Elle peut aussi écrire : à garder en variable sensible." }],
    testLabel: "Lire le compte ChatGPT Ads",
  },
];

export type EnvState = { name: string; required: boolean; hint: string; set: boolean; tail: string | null };

/**
 * L'état d'une variable, sans jamais montrer sa valeur : posée ou non, et
 * ses quatre derniers caractères — assez pour reconnaître une clé (« celle
 * qui finit en …9f2a »), jamais assez pour s'en servir. Les valeurs courtes
 * n'ont pas de queue du tout.
 */
export const envState = (v: EnvVar, env: Record<string, string | undefined> = process.env): EnvState => {
  const value = env[v.name]?.trim() ?? "";
  return {
    ...v,
    set: value.length > 0,
    tail: value.length >= 12 ? `…${value.slice(-4)}` : null,
  };
};

export const connectionEnv = (c: SupportConnection, env?: Record<string, string | undefined>): EnvState[] =>
  c.env.map((v) => envState(v, env));

/** La connexion tourne-t-elle sur des données simulées ? */
export const isSimulated = (c: SupportConnection, env: Record<string, string | undefined> = process.env): boolean =>
  Boolean(c.simulatedBy) && env[c.simulatedBy!]?.trim() === "1";

/** Tout ce qui est obligatoire est posé — ou la connexion est simulée. */
export const isConfigured = (c: SupportConnection, env?: Record<string, string | undefined>): boolean =>
  isSimulated(c, env) || connectionEnv(c, env).every((v) => v.set || !v.required);
