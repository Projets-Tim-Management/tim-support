import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { findOpenRun, sendJourneyEmail } from "@/modules/marketing/lib/send";

/**
 * État de l'espace client d'une entreprise, et renvoi de son invitation.
 *
 * GET  ?clientId=…  → l'accès existe-t-il, est-il ouvert, l'invitation est-elle
 *                     partie, et quand
 * POST { clientId } → ouvre l'accès s'il attend encore, sinon RENVOIE
 *                     l'invitation (le client a perdu le message, l'a classé en
 *                     indésirable, ou l'adresse vient d'être corrigée)
 *
 * Le renvoi force l'envoi : le garde-fou « déjà envoyé » protège des doublons
 * automatiques, pas d'une demande explicite d'un admin. C'est tout l'intérêt du
 * bouton — sans lui, un message perdu laissait le client dehors sans recours.
 *
 * Réservé aux admins, comme la création de l'accès : c'est TIM qui ouvre les
 * espaces clients.
 */

const KEY = "invitation-espace-client";

type Account = {
  id: number | string;
  email?: string;
  active?: boolean;
  lastLoginAt?: string | null;
};

type RunEmailRow = { key?: string; sentAt?: string | null };

async function auth(req: Request, clientId: string | null) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user) || !clientId) return { payload, ok: false as const };
  return { payload, ok: true as const, clientId: Number(clientId) };
}

async function accountOf(payload: Awaited<ReturnType<typeof payloadClient>>, clientId: number) {
  const res = await payload.find({
    collection: "client-portal-accounts",
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (res.docs[0] as Account | undefined) ?? null;
}

export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("clientId");
  const ctx = await auth(req, clientId);
  if (!ctx.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const [account, run] = await Promise.all([
    accountOf(ctx.payload, ctx.clientId),
    findOpenRun(ctx.payload, ctx.clientId),
  ]);

  const rows = ((run as { emails?: RunEmailRow[] } | null)?.emails ?? []) as RunEmailRow[];

  return NextResponse.json({
    hasAccount: Boolean(account),
    email: account?.email ?? null,
    active: account?.active !== false,
    lastLoginAt: account?.lastLoginAt ?? null,
    invitationSentAt: rows.find((e) => e.key === KEY)?.sentAt ?? null,
    hasRun: Boolean(run),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { clientId?: string | number } | null;
  const ctx = await auth(req, body?.clientId != null ? String(body.clientId) : null);
  if (!ctx.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const account = await accountOf(ctx.payload, ctx.clientId);
  if (!account) {
    return NextResponse.json({ error: "no_account" }, { status: 409 });
  }

  // Accès encore en attente : l'ouvrir SUFFIT. Ses hooks envoient l'invitation
  // et cochent l'étape du parcours — refaire ce travail ici le ferait en double.
  if (account.active === false) {
    await ctx.payload.update({
      collection: "client-portal-accounts",
      id: account.id,
      data: { active: true },
      overrideAccess: true,
    });
    return NextResponse.json({ opened: true });
  }

  const run = await findOpenRun(ctx.payload, ctx.clientId);
  if (!run) return NextResponse.json({ error: "no_run" }, { status: 409 });

  const result = await sendJourneyEmail(ctx.payload, { run, key: KEY, force: true });
  if (!result.sent) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }
  return NextResponse.json({ resent: true });
}
