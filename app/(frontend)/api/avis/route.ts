import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { CLOSED_STATUSES } from "@/modules/marketing/lib/due-emails";
import {
  isSatisfactionLevel,
  readSatisfactionToken,
} from "@/modules/marketing/lib/satisfaction";

/**
 * La réponse du client à « Comment ça se passe ? », enregistrée sur le parcours.
 *
 * POST { token, note?, comment? } — le jeton signé DÉCIDE du parcours, jamais un
 * identifiant reçu : sans ça, on noterait n'importe quel client en devinant un
 * numéro. Aucune session n'est demandée, et c'est voulu : le lien est cliqué
 * depuis une boîte mail, souvent sur un téléphone, par quelqu'un qui n'a pas
 * ouvert son espace client depuis trois semaines.
 *
 * Une réponse REMPLACE la précédente : on veut l'avis d'aujourd'hui, pas
 * l'historique des clics. Et un parcours clos n'accepte plus rien — la question
 * ne se pose plus, et laisser écrire dessus rouvrirait un dossier tranché.
 */
export const dynamic = "force-dynamic";

type Body = { token?: string; note?: number; comment?: string };

/** Un mot, pas une dissertation : au-delà, c'est du collage ou une erreur. */
const MAX_COMMENT = 2000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const runId = readSatisfactionToken(body?.token);
  if (!runId) return NextResponse.json({ error: "invalid_token" }, { status: 403 });

  const hasNote = body?.note != null;
  if (hasNote && !isSatisfactionLevel(body?.note)) {
    return NextResponse.json({ error: "invalid_note" }, { status: 400 });
  }
  const comment = typeof body?.comment === "string" ? body.comment.trim() : null;
  if (comment && comment.length > MAX_COMMENT) {
    return NextResponse.json({ error: "too_long" }, { status: 400 });
  }
  if (!hasNote && comment == null) {
    return NextResponse.json({ error: "nothing_to_save" }, { status: 400 });
  }

  const payload = await payloadClient();
  const run = (await payload
    .findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: number | string; status?: string } | null;
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (run.status && CLOSED_STATUSES.includes(run.status)) {
    return NextResponse.json({ error: "closed" }, { status: 409 });
  }

  try {
    await payload.update({
      collection: "journey-runs",
      id: runId,
      data: {
        ...(hasNote ? { satisfaction: body!.note, satisfactionAt: new Date().toISOString() } : {}),
        ...(comment != null ? { satisfactionComment: comment || null } : {}),
      } as never,
      overrideAccess: true,
    });
  } catch (err) {
    payload.logger.error(`[avis] enregistrement sur le parcours ${runId} échoué : ${err}`);
    return NextResponse.json({ error: "save_failed" }, { status: 502 });
  }

  payload.logger.info(
    `[avis] parcours ${runId} : note ${hasNote ? body!.note : "inchangée"}${comment ? ", avec un mot" : ""}.`,
  );
  return NextResponse.json({ ok: true });
}
