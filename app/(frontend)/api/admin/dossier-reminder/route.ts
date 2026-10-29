import { NextResponse } from "next/server";

import { authorizeClient } from "@/modules/partner/lib/client-access";
import { readEmailTexts } from "@/modules/marketing/lib/email-overrides";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { buildJourneyContext } from "@/modules/marketing/lib/journey-context";
import { missingOnly } from "@/modules/marketing/lib/licence-gaps";
import { journeyReplyTo } from "@/modules/marketing/lib/reply-routing";
import { findOpenRun } from "@/modules/marketing/lib/send";
import { journeyMailHeaders } from "@/modules/support/lib/brevo";

/**
 * Relancer un prospect en phase de test sur son dossier de démarrage — en
 * particulier sur les UTILISATEURS qu'il n'a pas encore déclarés.
 *
 * GET  ?clientId=…                    → licences prévues / déclarées, relance
 *                                        possible ou non (et pourquoi),
 *                                        relances déjà faites
 * POST { clientId, note, preview }    → `preview` : l'e-mail tel qu'il
 *                                        partira ; sinon l'envoie et le trace
 *
 * Le message est celui du parcours, « Votre dossier de démarrage nous manque »
 * (relance-dossier) : mêmes textes, mêmes reprises faites dans le modèle. Il
 * chiffre ce qui manque — « 18 compagnons (2 déclarés sur 20) » — et mène droit
 * au tableau des utilisateurs.
 *
 * À LA MAIN et quand on veut, en plus de la relance automatique de J−3 : ce
 * geste-ci ne marque pas la ligne du parcours, qui partira donc quand même à
 * sa date si le dossier n'est toujours pas transmis.
 *
 * Comme les messages du parcours, la réponse du client revient dans le
 * logiciel, rattachée à la phase de test (Reply-To du parcours).
 */
export const dynamic = "force-dynamic";

/** Marque des relances manuelles dans l'historique (voir signing-reminder). */
const STEP = "relance-dossier-manuelle";
/** Un double clic n'envoie pas deux relances. */
const MIN_GAP_MS = 2 * 60 * 1000;
const MAX_NOTE = 2_000;

type ClientDoc = Record<string, unknown> & { id: number | string; partner?: unknown; onboardingStatus?: string | null };

const authorize = (req: Request, clientId: unknown) => authorizeClient<ClientDoc>(req, clientId);

type Ctx = Exclude<Awaited<ReturnType<typeof authorize>>, { error: unknown }>;

/** Tout ce qu'il faut pour décider, prévisualiser et envoyer. */
async function prepare(ctx: Ctx) {
  const run = await findOpenRun(ctx.payload, ctx.client.id);
  const account = (
    await ctx.payload.find({
      collection: "client-portal-accounts",
      where: { client: { equals: ctx.client.id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0] as { email?: string; active?: boolean } | undefined;
  const journey = run ? await buildJourneyContext(ctx.payload, run, undefined, { licenceGaps: true }) : null;

  const reminders = (
    await ctx.payload.find({
      collection: "client-activities",
      where: { and: [{ client: { equals: ctx.client.id } }, { journeyStep: { equals: STEP } }] },
      sort: "-occurredAt",
      limit: 20,
      depth: 1,
      overrideAccess: true,
    })
  ).docs.map((d) => {
    const a = (d as { author?: unknown }).author;
    const by = a && typeof a === "object" ? (a as { firstName?: string; email?: string }) : null;
    return { at: (d as { occurredAt?: string }).occurredAt ?? "", by: by?.firstName || by?.email || null };
  });

  // La raison, dite comme on la dirait au partenaire.
  const reason = !run
    ? "Aucune phase de test en cours sur cette fiche."
    : ctx.client.onboardingStatus === "valide"
      ? "Le dossier est déjà vérifié par TIM."
      : !account?.email || account.active === false
        ? "Ouvrez d'abord l'accès du client à son espace : c'est là qu'il remplit son dossier."
        : null;

  return { run, account, journey, reminders, reason };
}

export async function GET(req: Request) {
  const ctx = await authorize(req, new URL(req.url).searchParams.get("clientId"));
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });
  const { journey, reminders, reason } = await prepare(ctx);
  const gaps = journey?.ctx.licenceGaps ?? [];
  return NextResponse.json({
    available: reason === null,
    reason,
    gaps,
    missing: missingOnly(gaps).reduce((n, g) => n + g.missing, 0),
    reminders,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    clientId?: number | string;
    note?: unknown;
    preview?: boolean;
  } | null;
  const ctx = await authorize(req, body?.clientId);
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });
  const note = String(body?.note ?? "").slice(0, MAX_NOTE).trim();

  const { run, account, journey, reminders, reason } = await prepare(ctx);
  if (reason || !run || !journey || !account?.email) {
    return NextResponse.json({ error: "unavailable", message: reason }, { status: 409 });
  }

  const texts = await readEmailTexts(ctx.payload, (run as { journey?: unknown }).journey, "relance-dossier");
  const built = JOURNEY_EMAILS["relance-dossier"]({ ...journey.ctx, texts, personalNote: note || null });
  // L'adresse de l'espace client, comme le reste du parcours : c'est avec elle
  // qu'il se connecte pour remplir le tableau.
  const to = account.email;

  if (body?.preview) return NextResponse.json({ to, subject: built.subject, html: built.html });

  const last = reminders[0]?.at ? Date.parse(reminders[0].at) : 0;
  if (Date.now() - last < MIN_GAP_MS) {
    return NextResponse.json({ error: "too_soon", message: "Une relance vient de partir." }, { status: 429 });
  }

  const replyTo = journeyReplyTo(run.id);
  try {
    await ctx.payload.sendEmail({
      to,
      subject: built.subject,
      html: built.html,
      text: built.text,
      ...(replyTo ? { replyTo } : {}),
      // Retrouvé dans l'onglet « E-mails » de la phase de test, avec son sort.
      ...journeyMailHeaders(run.id),
    });
  } catch (e) {
    ctx.payload.logger.error(`[parcours] relance du dossier vers ${to} non partie : ${e}`);
    return NextResponse.json({ error: "send_failed", message: "La relance n'a pas pu être envoyée." }, { status: 502 });
  }

  // Envoyé d'abord, tracé ensuite : une trace sans envoi ferait croire à une
  // relance que le client n'a jamais reçue.
  const gaps = missingOnly(journey.ctx.licenceGaps ?? []);
  try {
    await ctx.payload.create({
      collection: "client-activities",
      data: {
        client: ctx.client.id as number,
        type: "email",
        title: built.subject,
        content: [
          "Relance du dossier de démarrage.",
          gaps.length ? `Manquait : ${gaps.map((g) => `${g.missing} ${g.label.toLowerCase()} (${g.declared}/${g.expected})`).join(", ")}.` : "",
          note,
        ]
          .filter(Boolean)
          .join("\n"),
        recipients: to,
        journeyStep: STEP,
        occurredAt: new Date().toISOString(),
        author: ctx.user.id,
      } as never,
      overrideAccess: true,
    });
  } catch (e) {
    ctx.payload.logger.error(`[parcours] relance du dossier envoyée mais non tracée (client ${ctx.client.id}) : ${e}`);
    return NextResponse.json({ ok: true, email: to, logged: false });
  }
  return NextResponse.json({ ok: true, email: to });
}
