import { NextResponse } from "next/server";

import { authorizeClient } from "@/modules/partner/lib/client-access";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { SIGNABLE, isSignableKind, type SignableKind } from "@/modules/partner/lib/e-signature";
import { SIGNING_DOC_FIELDS } from "@/modules/partner/lib/signing";
import { templateTexts } from "@/modules/partner/lib/signing-access";

/**
 * Relancer le client sur un devis ou un contrat qu'il n'a pas encore signé.
 *
 * GET  ?clientId=…                          → pour chaque document : relance
 *                                              possible ou non (et pourquoi),
 *                                              relances déjà faites
 * POST { clientId, kind, note, preview }    → `preview` : l'e-mail tel qu'il
 *                                              partira, sans rien envoyer ;
 *                                              sinon l'envoie, puis le trace
 *
 * Un geste À LA MAIN, toujours après aperçu : c'est la personne qui suit
 * l'affaire qui sait si le client réfléchit, attend un accord interne ou a
 * simplement oublié. Rien ne part tout seul.
 *
 * Seulement pour un document DÉPOSÉ dans l'espace du client, accès ouvert : le
 * message l'invite à signer en ligne. Un devis passé en pièce jointe se relance
 * depuis sa messagerie, dans le fil où il est parti.
 *
 * Ouvert au partenaire qui suit la fiche, comme l'invitation (voir
 * signing-invite) : c'est lui qui porte le process de signature.
 *
 * La réponse du client revient à la personne qui relance (Reply-To) : le
 * message l'invite à poser ses questions en répondant.
 */
export const dynamic = "force-dynamic";

/**
 * Marque des relances dans l'historique (`journeyStep` des activités). Hors
 * parcours — aucune `journeyRun` — donc sans effet sur la synchro des tâches.
 */
const STEP: Record<SignableKind, string> = { devis: "relance-devis", contrat: "relance-contrat" };

/** Les champs de date de chaque document, repris du process de signature. */
const DATES: Record<SignableKind, { sent: string; signed: string }> = {
  devis: { sent: SIGNING_DOC_FIELDS["devis-envoye"].date, signed: SIGNING_DOC_FIELDS["devis-signe"].date },
  contrat: { sent: SIGNING_DOC_FIELDS["contrat-envoye"].date, signed: SIGNING_DOC_FIELDS["contrat-signe"].date },
};

/** Un double clic n'envoie pas deux relances. */
const MIN_GAP_MS = 2 * 60 * 1000;
const MAX_NOTE = 2_000;

type ClientDoc = Record<string, unknown> & { id: number | string; partner?: unknown; companyName?: string | null };
type Account = { email?: string; firstName?: string | null; active?: boolean };
type Reminder = { at: string; by: string | null };
type KindState = { available: boolean; reason: string | null; sentAt: string | null; reminders: Reminder[] };

const filled = (v: unknown) => v != null && v !== "";

const authorize = (req: Request, clientId: unknown) => authorizeClient<ClientDoc>(req, clientId);

type Ctx = Exclude<Awaited<ReturnType<typeof authorize>>, { error: unknown }>;

