/**
 * Le « Bonjour … » des messages au demandeur d'un ticket.
 *
 * Prénom + nom quand on a les deux (« Bonjour Antoine Troy, ») ; sinon
 * « Bonjour, » tout court. Jamais le nom de famille seul : « Bonjour TROY, »
 * sonne sec, et y ajouter Monsieur ou Madame à la main, c'est risquer de se
 * tromper (décision de Charlie, 02/11/2026). Une civilité saisie par le client
 * (« Mr. Troy ») est retirée pour la même raison.
 *
 * Pure : utilisée par l'éditeur de réponse (navigateur) et les e-mails (serveur).
 */
const CIVILITY = /^(m|mr|mrs|ms|mme|mlle|melle|monsieur|madame|mademoiselle|dr)\.?$/i;

const words = (s?: string | null) =>
  (s ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !CIVILITY.test(w));

/** « TROY » → « Troy » ; « Jean-MARC » → « Jean-Marc » ; une casse déjà mixte (« McDonald ») est gardée. */
const tidy = (w: string) =>
  w === w.toUpperCase() ? w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase()) : w;

/** Le nom à saluer, ou null s'il faut s'en tenir à « Bonjour, ». */
export function greetingName(name?: string | null, firstName?: string | null): string | null {
  const first = words(firstName);
  const last = words(name);
  // Un seul champ en plusieurs mots (« Antoine Troy » dans Nom) : c'est déjà prénom + nom.
  const full = first.length ? [...first, ...last] : last;
  if (!first.length && last.length < 2) return null;
  if (first.length && !last.length) return null;
  return full.map(tidy).join(" ");
}

export const greeting = (name?: string | null, firstName?: string | null) => {
  const who = greetingName(name, firstName);
  return who ? `Bonjour ${who},` : "Bonjour,";
};
