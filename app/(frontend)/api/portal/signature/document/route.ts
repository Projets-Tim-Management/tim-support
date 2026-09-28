import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

import { afterResponse } from "@/core/lib/after-response";
import { payloadClient } from "@/core/payload-client";
import { notifySigningDeposit } from "@/modules/marketing/lib/notify";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
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
 * la date. Le partenaire et TIM sont prévenus — la suite est de leur côté.
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

  const { step, label } = KINDS[kind];
  const field = SIGNING_DOC_FIELDS[step].doc;
  const payload = await payloadClient();

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

    // Le partenaire de la fiche, pour lui adresser l'alerte.
    const fresh = (await payload
      .findByID({ collection: "partner-clients", id: client.id, depth: 1, overrideAccess: true })
      .catch(() => null)) as { partner?: { displayName?: string; email?: string } | null } | null;
    const partner = fresh?.partner && typeof fresh.partner === "object" ? fresh.partner : null;

    afterResponse(() =>
      notifySigningDeposit(
        payload,
        {
          clientId: client.id,
          clientName: client.companyName ?? null,
          partnerName: partner?.displayName ?? null,
          what: step,
        },
        partner?.email ?? null,
      ),
    );

    return NextResponse.json({ ok: true, url: media.url ?? null, filename: media.filename ?? null });
  } catch (err) {
    payload.logger.error(`[espace-client] dépôt « ${label} » (client ${client.id}) échoué : ${err}`);
    return NextResponse.json({ error: "upload_failed" }, { status: 500 });
  }
}
