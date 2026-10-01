import { payloadClient } from "@/core/payload-client";
import { trainingRefId } from "@/modules/training/collections/trainingOwned";
import { TRAINING_EMAILS } from "@/modules/training/lib/email-schedule";
import { TRAINING_EMAIL_BUILDERS } from "@/modules/training/lib/emails";
import { daySlots, loadDay, mailContext, recipientsFor, type Recipient } from "@/modules/training/lib/send";

import { trainingAccess } from "../access";

/**
 * Aperçu d'un envoi de la formation, tel qu'il partira : les MÊMES fonctions
 * que l'envoi réel, sur les vraies données de la journée.
 *
 * GET ?dayId=…&key=…[&email=…] → le HTML du message (pour l'iframe d'aperçu),
 * pour le destinataire demandé ou le premier.
 */
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dayId = url.searchParams.get("dayId");
  const key = url.searchParams.get("key");
  const email = url.searchParams.get("email")?.toLowerCase();
  if (!dayId || !key || !TRAINING_EMAILS.some((e) => e.key === key)) return html("Requête incomplète.", 400);

  const payload = await payloadClient();
  const b = await loadDay(payload, dayId);
  if (!b) return html("Journée introuvable.", 404);
  const trainingId = trainingRefId(b.day.training);
  const access = await trainingAccess(payload, req.headers, trainingId as number | string);
  if (!access.ok) return html("Accès refusé.", access.status);
  if (!b.day.date) return html("<p style='font-family:sans-serif'>Datez la journée pour voir ce message.</p>");

  const all = recipientsFor(key, b);
  // Personne encore (présents avant l'émargement, formateur non désigné) :
  // aperçu avec tous les créneaux, pour juger du texte quand même.
  const fallback: Recipient = {
    email: "exemple@client.fr",
    name: "Exemple",
    firstName: null,
    slots: daySlots(b),
  };
  const r = (email && all.find((x) => x.email.toLowerCase() === email)) || all[0] || fallback;
  const built = TRAINING_EMAIL_BUILDERS[key](mailContext(key, b, r));
  return html(built.html);
}
