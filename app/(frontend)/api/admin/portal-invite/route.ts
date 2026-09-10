import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { findOpenRun, sendJourneyEmail } from "@/modules/marketing/lib/send";
import { INVITATION_KEY, buildStandaloneInvitation } from "@/modules/marketing/lib/portal-invite";

/**
 * État de l'espace client d'une entreprise, et renvoi de son invitation.
 *
 * GET  ?clientId=…  → l'accès existe-t-il, est-il ouvert, l'invitation est-elle
 *                     partie, et quand
 * POST { clientId } → ouvre l'accès s'il attend encore, sinon RENVOIE
 *                     l'invitation (le client a perdu le message, l'a classé en
 *                     indésirable, ou l'adresse vient d'être corrigée)
 *
 * SANS PHASE DE TEST, l'invitation part quand même : on ouvre parfois un espace
 * à un prospect pour lui faire essayer le produit. Le message est alors composé
 * hors parcours (voir lib/portal-invite) et sa date se marque sur l'accès, qui
 * est le seul endroit où l'écrire — il n'y a pas de parcours pour la porter.
 *
 * Le renvoi force l'envoi : le garde-fou « déjà envoyé » protège des doublons
 * automatiques, pas d'une demande explicite d'un admin. C'est tout l'intérêt du
 * bouton — sans lui, un message perdu laissait le client dehors sans recours.
 *
 * Réservé aux admins, comme la création de l'accès : c'est TIM qui ouvre les
 * espaces clients.
 */

const KEY = INVITATION_KEY;

type Account = {
  id: number | string;
  email?: string;
  firstName?: string | null;
  active?: boolean;
  lastLoginAt?: string | null;
  invitationSentAt?: string | null;
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
    // Deux traces possibles, jamais les deux à la fois : la ligne du parcours
    // quand il y en a un, sinon la date posée sur l'accès par l'envoi isolé.
    invitationSentAt: rows.find((e) => e.key === KEY)?.sentAt ?? account?.invitationSentAt ?? null,
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

  /**
   * Pas de parcours : envoi ISOLÉ. Un seul message, à la demande, sans séquence
   * derrière — c'est exactement ce qu'on veut pour un prospect à qui on ouvre un
   * espace d'essai.
   */
  if (!run) {
    if (!account.email) return NextResponse.json({ error: "no_recipient" }, { status: 409 });

    const client = (await ctx.payload
      .findByID({ collection: "partner-clients", id: ctx.clientId, depth: 0, overrideAccess: true })
      .catch(() => null)) as { companyName?: string | null } | null;

    const built = buildStandaloneInvitation({
      clientName: client?.companyName ?? null,
      contactFirstName: account.firstName ?? null,
    });
    if (!built) return NextResponse.json({ error: "no_template" }, { status: 500 });

    try {
      await ctx.payload.sendEmail({
        to: account.email,
        subject: built.subject,
        html: built.html,
        text: built.text,
      });
    } catch (err) {
      ctx.payload.logger.error(`[espace client] invitation isolée à ${account.email} échouée : ${err}`);
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }

    // La date se marque sur l'ACCÈS : sans parcours, c'est le seul endroit où
    // l'écrire — et l'encart la relit pour dire quand l'invitation est partie.
    await ctx.payload
      .update({
        collection: "client-portal-accounts",
        id: account.id,
        data: { invitationSentAt: new Date().toISOString() } as never,
        overrideAccess: true,
      })
      .catch((err) =>
        // L'e-mail EST parti : un marquage raté ne doit pas le faire croire
        // perdu. On le trace, sans renvoyer d'erreur.
        ctx.payload.logger.error(`[espace client] date d'invitation non marquée (${account.id}) : ${err}`),
      );

    return NextResponse.json({ resent: true, standalone: true });
  }

  const result = await sendJourneyEmail(ctx.payload, { run, key: KEY, force: true });
  if (!result.sent) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }
  return NextResponse.json({ resent: true });
}
