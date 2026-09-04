import { createHmac, timingSafeEqual } from "crypto";

import type { Payload } from "payload";

/**
 * Liste de suppression — les adresses auxquelles on n'envoie plus rien de
 * commercial.
 *
 * Transverse à tous les modules : n'importe quel envoi de masse futur doit la
 * consulter, pas seulement les séquences de relance. D'où sa place dans `core`.
 *
 * Elle est alimentée par trois voies : le lien de désinscription, les événements
 * Brevo (désinscription, rejet définitif, plainte pour spam) et l'ajout manuel.
 */

export const SUPPRESSION_REASONS = [
  { label: "Désinscription", value: "desinscription" },
  { label: "Rejet définitif", value: "rejet-definitif" },
  { label: "Signalé comme spam", value: "spam" },
  { label: "Ajout manuel", value: "manuelle" },
] as const;

export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number]["value"];

const normalize = (email: string): string => email.trim().toLowerCase();

/**
 * Jeton du lien de désinscription — SANS EXPIRATION, volontairement.
 *
 * Un lien de désinscription doit fonctionner sur un message vieux de deux ans :
 * c'est précisément là qu'on en a besoin. Un jeton expiré renverrait la personne
 * vers une erreur au moment où elle demande à ne plus être dérangée — le plus
 * sûr moyen de récolter une plainte pour spam à la place.
 *
 * Signé, donc non falsifiable et non énumérable : sans la signature, on pourrait
 * désinscrire n'importe qui en devinant une adresse.
 */
function sign(email: string): string {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) throw new Error("PAYLOAD_SECRET manquant");
  return createHmac("sha256", secret).update(`unsub:${email}`).digest("base64url");
}

export function unsubscribeToken(email: string): string {
  const value = normalize(email);
  return `${Buffer.from(value).toString("base64url")}.${sign(value)}`;
}

/** @returns l'adresse si la signature est valide, `null` sinon. */
export function readUnsubscribeToken(token?: string | null): string | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let email: string;
  try {
    email = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!email.includes("@")) return null;

  let expected: string;
  try {
    expected = sign(email);
  } catch {
    return null;
  }
  // Comparaison à temps constant, et longueurs comparées d'abord :
  // timingSafeEqual lève sur des tailles différentes.
  if (signature.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? email : null;
}

/** Lien complet à mettre dans un e-mail. */
export const unsubscribeUrl = (email: string): string =>
  `${(process.env.NEXT_PUBLIC_SITE_URL || "https://support.tim-management.co").replace(/\/$/, "")}` +
  `/api/desinscription?t=${unsubscribeToken(email)}`;

/**
 * En-têtes de désinscription.
 *
 * `List-Unsubscribe-Post` active le bouton natif « Se désabonner » de Gmail et
 * d'Apple Mail (RFC 8058). C'est ce qui évite qu'un lecteur pressé clique sur
 * « Spam » à la place — une plainte pour spam abîme la réputation d'expéditeur
 * de TOUS les envois, y compris les e-mails de tickets.
 */
export function unsubscribeHeaders(email: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl(email)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export async function isSuppressed(payload: Payload, email?: string | null): Promise<boolean> {
  if (!email) return false;
  const res = await payload
    .count({
      collection: "email-suppressions",
      where: { email: { equals: normalize(email) } },
      overrideAccess: true,
    })
    .catch(() => null);
  // En cas d'échec de lecture, on considère l'adresse SUPPRIMÉE : mieux vaut ne
  // pas envoyer que d'écrire à quelqu'un qui a demandé qu'on cesse.
  return res === null || res.totalDocs > 0;
}

/**
 * Idempotent : réinscrire une adresse déjà présente ne fait rien.
 *
 * @returns `true` si l'adresse vient d'être ajoutée, `false` si elle y était
 * déjà — sans quoi un résumé de synchronisation compterait des tentatives et
 * annoncerait chaque jour les mêmes désinscriptions comme nouvelles.
 */
export async function suppress(
  payload: Payload,
  email: string,
  reason: SuppressionReason,
  source?: string,
): Promise<boolean> {
  const value = normalize(email);
  const existing = await payload.find({
    collection: "email-suppressions",
    where: { email: { equals: value } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.docs.length) return false;

  try {
    await payload.create({
      collection: "email-suppressions",
      data: { email: value, reason, source } as never,
      overrideAccess: true,
    });
  } catch (err) {
    /**
     * L'adresse est UNIQUE en base : deux appels simultanés — le clic sur le
     * lien et le bouton natif de la messagerie partent souvent ensemble — font
     * échouer le second. Ce n'est pas une erreur à remonter : la personne est
     * désinscrite, c'est tout ce qu'elle demandait. Lever ici renverrait une
     * page d'échec pour une opération qui a réussi.
     */
    const now = await payload.count({
      collection: "email-suppressions",
      where: { email: { equals: value } },
      overrideAccess: true,
    });
    if (now.totalDocs > 0) return false;
    throw err;
  }

  payload.logger.info(`[désinscription] ${value} ajoutée à la liste de suppression (${reason}).`);
  return true;
}
