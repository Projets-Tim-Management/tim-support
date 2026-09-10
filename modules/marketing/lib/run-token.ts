import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Les liens d'un parcours qu'on met dans un e-mail — sans connexion.
 *
 * Les cinq visages de « Comment ça se passe ? » et les trois boutons de
 * décision partagent le même besoin : un lien qu'on clique depuis sa boîte,
 * souvent sur un téléphone, sans repasser par l'espace client. Ce qui désigne le
 * parcours, c'est le jeton — jamais un identifiant lu dans l'URL.
 *
 * Signé, donc ni falsifiable ni énumérable : sans signature, on noterait ou on
 * déciderait à la place de n'importe quel client en devinant un numéro.
 *
 * Le SUJET (`avis`, `decision`) entre dans la signature : un jeton d'avis ne
 * peut pas servir à décider. Sans lui, un lien reçu pour donner son ressenti
 * ouvrirait la page qui engage la suite commerciale.
 *
 * SANS EXPIRATION, volontairement : un client qui rouvre le message trois
 * semaines plus tard doit encore pouvoir répondre — lui montrer « lien expiré »
 * à ce moment-là, c'est perdre la seule réponse qu'il aura donnée. C'est la
 * page qui refuse d'agir sur un test clos, pas le jeton.
 */

export type TokenPurpose = "avis" | "decision";

const sign = (purpose: TokenPurpose, runId: string): string => {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) throw new Error("PAYLOAD_SECRET manquant");
  return createHmac("sha256", secret).update(`${purpose}:${runId}`).digest("base64url");
};

export const runToken = (purpose: TokenPurpose, runId: number | string): string => {
  const value = String(runId);
  return `${Buffer.from(value).toString("base64url")}.${sign(purpose, value)}`;
};

/**
 * Le jeton, ou `null` s'il ne peut pas être signé.
 *
 * Le message ne doit pas tomber parce qu'un secret manque : un client privé de
 * boutons reçoit un e-mail amputé, un client privé du message entier n'a plus
 * de nouvelles du tout.
 */
export const safeRunToken = (purpose: TokenPurpose, runId: number | string): string | null => {
  try {
    return runToken(purpose, runId);
  } catch {
    return null;
  }
};

/** @returns l'identifiant du parcours si la signature vaut pour CE sujet, `null` sinon. */
export const readRunToken = (purpose: TokenPurpose, token?: string | null): string | null => {
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
    expected = sign(purpose, runId);
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