async function accountOf(ctx: Ctx): Promise<Account | null> {
  const res = await ctx.payload.find({
    collection: "client-portal-accounts",
    where: { client: { equals: ctx.client.id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (res.docs[0] as Account | undefined) ?? null;
}

async function remindersOf(ctx: Ctx, kind: SignableKind): Promise<Reminder[]> {
  const res = await ctx.payload.find({
    collection: "client-activities",
    where: { and: [{ client: { equals: ctx.client.id } }, { journeyStep: { equals: STEP[kind] } }] },
    sort: "-occurredAt",
    limit: 20,
    depth: 1,
    overrideAccess: true,
  });
  return (res.docs as { occurredAt?: string; author?: unknown }[]).map((d) => {
    const a = d.author && typeof d.author === "object" ? (d.author as { firstName?: string; email?: string }) : null;
    return { at: d.occurredAt ?? "", by: a?.firstName || a?.email || null };
  });
}

/** Relance possible ? Sinon, la raison, dite comme on la dirait au client. */
function stateOf(client: ClientDoc, account: Account | null, kind: SignableKind, reminders: Reminder[]): KindState {
  const { noun } = SIGNABLE[kind];
  const sentAt = (client[DATES[kind].sent] as string | null) ?? null;
  const base = { sentAt, reminders };
  if (filled(client[SIGNABLE[kind].signed]) || filled(client[DATES[kind].signed])) {
    return { ...base, available: false, reason: `Le ${noun} est signé.` };
  }
  if (!filled(client[SIGNABLE[kind].original])) {
    return {
      ...base,
      available: false,
      reason: `Le ${noun} n'est pas dans l'espace du client : relancez-le depuis votre messagerie.`,
    };
  }
  if (!account?.email || account.active === false) {
    return { ...base, available: false, reason: "Ouvrez d'abord l'accès du client à son espace." };
  }
  return { ...base, available: true, reason: null };
}

export async function GET(req: Request) {
  const ctx = await authorize(req, new URL(req.url).searchParams.get("clientId"));
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });
  const account = await accountOf(ctx);
  const [devis, contrat] = await Promise.all([remindersOf(ctx, "devis"), remindersOf(ctx, "contrat")]);
  return NextResponse.json({
    devis: stateOf(ctx.client, account, "devis", devis),
    contrat: stateOf(ctx.client, account, "contrat", contrat),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    clientId?: number | string;
    kind?: unknown;
    note?: unknown;
    preview?: boolean;
  } | null;
  const ctx = await authorize(req, body?.clientId);
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });
  if (!isSignableKind(body?.kind)) return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  const kind = body.kind;
  const note = String(body.note ?? "").slice(0, MAX_NOTE).trim();

  const account = await accountOf(ctx);
  const reminders = await remindersOf(ctx, kind);
  const state = stateOf(ctx.client, account, kind, reminders);
  if (!state.available || !account?.email) {
    return NextResponse.json({ error: "unavailable", message: state.reason }, { status: 409 });
  }

  const built = JOURNEY_EMAILS["relance-signature"]({
    clientName: ctx.client.companyName ?? null,
    contactFirstName: account.firstName ?? null,
    documentNoun: SIGNABLE[kind].noun,
    documentSentAt: state.sentAt,
    personalNote: note || null,
    texts: await templateTexts(ctx.payload, "relance-signature"),
  });

  if (body.preview) {
    return NextResponse.json({ to: account.email, subject: built.subject, html: built.html });
  }

  const last = reminders[0]?.at ? Date.parse(reminders[0].at) : 0;
  if (Date.now() - last < MIN_GAP_MS) {
    return NextResponse.json({ error: "too_soon", message: "Une relance vient de partir." }, { status: 429 });
  }

  const replyTo = ctx.user.email?.trim() || undefined;
  try {
    await ctx.payload.sendEmail({
      to: account.email,
      subject: built.subject,
      html: built.html,
      text: built.text,
      ...(replyTo ? { replyTo } : {}),
    });
  } catch (e) {
    ctx.payload.logger.error(`[signature] relance ${kind} vers ${account.email} non partie : ${e}`);
    return NextResponse.json({ error: "send_failed", message: "La relance n'a pas pu être envoyée." }, { status: 502 });
  }

  // Envoyé d'abord, tracé ensuite (voir client-email) : une trace sans envoi
  // ferait croire à une relance que le client n'a jamais reçue.
  try {
    await ctx.payload.create({
      collection: "client-activities",
      data: {
        client: ctx.client.id as number,
        type: "email",
        title: built.subject,
        content: [`Relance de signature — ${SIGNABLE[kind].noun}.`, note ? `\n${note}` : ""].join(""),
        recipients: account.email,
        journeyStep: STEP[kind],
        occurredAt: new Date().toISOString(),
        author: ctx.user.id,
      } as never,
      overrideAccess: true,
    });
  } catch (e) {
    ctx.payload.logger.error(`[signature] relance ${kind} envoyée mais non tracée (client ${ctx.client.id}) : ${e}`);
    return NextResponse.json({ ok: true, email: account.email, logged: false });
  }
  return NextResponse.json({ ok: true, email: account.email });
}
