import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import type { SupportClientFacts } from "@/modules/partner/lib/billing-check";
import { checkOneClient } from "@/modules/partner/lib/billing-report";
import { isPennylaneConfigured, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Contrôle de facturation d'UNE fiche client, pour l'encart de la fiche.
 *
 * POST { id, name, siren, raisonSociale, clientStatus, paymentMethod,
 *        paymentTerms, licences }   → { fetchedAt, check }
 *
 * Le corps est l'état du FORMULAIRE, pas de la base : l'encart compare ce
 * qu'on est en train de saisir, avant même d'enregistrer. `?refresh=1` force
 * une relecture de Pennylane (sinon l'instantané en cache, une heure).
 *
 * Réservé aux admins : ce que TIM facture ne regarde pas les partenaires.
 */

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isPennylaneConfigured()) {
    return NextResponse.json(
      { error: "not_configured", message: "Connexion Pennylane non configurée (PENNYLANE_API_TOKEN)." },
      { status: 501 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const rawLic = body.licences;
  const licences: Record<string, number> = {};
  if (rawLic && typeof rawLic === "object") {
    for (const [k, v] of Object.entries(rawLic as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n)) licences[k] = n;
    }
  }

  const facts: SupportClientFacts = {
    id: (body.id as number | string) ?? "—",
    name: str(body.name) ?? "—",
    siren: str(body.siren),
    raisonSociale: str(body.raisonSociale),
    clientStatus: str(body.clientStatus),
    paymentMethod: str(body.paymentMethod),
    paymentTerms: str(body.paymentTerms),
    billingPeriod: str(body.billingPeriod),
    licences,
  };

  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    return NextResponse.json(await checkOneClient(facts, { refresh }));
  } catch (err) {
    return NextResponse.json({ error: "pennylane_error", message: pennylaneErrorMessage(err) }, { status: 502 });
  }
}
