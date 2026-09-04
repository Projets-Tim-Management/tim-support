import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { resolveChannel } from "@/modules/forms/lib/channel";
import { checkIngestKey, clientIp, parseAttribution } from "@/modules/forms/lib/ingest";
import { toPublicForm } from "@/modules/forms/lib/public-schema";
import { honeypotTripped, validateAnswers } from "@/modules/forms/lib/validate";

/**
 * POST /api/forms/<formId>/submissions — l'entrée des leads du site vitrine.
 *
 * Appelé par le proxy serveur de la vitrine, jamais par un navigateur : secret
 * partagé plutôt que CORS, et IP/navigateur relayés par en-tête.
 *
 * La réponse ne contient JAMAIS de donnée personnelle : la vitrine la pousse
 * telle quelle dans le dataLayer de GA4.
 */

export const dynamic = "force-dynamic";

/** Généreux : plusieurs personnes partagent souvent une adresse de sortie. */
const MAX_PER_IP_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request, { params }: { params: Promise<{ formId: string }> }) {
  const key = checkIngestKey(req);
  if (!key.ok) {
    if (key.reason === "misconfigured") {
      // Notre faute, et elle doit se voir : sinon un déploiement sans secret
      // refuserait tous les leads en silence.
      console.error(
        "[formulaires] FORMS_INGEST_SECRET absent en production : soumissions refusées.",
      );
      return fail("server_error", 503);
    }
    return fail("unauthorized", 401);
  }

  const formId = (await params).formId?.trim();
  if (!formId) return fail("unknown_form", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_body", 400);
  }
  const payloadBody = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  try {
    const payload = await payloadClient();

    const found = await payload.find({
      collection: "forms",
      where: { formId: { equals: formId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const doc = found.docs[0] as Parameters<typeof toPublicForm>[0];
    const form = toPublicForm(doc);
    if (!form) return fail("unknown_form", 404);

    // Le leurre avant tout le reste. Réponse de succès ordinaire : signaler au
    // robot qu'il est repéré l'inviterait à revenir en le contournant.
    if (honeypotTripped(form, payloadBody.answers ?? payloadBody)) {
      return NextResponse.json(
        { ok: true, submission_id: randomUUID() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = validateAnswers(form, payloadBody.answers ?? payloadBody);
    if (!result.ok) return fail("validation_error", 400, { errors: result.errors });

    const ip = clientIp(req);
    if (ip) {
      const since = new Date(Date.now() - HOUR_MS).toISOString();
      const recent = await payload.count({
        collection: "form-submissions",
        where: { ip: { equals: ip }, createdAt: { greater_than: since } },
        overrideAccess: true,
      });
      if (recent.totalDocs >= MAX_PER_IP_PER_HOUR) {
        payload.logger.warn(`[formulaires] débit dépassé pour ${ip} sur « ${formId} ».`);
        return fail("rate_limited", 429);
      }
    }

    // Seul signal qu'une bascule est incomplète côté vitrine.
    if (result.extras.length) {
      payload.logger.warn(
        `[formulaires] champs hors schéma sur « ${formId} » : ${result.extras.join(", ")}.`,
      );
    }

    const attribution = parseAttribution(payloadBody.attribution);
    const { channel, source: channelSource } = resolveChannel(
      attribution,
      doc?.defaultChannel ?? "seo",
    );
    const submissionId = randomUUID();

    await payload.create({
      collection: "form-submissions",
      data: {
        submissionId,
        form: doc?.id as never,
        formIdSnapshot: form.formId,
        answers: result.answers,
        ...attribution,
        channel,
        channelSource,
        ip,
        userAgent: req.headers.get("user-agent")?.slice(0, 512) ?? undefined,
        processingStatus: "recue",
      } as never,
      overrideAccess: true,
    });

    payload.logger.info(
      `[formulaires] soumission « ${form.formId} » reçue (${submissionId}) depuis ${
        attribution.sourcePagePath ?? "page inconnue"
      }.`,
    );

    return NextResponse.json(
      { ok: true, submission_id: submissionId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Jamais le corps dans le journal : il porte les coordonnées d'une personne.
    console.error(`[formulaires] soumission « ${formId} » perdue :`, err);
    return fail("server_error", 503);
  }
}
