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
  key: "pennylane" | "brevo" | "insee" | "google" | "anthropic";
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
    ],
    testLabel: "Poser une question minimale à Claude",
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

/** Tout ce qui est obligatoire est posé. */
export const isConfigured = (c: SupportConnection, env?: Record<string, string | undefined>): boolean =>
  connectionEnv(c, env).every((v) => v.set || !v.required);
