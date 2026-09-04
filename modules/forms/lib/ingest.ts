import { timingSafeEqual } from "crypto";

import { PLACEMENTS, type Placement } from "@/modules/forms/lib/form-schema";

/**
 * Ce qui entoure une soumission : le droit de l'envoyer, l'adresse du visiteur,
 * et d'où il vient.
 *
 * La vitrine poste depuis son proxy serveur, jamais depuis le navigateur. D'où
 * un secret partagé plutôt qu'une origine (une origine se falsifie d'une ligne
 * de curl), et le relai explicite de l'IP et du navigateur — sans lui on ne
 * verrait que l'infrastructure Vercel.
 */

export const INGEST_KEY_HEADER = "x-form-key";

/** Comparaison à temps constant, comme le webhook entrant. */
function secretMatches(provided: string | null): boolean {
  const secret = process.env.FORMS_INGEST_SECRET ?? "";
  if (!secret || !provided || provided.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
}

export type KeyCheck = { ok: true } | { ok: false; reason: "unauthorized" | "misconfigured" };

/**
 * Sans secret configuré : refus en production (un point d'entrée public non
 * protégé est pire qu'un point d'entrée absent), tolérance en développement.
 */
export function checkIngestKey(req: Request): KeyCheck {
  if (!process.env.FORMS_INGEST_SECRET) {
    return process.env.NODE_ENV === "production"
      ? { ok: false, reason: "misconfigured" }
      : { ok: true };
  }
  return secretMatches(req.headers.get(INGEST_KEY_HEADER))
    ? { ok: true }
    : { ok: false, reason: "unauthorized" };
}

/**
 * Adresse du visiteur, relayée par le proxy. La PREMIÈRE entrée de
 * `X-Forwarded-For` est le client d'origine ; les suivantes sont les relais.
 * Falsifiable, donc : elle limite le débit, elle n'autorise rien.
 */
export function clientIp(req: Request): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || undefined;
}

const cap = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

const PLACEMENT_VALUES = new Set<string>(PLACEMENTS.map((p) => p.value));

export interface Attribution {
  placement?: Placement;
  sourcePagePath?: string;
  /**
   * Première page de la visite, qui n'est pas toujours celle du formulaire.
   * C'est elle qui explique un lead sans campagne : « arrivé directement sur la
   * landing page » ne se distingue pas autrement d'une navigation ordinaire.
   */
  landingPath?: string;
  sourcePageUrl?: string;
  lpSlug?: string;
  lpVariant?: string;
  referrer?: string;
  sessionId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  msclkid?: string;
}

/**
 * Normalise le bloc d'attribution. Rien n'y fait échouer : ces informations
 * expliquent un lead, elles ne le conditionnent pas. Un emplacement inconnu est
 * écarté — on perd la précision, jamais le lead.
 *
 * Les plafonds ne sont pas décoratifs : ces valeurs viennent d'une URL, donc de
 * qui la fabrique.
 */
export function parseAttribution(raw: unknown): Attribution {
  const a = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const placement = cap(a.placement, 40);

  return {
    ...(placement && PLACEMENT_VALUES.has(placement) ? { placement: placement as Placement } : {}),
    sourcePagePath: cap(a.source_page_path ?? a.sourcePagePath, 500),
    landingPath: cap(a.landing_path ?? a.landingPath, 500),
    sourcePageUrl: cap(a.source_page_url ?? a.sourcePageUrl, 1500),
    lpSlug: cap(a.lp_slug ?? a.lpSlug, 200),
    lpVariant: cap(a.lp_variant ?? a.lpVariant, 40),
    referrer: cap(a.referrer, 1500),
    sessionId: cap(a.session_id ?? a.sessionId, 128),
    utmSource: cap(a.utm_source ?? a.utmSource, 255),
    utmMedium: cap(a.utm_medium ?? a.utmMedium, 255),
    utmCampaign: cap(a.utm_campaign ?? a.utmCampaign, 255),
    utmTerm: cap(a.utm_term ?? a.utmTerm, 255),
    utmContent: cap(a.utm_content ?? a.utmContent, 255),
    gclid: cap(a.gclid, 500),
    msclkid: cap(a.msclkid, 500),
  };
}
