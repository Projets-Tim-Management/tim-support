import { readRunToken, runToken, safeRunToken } from "@/modules/marketing/lib/run-token";

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

/** Jeton du lien de réponse — voir `run-token.ts` pour ce qu'il garantit. */
export const satisfactionToken = (runId: number | string): string => runToken("avis", runId);

/** @returns l'identifiant du parcours si la signature est valide, `null` sinon. */
export const readSatisfactionToken = (token?: string | null): string | null =>
  readRunToken("avis", token);

/** L'adresse d'un visage dans le message. `null` si le jeton n'est pas signable. */
export const satisfactionUrl = (
  siteUrl: string,
  runId: number | string,
  value: number,
): string | null => {
  const token = safeRunToken("avis", runId);
  return token ? `${siteUrl.replace(/\/$/, "")}/avis/${token}?note=${value}` : null;
};
