import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { notifyAdminsDossierToCheck } from "@/modules/marketing/lib/notify";
import {
  findOpenRun,
  markJourneyEmailSent,
  sendJourneyEmailForClient,
} from "@/modules/marketing/lib/send";
import { PORTAL_SECTIONS } from "@/modules/marketing/lib/portal-sections";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

/**
 * POST /api/portal/dossier/submit — le client transmet son dossier.
 *
 * Le contrôle de complétude est refait ICI et pas seulement à l'écran : le
 * bouton peut être contourné, la règle non. C'est tout l'intérêt d'avoir sorti
 * le dossier d'un fichier Excel — l'erreur d'import devient impossible, au lieu
 * d'être signalée par une note en rouge.
 */
export async function POST() {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const payload = await payloadClient();

  const counts = await Promise.all(
    PORTAL_SECTIONS.map(async (section) => ({
      section,
      total: (
        await payload.count({
          collection: section.collection as "client-employees",
          where: { client: { equals: ctx.client.id } },
          overrideAccess: true,
        })
      ).totalDocs,
    })),
  );

  const missing = counts.filter(({ section, total }) => section.min > 0 && total < section.min);
  if (missing.length) {
    return NextResponse.json(
      { error: "incomplete", sections: missing.map(({ section }) => section.label) },
      { status: 422 },
    );
  }

  // La transmission EST l'étape « Dossier de démarrage complété » : c'est le
  // passage à « Transmis » qui l'arme, par le hook de la fiche client. Un admin
  // à qui le client remet son dossier autrement (téléphone, e-mail) fait donc le
  // même geste au même endroit, et le parcours avance pareil.
  await payload.update({
    collection: "partner-clients",
    id: ctx.client.id,
    data: { onboardingStatus: "transmis", onboardingSubmittedAt: new Date().toISOString() },
    overrideAccess: true,
  });

  // Accusé de réception au client. Sans lui, il vient de saisir des dizaines de
  // lignes et n'a aucune confirmation que c'est bien arrivé. L'échec d'envoi ne
  // remet PAS en cause la transmission : elle est déjà enregistrée.
  await sendJourneyEmailForClient(payload, ctx.client.id, "dossier-recu");

  // Pendant du précédent, côté TIM : le dossier attend un contrôle avant que les
  // comptes soient créés. L'envoi était déclaré dans le modèle (l'enveloppe
  // s'affiche sur l'étape) mais aucun code ne le déclenchait — il n'était donc
  // jamais parti.
  const run = await findOpenRun(payload, ctx.client.id);
  if (run) {
    await notifyAdminsDossierToCheck(payload, run, {
      clientId: ctx.client.id,
      clientName: ctx.client.companyName ?? null,
    });
    await markJourneyEmailSent(payload, run.id, "dossier-a-verifier");
  }

  return NextResponse.json({ ok: true });
}
