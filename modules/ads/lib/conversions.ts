import { createHash } from "node:crypto";

/**
 * Renvoyer à Meta ce que deviennent les leads (plan Publicité, §9 nonies,
 * étape 6 — API Conversions) : Meta optimise alors sur de vrais prospects, pas
 * seulement sur des visites.
 *
 * Décision de Charlie (29/10/2026) : **seulement pour un visiteur qui a accepté
 * les cookies « Publicité »** dans la bannière de la vitrine — comme le pixel
 * lui-même. Sans cet accord, rien ne part, même haché.
 *
 * Trois événements, un par étape de la fiche :
 *  - `Lead` à la réception du formulaire (dédoublonné avec le pixel de la
 *    vitrine par le même `event_id` : l'identifiant de la soumission) ;
 *  - `QualifiedLead` quand la fiche passe la qualification (démo programmée et
 *    au-delà) ;
 *  - `WonDeal` à la signature.
 * Les deux derniers naissent dans le support : `action_source = system_generated`.
 *
 * Meta refuse un événement de plus de 7 jours : un `Lead` trop ancien n'est pas
 * envoyé ; une étape franchie est datée du moment où on la constate.
 *
 * Pure.
 */

export const CONVERSION_EVENTS = [
  { label: "Lead (formulaire)", value: "Lead" },
  { label: "Lead qualifié", value: "QualifiedLead" },
  { label: "Client signé", value: "WonDeal" },
] as const;
export type ConversionEvent = (typeof CONVERSION_EVENTS)[number]["value"];

export const MAX_EVENT_AGE_MS = 7 * 86_400_000;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** L'e-mail tel que Meta le hache : sans espaces, en minuscules. */
export const hashEmail = (email?: string | null): string | null => {
  const e = (email ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? sha256(e) : null;
};

/** Le téléphone tel que Meta le hache : chiffres seuls, indicatif compris (France par défaut). */
export const hashPhone = (phone?: string | null): string | null => {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  const full = digits.startsWith("33") ? digits : digits.startsWith("0") ? `33${digits.slice(1)}` : digits;
  return sha256(full);
};

/** `fbc` : le cookie `_fbc` s'il est là, sinon reconstruit à partir de `fbclid` (format de Meta). */
export function fbcOf(s: { fbc?: string | null; fbclid?: string | null }, clickedAt: Date): string | null {
  if (s.fbc && /^fb\.\d\.\d+\..+$/.test(s.fbc)) return s.fbc;
  return s.fbclid ? `fb.1.${clickedAt.getTime()}.${s.fbclid}` : null;
}

export type SubmissionIn = {
  id: number | string;
  submissionId: string;
  createdAt: string;
  adsConsent?: boolean | null;
  email?: string | null;
  phone?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  fbclid?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  sourcePageUrl?: string | null;
};

export type MetaEvent = {
  event_name: ConversionEvent;
  event_time: number;
  event_id: string;
  action_source: "website" | "system_generated";
  event_source_url?: string;
  user_data: Record<string, string | string[]>;
  custom_data?: Record<string, string>;
};

/**
 * L'événement d'une étape pour une soumission, ou la raison de ne pas l'envoyer.
 * `at` : quand l'étape a eu lieu (le formulaire pour un `Lead`, maintenant pour les autres).
 */
export function buildEvent(event: ConversionEvent, s: SubmissionIn, at: Date, now: Date): MetaEvent | { skip: string } {
  if (s.adsConsent !== true) return { skip: "pas d'accord « Publicité » du visiteur" };
  if (now.getTime() - at.getTime() > MAX_EVENT_AGE_MS) return { skip: "plus de 7 jours : Meta le refuserait" };
  const em = hashEmail(s.email);
  const ph = hashPhone(s.phone);
  const fbc = fbcOf(s, new Date(s.createdAt));
  const user: Record<string, string | string[]> = {};
  if (em) user.em = [em];
  if (ph) user.ph = [ph];
  if (fbc) user.fbc = fbc;
  if (s.fbp) user.fbp = s.fbp;
  if (event === "Lead" && s.ip) user.client_ip_address = s.ip;
  if (event === "Lead" && s.userAgent) user.client_user_agent = s.userAgent;
  if (!em && !ph && !fbc && !s.fbp) return { skip: "rien pour reconnaître la personne (ni e-mail, ni téléphone, ni clic Meta)" };
  return {
    event_name: event,
    event_time: Math.floor(at.getTime() / 1000),
    // Le même identifiant que le pixel de la vitrine pour un Lead : Meta ne le compte qu'une fois.
    event_id: event === "Lead" ? s.submissionId : `${event}-${s.submissionId}`,
    action_source: event === "Lead" ? "website" : "system_generated",
    ...(event === "Lead" && s.sourcePageUrl ? { event_source_url: s.sourcePageUrl } : {}),
    user_data: user,
    ...(event === "Lead" ? {} : { custom_data: { lead_event_source: "TIM Support" } }),
  };
}
