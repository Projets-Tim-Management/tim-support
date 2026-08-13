import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";

/**
 * E-mail du code de connexion à l'espace client.
 *
 * Fichier séparé pour éviter un cycle d'import : `portal-auth` est utilisé par
 * des routes qui n'ont pas besoin de toute la bibliothèque de gabarits.
 */
export const codeEmail = (code: string, companyName?: string | null) =>
  JOURNEY_EMAILS["code-connexion"]({ code, clientName: companyName });
