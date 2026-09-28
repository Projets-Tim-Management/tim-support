import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { SIGNED_CONTRACT_STATUSES } from "@/modules/partner/lib/contract-status";
import { canSignNow } from "@/modules/partner/lib/e-signature-server";
import { SIGNING_DOC_FIELDS, signingStarted } from "@/modules/partner/lib/signing";

/**
 * POST /api/portal/signature/document — le client dépose son devis ou son
 * contrat SIGNÉ (formulaire : `kind` = devis | contrat, `file`).
 *
 * Même chemin que le logo (voir ../../logo) : un client n'a aucun droit sur la
 * bibliothèque de médias, on passe donc par ici, en `overrideAccess`, après
 * avoir vérifié la session ET le fichier. Le document est rattaché à SON
 * entreprise, celle du cookie signé.
 *
 * Déposer le fichier coche l'étape : le hook `stampSigning` de la fiche pose
 * la date, et l'étape de la mise en production s'arme — c'est elle qui prévient
 * le partenaire de la suite (voir notifyProductionStep, JourneyRuns).
 *
 * Le nom du fichier est préfixé d'un jeton aléatoire : les fichiers du CDN
 * sont accessibles par leur adresse, un nom prévisible (« contrat-signe.pdf »)
 * se devinerait.
 */
export const dynamic = "force-dynamic";

// Sous le plafond de 4,5 Mo d'une fonction Vercel : au-delà, la requête
// n'arrive même pas ici. Un scan plus lourd passe par e-mail.
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png"];

const KINDS = {
  devis: { step: "devis-signe", label: "Devis signé" },
  contrat: { step: "contrat-signe", label: "Contrat signé" },
} as const;

export async function POST(req: Request) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { client } = ctx;
  if (!signingStarted(client as Record<string, unknown>)) {
    return NextResponse.json({ error: "not_started" }, { status: 409 });
  }

  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (kind !== "devis" && kind !== "contrat") {
    return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });

  // Contrôles refaits ICI : l'attribut `accept` oriente le sélecteur, il
  // n'empêche rien.
  if (!TYPES.includes(file.type)) {
    return NextResponse.json({ error: "bad_type", message: "Déposez un PDF, ou une photo (JPEG, PNG)." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "Fichier trop lourd (4 Mo maximum). Envoyez-le-nous en réponse à notre e-mail." },
      { status: 413 },
    );
  }

  // On dépose à SON étape, et une seule fois : un document déjà signé ne se
  // remplace pas d'ici (même règle que la signature en ligne).
  if (!canSignNow(client, kind)) {
    return NextResponse.json({ error: "not_now", message: "Ce document n'est pas à déposer maintenant." }, { status: 409 });
  }
  const payload = await payloadClient();
  // Un contrat GÉNÉRÉ se signe en ligne : sa preuve (code, empreinte) et la
  // contresignature de TIM en dépendent. Un fichier déposé n'en tiendrait pas lieu.
  if (kind === "contrat") {
    const generated = await payload.count({
      collection: "client-contracts",
      where: { and: [{ client: { equals: client.id } }, { status: { in: ["envoye", ...SIGNED_CONTRACT_STATUSES] } }] },
      overrideAccess: true,
    });
    if (generated.totalDocs > 0) {
      return NextResponse.json(
        { error: "sign_online", message: "Ce contrat se signe en ligne, depuis le bouton « Signer »." },
        { status: 409 },
      );
    }
  }

  const { step, label } = KINDS[kind];
  const field = SIGNING_DOC_FIELDS[step].doc;

  try {
    const safeName = file.name.replace(/[^\w.-]+/g, "-").slice(-80) || "document";
    const media = await payload.create({
      collection: "media",
      overrideAccess: true,
      data: { alt: `${label} — ${client.companyName ?? "client"} (déposé par le client)` },
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        mimetype: file.type,
        name: `${randomBytes(8).toString("hex")}-${safeName}`,
        size: file.size,
      },
    });

    await payload.update({
      collection: "partner-clients",
      id: client.id,
      data: { [field]: media.id } as never,
      overrideAccess: true,
    });

    return NextResponse.json({ ok: true, url: media.url ?? null, filename: media.filename ?? null });
  } catch (err) {
    payload.logger.error(`[espace-client] dépôt « ${label} » (client ${client.id}) échoué : ${err}`);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
