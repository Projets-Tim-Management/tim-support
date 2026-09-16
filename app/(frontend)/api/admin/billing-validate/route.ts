import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { buildBillingReport, pennylaneStampFor, type SupportClientFacts } from "@/modules/partner/lib/billing-check";
import { monthValidation, withValidation, withoutValidation } from "@/modules/partner/lib/billing-validation";
import { buildHistoryEntry, type HistoryEntry } from "@/modules/partner/lib/history";
import { loadPennylane, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Signe (ou retire la signature d') un mois de rapprochement pour une fiche.
 *
 * POST { clientId, validated } → { ok, validation }
 *
 * Le clic sur la case « Conforme » de l'écran Rapprochement EST le geste :
 * il écrit la ligne d'historique du mois visé (la configuration de la fiche
 * telle qu'elle est, le tampon Pennylane, qui a signé et quand) — c'est elle
 * que les statistiques et la liste « à valider » liront ensuite.
 *
 * La règle est revérifiée ICI, jamais crue sur parole : on recalcule le
 * rapprochement de la fiche et on refuse de signer un mois qui a un écart
 * bloquant. Une case cochée sans cette vérification serait exactement le
 * faux « c'est bon » qu'on cherche à éviter.
 */
type Doc = {
  id: number | string;
  companyName?: string | null;
  siren?: string | null;
  raisonSociale?: string | null;
  clientStatus?: string | null;
  paymentMethod?: string | null;
  paymentTerms?: string | null;
  billingPeriod?: string | null;
  licences?: Record<string, number | null | undefined> | null;
  partner?: number | string | { id?: number | string } | null;
  history?: HistoryEntry[] | null;
};

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: number | string; validated?: boolean };
  if (body.clientId == null || typeof body.validated !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const doc = (await payload
    .findByID({ collection: "partner-clients", id: String(body.clientId), depth: 0, overrideAccess: true })
    .catch(() => null)) as Doc | null;
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (doc.clientStatus !== "actif") {
    return NextResponse.json({ error: "Seule une fiche « Gagnée » se rapproche : elle n'est pas facturée." }, { status: 400 });
  }

  const facts: SupportClientFacts = {
    id: doc.id,
    name: doc.companyName ?? "—",
    siren: doc.siren,
    raisonSociale: doc.raisonSociale,
    clientStatus: doc.clientStatus,
    paymentMethod: doc.paymentMethod,
    paymentTerms: doc.paymentTerms,
    billingPeriod: doc.billingPeriod,
    licences: doc.licences,
  };

  // Le rapprochement, recalculé : l'instantané Pennylane en cache (une heure)
  // suffit — c'est celui que l'écran vient d'afficher.
  let snap;
  try {
    snap = await loadPennylane();
  } catch (err) {
    return NextResponse.json({ error: pennylaneErrorMessage(err) }, { status: 502 });
  }
  const check = buildBillingReport([facts], snap).checks[0] ?? null;
  const now = new Date();
  const history = doc.history ?? [];
  const before = monthValidation(history, check, now);

  let next: HistoryEntry[];
  if (body.validated) {
    if (before.state === "indisponible") {
      return NextResponse.json({ error: "Aucun abonnement Pennylane vivant : rien à valider pour cette fiche." }, { status: 400 });
    }
    if (before.state === "ecart") {
      return NextResponse.json(
        { error: `Un écart bloque la validation : ${before.blockers.map((b) => b.label).join(" · ")}` },
        { status: 409 },
      );
    }
    // Le taux de commission vit sur la fiche partenaire.
    const partnerId = doc.partner && typeof doc.partner === "object" ? doc.partner.id : doc.partner;
    const partner =
      partnerId != null
        ? ((await payload
            .findByID({ collection: "partners", id: String(partnerId), depth: 0, overrideAccess: true })
            .catch(() => null)) as { commissionRate?: number | null } | null)
        : null;
    const { suggestedDiscountPct: _drop, ...entry } = buildHistoryEntry(doc.licences, Number(partner?.commissionRate) || 0);
    void _drop;
    next = withValidation(history, {
      month: before.month,
      invoiceDate: before.invoiceDate,
      entry,
      stamp: pennylaneStampFor(facts, snap),
      userId: user.id,
      at: now,
    });
  } else {
    next = withoutValidation(history, before.month);
  }

  try {
    await payload.update({
      collection: "partner-clients",
      id: doc.id,
      data: { history: next as never },
      overrideAccess: true,
      user,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // L'état relu sur ce qu'on vient d'écrire, pour que l'écran l'affiche tel quel.
  return NextResponse.json({ ok: true, validation: monthValidation(next, check, now) });
}
