/**
 * Les variables des textes du parcours.
 *
 * Un texte repris à la main remplace un texte du code qui, lui, CALCULAIT :
 * « votre test démarre le lundi 7 septembre », « vos 9 accès ». Sans variables,
 * la reprise fige ces valeurs et le message devient faux au client suivant —
 * sans que rien ne le signale, puisqu'il part quand même.
 *
 * Le jeu est volontairement court : ce qu'on sait TOUJOURS d'un parcours au
 * moment d'écrire. Une variable de plus, c'est une variable de plus à connaître
 * pour se servir de l'écran.
 *
 * Chaque variable porte un REPLI. « Bonjour , » et « démarre le . » sont pires
 * que « Bonjour, » et « démarre prochainement. » : une valeur manquante doit
 * produire une phrase, pas un trou.
 */

export type JourneyVariable = {
  token: string;
  label: string;
  hint: string;
  /** Ce qui s'affiche quand la valeur manque. Jamais une chaîne vide. */
  fallback: string;
};

export const JOURNEY_VARIABLES: JourneyVariable[] = [
  { token: "prenom", label: "Prénom", hint: "Prénom du contact", fallback: "" },
  {
    token: "entreprise",
    label: "Entreprise",
    hint: "Nom de l'entreprise cliente",
    fallback: "votre entreprise",
  },
  {
    token: "partenaire",
    label: "Partenaire",
    hint: "Nom du partenaire qui suit le test",
    fallback: "votre interlocuteur TIM",
  },
  {
    token: "date_debut",
    label: "Date de démarrage",
    hint: "« lundi 07 septembre » — à écrire APRÈS le verbe, sans « le »",
    fallback: "prochainement",
  },
  {
    token: "date_fin",
    label: "Date de fin",
    hint: "« lundi 05 octobre » — à écrire APRÈS le verbe, sans « le »",
    fallback: "bientôt",
  },
  {
    token: "date_session",
    label: "Date de la session",
    hint: "Créneau de prise en main, date et heure",
    fallback: "bientôt",
  },
  {
    token: "modalite_session",
    label: "Modalité de la session",
    hint: "« en visio » ou « sur site — 12 rue… »",
    fallback: "en visio",
  },
  {
    token: "nb_acces",
    label: "Nombre d'accès",
    hint: "Comptes créés pour ce client",
    fallback: "plusieurs",
  },
  {
    token: "date_limite_dossier",
    label: "Date limite du dossier",
    hint: "Échéance de l'étape « Dossier de démarrage »",
    fallback: "au plus vite",
  },
  {
    token: "code",
    label: "Code de connexion",
    hint: "Le code à 6 chiffres — uniquement pour le message de connexion",
    fallback: "votre code",
  },
  {
    token: "duree_semaines",
    label: "Durée (semaines)",
    hint: "Durée du test en semaines",
    fallback: "quelques",
  },
];

const KNOWN = new Set(JOURNEY_VARIABLES.map((v) => v.token));

/** Toutes les occurrences `{{...}}` d'un texte, dans l'ordre. */
const TOKENS = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/**
 * Les variables inconnues d'un texte — c'est ce que la validation refuse.
 *
 * `{{prenoom}}` part tel quel chez le client : le message est déjà distribué
 * quand quelqu'un s'en aperçoit. On refuse donc à l'enregistrement, seul moment
 * où la correction ne coûte rien.
 */
export const unknownJourneyVars = (text: string): string[] => {
  const found = new Set<string>();
  for (const [, name] of text.matchAll(TOKENS)) {
    if (!KNOWN.has(name.toLowerCase())) found.add(name);
  }
  return [...found];
};

/**
 * Remplace les variables par leurs valeurs.
 *
 * Une variable connue mais sans valeur prend son repli ; une variable inconnue
 * reste telle quelle — visible, donc corrigeable. L'effacer silencieusement
 * ferait disparaître le symptôme sans corriger la cause.
 */
export const applyJourneyVars = (
  text: string,
  values: Record<string, string | number | null | undefined>,
): string =>
  text.replace(TOKENS, (whole, rawName: string) => {
    const name = rawName.toLowerCase();
    const variable = JOURNEY_VARIABLES.find((v) => v.token === name);
    if (!variable) return whole;
    const value = values[name];
    if (value === null || value === undefined || String(value).trim() === "") {
      return variable.fallback;
    }
    return String(value);
  });
