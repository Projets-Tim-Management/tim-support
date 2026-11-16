import { createHmac, timingSafeEqual } from "node:crypto";

import type { Payload } from "payload";

import { splitName } from "@/modules/forms/lib/to-opportunity";

/**
 * LE RENDEZ-VOUS QUI SUIT UNE DEMANDE (16/11/2026, point 3) : après le formulaire de contact, la vitrine affiche la
 * page de réservation déjà remplie (nom, e-mail, téléphone, société, effectif), et le rendez-vous se rattache à la
 * MÊME demande et à la même fiche, avec sa source (UTM, page, clic).
 *
 * L'adresse porte une référence SIGNÉE de la demande (`?demande=<id>.<signature>`), jamais ses coordonnées : on ne
 * rattache pas un rendez-vous à la demande de quelqu'un d'autre en changeant un numéro, et rien de personnel ne passe
 * dans l'adresse.
 */

const secret = () => process.env.PAYLOAD_SECRET || process.env.FORMS_INGEST_SECRET || "dev";
const sig = (id: string) => createHmac("sha256", secret()).update(`demande:${id}`).digest("base64url").slice(0, 22);

export const signSubmission = (id: number | string) => `${id}.${sig(String(id))}`;

/** La demande désignée par une référence signée ; null si la signature ne tient pas. Pur (testé). */
export function verifySubmissionRef(ref: unknown): string | null {
  const m = /^(\d{1,12})\.([A-Za-z0-9_-]{22})$/.exec(String(ref ?? ""));
  if (!m) return null;
  const a = Buffer.from(m[2]);
  const b = Buffer.from(sig(m[1]));
  return a.length === b.length && timingSafeEqual(a, b) ? m[1] : null;
}

export type Prefill = { firstName?: string; lastName?: string; email?: string; phone?: string; company?: string; answers: Record<string, string> };

/** Ce que la demande d'origine sait déjà : les coordonnées, et les réponses dont la clé est celle d'une question. */
export async function prefillFromSubmission(payload: Payload, id: string): Promise<Prefill | null> {
  const s = (await payload.findByID({ collection: "form-submissions", id, depth: 0, overrideAccess: true }).catch(() => null)) as { answers?: Record<string, unknown> } | null;
  if (!s) return null;
  const a = s.answers ?? {};
  const text = (k: string) => (typeof a[k] === "string" && (a[k] as string).trim() ? (a[k] as string).trim() : undefined);
  const name = text("prenom") ? { firstName: text("prenom"), lastName: text("nom") } : splitName(text("nom"));
  return {
    ...name,
    email: text("email"),
    phone: text("telephone"),
    company: text("company_name") ?? text("societe"),
    answers: Object.fromEntries(
      Object.entries(a).flatMap(([k, v]) => (typeof v === "string" && v.trim() ? [[k, v.trim()]] : Array.isArray(v) && v.length ? [[k, v.map(String).join(",")]] : [])),
    ),
  };
}

/** Les champs pré-remplis par l'adresse (?prenom=…&nom=…&email=…&telephone=…&societe=…&<clé de question>=…). Pur. */
export function prefillFromQuery(q: Record<string, string | string[] | undefined>, questionKeys: string[]): Prefill {
  const one = (k: string) => {
    const v = q[k];
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === "string" && s.trim() ? s.trim().slice(0, 200) : undefined;
  };
  return {
    firstName: one("prenom"),
    lastName: one("nom"),
    email: one("email"),
    phone: one("telephone"),
    company: one("societe"),
    answers: Object.fromEntries(questionKeys.flatMap((k) => (one(k) ? [[k, one(k)!]] : []))),
  };
}
