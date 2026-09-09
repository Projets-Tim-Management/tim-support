import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";

/**
 * Aperçu d'un message du parcours, AVEC les textes en cours de saisie.
 *
 * Un aperçu qui ne montrerait que l'enregistré obligerait à sauvegarder pour
 * voir — donc à publier une formulation qu'on n'a pas encore relue. Les blocs
 * arrivent ici tels qu'ils sont tapés, et rien n'est écrit en base.
 *
 * Les valeurs sont des EXEMPLES, et le dire compte : « lundi 07 septembre » et
 * « Dupont BTP » ne sont pas ce que recevra le prochain client. C'est le rendu
 * qu'on vérifie ici — la tournure, la longueur, les variables remplacées —, pas
 * les données.
 */
export const dynamic = "force-dynamic";

type Body = { key?: string; texts?: Record<string, string> };

/**
 * Le client d'exemple. Toutes les variables ont une valeur : c'est un aperçu de
 * mise en forme, et un trou dans l'exemple ferait douter du gabarit.
 */
const EXEMPLE = {
  runId: 0,
  clientName: "Dupont BTP",
  contactFirstName: "Marie",
  partnerName: "Charlie Piancatelli",
  startDate: "2026-09-07T00:00:00.000Z",
  endDate: "2026-10-05T00:00:00.000Z",
  sessionAt: "2026-09-04T08:00:00.000Z",
  sessionModality: "en visio",
  durationWeeks: 4,
  credentialCount: 9,
  dossierDeadline: "2026-09-02T00:00:00.000Z",
  code: "123456",
};

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const template = body?.key ? JOURNEY_EMAILS[body.key] : undefined;
  if (!template) return NextResponse.json({ error: "unknown_key" }, { status: 404 });

  const mail = template({ ...EXEMPLE, texts: body?.texts ?? {} });
  return NextResponse.json({ subject: mail.subject, html: mail.html, text: mail.text });
}
