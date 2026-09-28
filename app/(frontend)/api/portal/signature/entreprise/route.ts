import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { isLegalForm } from "@/modules/partner/lib/legal-forms";
import { normalizeCompanyId, signingStarted } from "@/modules/partner/lib/signing";

/**
 * POST /api/portal/signature/entreprise — le client complète les informations
 * de son entreprise (étape 1 du process de signature).
 *
 * Le partenaire peut les avoir saisies sur la fiche ; le client, lui, les
 * connaît mieux que personne. Les deux écrivent les MÊMES champs (onglet
 * « Facturation client ») : il n'y a qu'une vérité.
 *
 * Liste blanche stricte : rien d'autre que ces champs ne s'écrit d'ici — dont
 * l'identité juridique (forme, capital, RCS, représentant), qui fait l'en-tête
 * du contrat.
 * Fermé une fois le contrat signé — la facturation repose dessus, un
 * changement passe alors par l'équipe.
 */
export const dynamic = "force-dynamic";

const FIELDS = [
  "raisonSociale",
  "siren",
  "siret",
  "vatNumber",
  "billingAddress",
  "billingAddressComplement",
  "rcsCity",
  "representativeFirstName",
  "representativeLastName",
  "representativeRole",
] as const;

const MAX = 300;

export async function POST(req: Request) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { client } = ctx;
  if (!signingStarted(client as Record<string, unknown>)) {
    return NextResponse.json({ error: "not_started" }, { status: 409 });
  }
  if (client.signatureDate) {
    return NextResponse.json(
      { error: "locked", message: "Votre contrat est signé : pour modifier ces informations, écrivez-nous." },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const data: Record<string, string | null> = {};
  for (const f of FIELDS) {
    if (!(f in body)) continue;
    const v = typeof body[f] === "string" ? (body[f] as string).trim().slice(0, MAX) : "";
    data[f] = v || null;
  }

  // Un identifiant mal saisi se dit tout de suite, champ par champ : une facture
  // émise sur un SIREN faux revient, des semaines plus tard.
  if (data.siren && !normalizeCompanyId(data.siren, 9)) {
    return NextResponse.json({ error: "invalid", field: "siren", message: "Le SIREN compte 9 chiffres." }, { status: 422 });
  }
  if (data.siret && !normalizeCompanyId(data.siret, 14)) {
    return NextResponse.json({ error: "invalid", field: "siret", message: "Le SIRET compte 14 chiffres." }, { status: 422 });
  }
  if (data.siren) data.siren = normalizeCompanyId(data.siren, 9);
  if (data.siret) data.siret = normalizeCompanyId(data.siret, 14);

  // Forme sociale : une valeur de la liste, rien d'autre.
  const extra: Record<string, unknown> = {};
  if ("legalForm" in body) {
    if (body.legalForm && !isLegalForm(body.legalForm)) {
      return NextResponse.json({ error: "invalid", field: "legalForm", message: "Choisissez une forme sociale." }, { status: 422 });
    }
    extra.legalForm = body.legalForm || null;
  }
  if ("shareCapital" in body) {
    const raw = typeof body.shareCapital === "string" ? body.shareCapital.replace(/\s+/g, "").replace(",", ".") : body.shareCapital;
    const n = raw === "" || raw == null ? null : Number(raw);
    if (n != null && (!Number.isFinite(n) || n < 0)) {
      return NextResponse.json({ error: "invalid", field: "shareCapital", message: "Le capital doit être un montant." }, { status: 422 });
    }
    extra.shareCapital = n;
  }

  const payload = await payloadClient();
  try {
    await payload.update({
      collection: "partner-clients",
      id: client.id,
      data: { ...data, ...extra } as never,
      overrideAccess: true,
    });
  } catch (err) {
    payload.logger.error(`[espace-client] informations d'entreprise (client ${client.id}) non enregistrées : ${err}`);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
