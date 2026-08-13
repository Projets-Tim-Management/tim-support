import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { armAutoStep } from "@/modules/marketing/lib/auto-steps";
import { sendJourneyEmailForClient } from "@/modules/marketing/lib/send";
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

  await payload.update({
    collection: "partner-clients",
    id: ctx.client.id,
    data: { onboardingStatus: "transmis", onboardingSubmittedAt: new Date().toISOString() },
    overrideAccess: true,
  });

  // La transmission EST l'étape « Dossier de démarrage complété ».
  await armAutoStep(payload, ctx.client.id, "dossier-demarrage");

  // Accusé de réception au client. Sans lui, il vient de saisir des dizaines de
  // lignes et n'a aucune confirmation que c'est bien arrivé. L'échec d'envoi ne
  // remet PAS en cause la transmission : elle est déjà enregistrée.
  await sendJourneyEmailForClient(payload, ctx.client.id, "dossier-recu");

  return NextResponse.json({ ok: true });
}
