import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { resolveChannel } from "@/modules/forms/lib/channel";
import { createOpportunity } from "@/modules/forms/lib/create-opportunity";
import { sendLeadEmails } from "@/modules/forms/lib/send-lead-emails";
import { checkIngestKey, clientIp, parseAttribution } from "@/modules/forms/lib/ingest";
import { toPublicForm } from "@/modules/forms/lib/public-schema";
import { buildOpportunity } from "@/modules/forms/lib/to-opportunity";
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

/**
 * Débit maximal par adresse et par heure.
 *
 * Généreux, et réglable sans déploiement : une adresse de sortie est souvent
 * partagée — réseau d'entreprise, et surtout opérateurs mobiles, où des milliers
 * d'abonnés sortent par la même IP. Refuser un vrai lead coûte plus cher
 * qu'accepter quelques envois de trop, et le secret partagé plus le leurre
 * filtrent déjà l'essentiel.
 */
const MAX_PER_IP_PER_HOUR = Number(process.env.FORMS_MAX_PER_IP_PER_HOUR) || 20;

/**
 * Plafond quand l'adresse n'est PAS celle du visiteur mais celle du proxy —
 * c'est-à-dire quand la vitrine n'a pas posé `X-Visitor-IP`.
 *
 * Beaucoup plus haut, parce que ce compteur additionne alors tous les visiteurs
 * du site : le serrer bloquerait de vrais leads sans rien empêcher. Il ne borne
 * plus qu'un déluge, et l'anomalie est journalisée à chaque envoi.
 */
const MAX_SHARED_PER_HOUR = Number(process.env.FORMS_MAX_SHARED_PER_HOUR) || 200;
const HOUR_MS = 60 * 60 * 1000;

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

/** Suite donnée à une soumission. Jamais bloquant : le lead est déjà en base. */
async function markSubmission(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  id: number | string,
  data: Record<string, unknown>,
): Promise<void> {
  await payload
    .update({ collection: "form-submissions", id, data: data as never, overrideAccess: true })
    .catch((e) => payload.logger.error(`[formulaires] marquage de ${id} échoué : ${e}`));
}

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

    const { ip, trusted } = clientIp(req);
    if (ip) {
      if (!trusted) {
        // Doit se voir : sans cet en-tête, le compteur mélange tous les
        // visiteurs et la protection par adresse ne veut plus rien dire.
        payload.logger.error(
          `[formulaires] adresse du visiteur absente (en-tête X-Visitor-IP) : le débit est compté sur ${ip}, commune à tout le site.`,
        );
      }
      const since = new Date(Date.now() - HOUR_MS).toISOString();
      const recent = await payload.count({
        collection: "form-submissions",
        where: { ip: { equals: ip }, createdAt: { greater_than: since } },
        overrideAccess: true,
      });
      if (recent.totalDocs >= (trusted ? MAX_PER_IP_PER_HOUR : MAX_SHARED_PER_HOUR)) {
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

    const submission = await payload.create({
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

    /**
     * L'opportunité, dans la foulée — c'est ce qui remplace le cron quotidien.
     *
     * Enveloppé : la soumission EST enregistrée, et un échec ici ne doit ni
     * répondre une erreur au visiteur, ni perdre le lead. Il est inscrit sur la
     * soumission, où quelqu'un peut le voir et rattraper la fiche à la main.
     */
    try {
      const opportunity = buildOpportunity({ form, answers: result.answers, attribution, channel });
      const outcome = await createOpportunity(payload, opportunity, submission.id);

      if (outcome.status === "echec") {
        payload.logger.error(`[formulaires] opportunité non créée (${submissionId}) : ${outcome.error}`);
        await markSubmission(payload, submission.id, { processingStatus: "echec", processingError: outcome.error });
      } else {
        const status = outcome.status === "rattachee" ? "opportunite" : outcome.status;
        await markSubmission(payload, submission.id, { processingStatus: status, client: outcome.clientId });
        payload.logger.info(
          `[formulaires] ${outcome.status === "rattachee" ? "soumission rattachée à" : "opportunité"} ${outcome.clientId} (${submissionId}).`,
        );
      }

      // Les deux e-mails. Après l'opportunité, pour que l'alerte interne porte le
      // lien vers la fiche — et jamais bloquants : un relais SMTP qui tousse ne
      // doit pas faire disparaître un lead déjà enregistré.
      await sendLeadEmails(payload, {
        form,
        answers: result.answers,
        attribution,
        channel,
        clientId: outcome.status === "echec" ? undefined : outcome.clientId,
        brouillon: outcome.status === "brouillon",
      });
    } catch (e) {
      const error = (e as Error).message;
      payload.logger.error(`[formulaires] opportunité non créée (${submissionId}) : ${error}`);
      await markSubmission(payload, submission.id, { processingStatus: "echec", processingError: error });
    }

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
