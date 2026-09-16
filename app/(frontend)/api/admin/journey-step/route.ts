import { NextResponse } from "next/server";
import type { JourneyRun } from "@/payload-types";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";

/**
 * Coche (ou rouvre) UNE étape d'un parcours, depuis un autre écran que sa fiche.
 *
 * POST { runId, key, done } → { ok, state }
 *
 * POURQUOI UNE ROUTE. L'agenda du tableau de bord affiche désormais les étapes
 * qui attendent le partenaire (relevés d'usage, bilan) à côté des tâches, et
 * elles se cochent au même endroit. Mais les étapes vivent dans un TABLEAU sur
 * le parcours : un PATCH direct sur `steps` remplacerait tout le tableau, et le
 * client n'a pas — ne doit pas avoir — les 20 lignes sous la main pour ça.
 *
 * On écrit donc ici EXACTEMENT ce que la fiche écrit quand on clique une étape
 * (JourneyStepper.setStep) : l'état, la date, l'auteur — rien d'autre. Et on
 * passe par la collection avec l'utilisateur de la requête, pour que ses
 * garde-fous s'appliquent tels quels : une étape réservée à TIM, ou qui se
 * coche toute seule, est refusée ici comme là-bas. Une seule case, deux écrans,
 * une seule règle.
 */
export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    runId?: number | string;
    key?: string;
    done?: boolean;
  };
  if (body.runId == null || !body.key || typeof body.done !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const run = (await payload
    .findByID({ collection: "journey-runs", id: String(body.runId), depth: 0, overrideAccess: true })
    .catch(() => null)) as JourneyRun | null;
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const own = partnerIdOf(user);
  const partnerId =
    run.partner && typeof run.partner === "object" ? (run.partner as { id?: unknown }).id : run.partner;
  const allowed =
    hasAdminRole(user) || (isPartnerMetier(user) && String(own) === String(partnerId ?? ""));
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const steps = run.steps ?? [];
  if (!steps.some((s) => s.key === body.key)) {
    return NextResponse.json({ error: "step_not_found" }, { status: 404 });
  }

  const state = body.done ? ("fait" as const) : ("a-faire" as const);
  const next = steps.map((s) =>
    s.key === body.key
      ? {
          ...s,
          state,
          doneAt: body.done ? new Date().toISOString() : null,
          doneBy: body.done ? (user.id as number) : null,
        }
      : s,
  );

  try {
    await payload.update({
      collection: "journey-runs",
      id: run.id,
      data: { steps: next },
      // Avec l'utilisateur, SANS contournement : ce sont les hooks et les
      // droits de la collection qui décident, pas cette route.
      user,
      overrideAccess: false,
    });
  } catch (e) {
    // Le message du garde-fou dit pourquoi (« réservée à l'équipe TIM »…) :
    // on le rend tel quel, c'est celui que la fiche afficherait.
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, state });
}
