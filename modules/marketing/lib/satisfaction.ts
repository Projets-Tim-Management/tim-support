import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * « Comment ça se passe sur le chantier ? » — la réponse en un clic.
 *
 * Le message de la première semaine demandait de RÉPONDRE à l'e-mail. Beaucoup
 * ne répondent pas : non pas qu'il n'y ait rien à dire, mais écrire un message
 * demande de trouver quoi écrire. Cinq visages permettent de répondre sans
 * rédiger — et un client qui a cliqué « ça ne va pas » est un client qu'on
 * rappelle le jour même, au lieu de l'apprendre au bilan.
 *
 * Le clic mène à une page qui enregistre la note SUR LE PARCOURS : c'est là
 * qu'on suit ce client, et une réponse rangée ailleurs ne serait jamais relue.
 */

export const SATISFACTION_LEVELS = [
  { value: 1, emoji: "😞", label: "Ça ne va pas" },
  { value: 2, emoji: "🙁", label: "Moyen" },
  { value: 3, emoji: "😐", label: "Correct" },
  { value: 4, emoji: "🙂", label: "Bien" },
  { value: 5, emoji: "😀", label: "Très bien" },
] as const;

export type SatisfactionLevel = (typeof SATISFACTION_LEVELS)[number]["value"];

/** La note est-elle une des cinq ? Tout le reste est refusé. */
export const isSatisfactionLevel = (value: unknown): value is SatisfactionLevel =>
  SATISFACTION_LEVELS.some((l) => l.value === value);

/**
 * Jeton du lien de réponse — SANS EXPIRATION, comme celui de désinscription.
 *
 * Un client qui rouvre le message trois semaines plus tard doit encore pouvoir
 * répondre : lui montrer « lien expiré » à ce moment-là, c'est perdre la seule
 * réponse qu'il aura donnée. Le parcours, lui, finit par se clôturer — c'est la
 * page qui refuse une réponse sur un test terminé, pas le jeton.
 *
 * Signé, donc non falsifiable et non énumérable : sans signature, on noterait
 * n'importe quel parcours en devinant un identifiant.
 */
const sign = (runId: string): string => {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) throw new Error("PAYLOAD_SECRET manquant");
  return createHmac("sha256", secret).update(`avis:${runId}`).digest("base64url");
};

export const satisfactionToken = (runId: number | string): string => {
  const value = String(runId);
  return `${Buffer.from(value).toString("base64url")}.${sign(value)}`;
};

/**
 * Le jeton, ou `null` s'il ne peut pas être signé.
 *
 * Le message d'accompagnement ne doit pas tomber parce qu'un secret manque : un
 * client privé de visages reçoit un e-mail amputé, un client privé du message
 * entier n'a plus de nouvelles du tout.
 */
const safeSatisfactionToken = (runId: number | string): string | null => {
  try {
    return satisfactionToken(runId);
  } catch {
    return null;
  }
};

/** @returns l'identifiant du parcours si la signature est valide, `null` sinon. */
export const readSatisfactionToken = (token?: string | null): string | null => {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let runId: string;
  try {
    runId = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!runId) return null;

  let expected: string;
  try {
    expected = sign(runId);
  } catch {
    return null;
  }

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Comparaison à temps constant : la signature se devine autrement, octet par
  // octet, en mesurant le temps de réponse.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return runId;
};

/** L'adresse d'un visage dans le message. `null` si le jeton n'est pas signable. */
export const satisfactionUrl = (
  siteUrl: string,
  runId: number | string,
  value: number,
): string | null => {
  const token = safeSatisfactionToken(runId);
  return token ? `${siteUrl.replace(/\/$/, "")}/avis/${token}?note=${value}` : null;
};
