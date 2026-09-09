import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { CLOSED_STATUSES } from "@/modules/marketing/lib/due-emails";
import { isClientDecision } from "@/modules/marketing/lib/journey";
import { readRunToken } from "@/modules/marketing/lib/run-token";

/**
 * La décision de fin de test, prise depuis l'e-mail.
 *
 * POST { token, decision } — le jeton signé DÉCIDE du parcours, jamais un
 * identifiant reçu. Aucune session n'est demandée : le lien est cliqué depuis
 * une boîte mail, souvent sur un téléphone, par quelqu'un qui n'a pas ouvert son
 * espace client depuis trois semaines.
 *
 * L'écriture ne se fait QU'EN POST, jamais à l'ouverture du lien. Les cinq
 * visages de « Comment ça se passe ? », eux, s'enregistrent au clic : une note
 * posée par erreur se corrige en un geste. Une décision, non — elle déclenche un
 * devis, ou clôt une relation commerciale. Certains filtres de messagerie
 * visitent les liens d'un message avant son destinataire : ils ouvriraient donc
 * la page, mais ne peuvent rien décider.
 *
 * L'étape « Décision du client » est cochée dans la foulée : ici, le clic EST le
 * geste attendu. C'est elle qui prévient TIM qu'un devis est à rédiger.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { token?: string; decision?: string }
    | null;

  const runId = readRunToken("decision", body?.token);
  if (!runId) return NextResponse.json({ error: "invalid_token" }, { status: 403 });
  if (!isClientDecision(body?.decision)) {
    return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
  }
  const decision = body!.decision as string;

  const payload = await payloadClient();
  const run = (await payload
    .findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true })
    .catch(() => null)) as
    | { id: number | string; status?: string; steps?: { key?: string | null }[] }
    | null;
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (run.status && CLOSED_STATUSES.includes(run.status)) {
    return NextResponse.json({ error: "closed" }, { status: 409 });
  }

  const now = new Date().toISOString();
  try {
    await payload.update({
      collection: "journey-runs",
      id: runId,
      data: {
        decision,
        decisionAt: now,
        /**
         * L'étape passe à « fait », pas en attente : le délai de grâce sert aux
         * faits que le LOGICIEL constate et qu'on peut vouloir annuler. Ici
         * c'est le client qui déclare, et sa déclaration vaut tout de suite —
         * c'est aussi ce qui déclenche l'alerte « devis à rédiger ».
         */
        steps: (run.steps ?? []).map((s) =>
          s.key === "decision" ? { ...s, state: "fait", doneAt: now } : s,
        ),
      } as never,
      overrideAccess: true,
    });
  } catch (err) {
    payload.logger.error(`[décision] enregistrement sur le parcours ${runId} échoué : ${err}`);
    return NextResponse.json({ error: "save_failed" }, { status: 502 });
  }

  payload.logger.info(`[décision] parcours ${runId} : « ${decision} », décidé par le client.`);
  return NextResponse.json({ ok: true, decision });
}
