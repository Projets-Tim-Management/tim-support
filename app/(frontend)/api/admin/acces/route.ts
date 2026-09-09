import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { readTimAccesses } from "@/modules/marketing/lib/credential-secrets";
import { buildTimAccessEmail, buildTimAccessRecapEmail } from "@/modules/marketing/lib/emails";
import { LICENCE_PROFILE_OPTIONS } from "@/modules/marketing/lib/onboarding";

/**
 * Les accès au logiciel TIM, remis depuis le BACK-OFFICE.
 *
 * Le pendant admin de `/api/portal/acces` : le client peut déjà se les envoyer
 * lui-même depuis son espace, mais il faut souvent le faire à sa place — un
 * prospect en essai qui n'a pas encore d'espace, un référent qui rappelle pour
 * demander la liste.
 *
 * GET  ?clientId=…            → qui a un accès, à quelle adresse, et l'adresse
 *                               du référent (celle de l'espace client)
 * POST { clientId, id }       → ses accès À ELLE, à SON adresse
 * POST { clientId, all, to }  → TOUS les accès, en un message, à `to`
 *
 * Deux garde-fous conservés du côté client : le destinataire d'un envoi
 * individuel n'est jamais transmis — il est lu sur la fiche, donc on ne peut pas
 * se faire envoyer le mot de passe d'un tiers ailleurs —, et rien ne part pour
 * une personne sans accès généré.
 *
 * L'envoi groupé, lui, accepte une adresse : c'est tout son objet — remettre la
 * liste à celui qui la distribuera, qui n'est pas toujours le référent déclaré.
 * Réservé aux admins, et tracé.
 */

type Body = { clientId?: number | string; id?: number | string; all?: boolean; to?: string };

async function auth(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  return { payload, ok: hasAdminRole(user) };
}

/** L'adresse de l'espace client : le référent, destinataire par défaut du récapitulatif. */
async function referentEmail(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  clientId: number | string,
): Promise<string | null> {
  const res = await payload.find({
    collection: "client-portal-accounts",
    where: { client: { equals: clientId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return ((res.docs[0] as { email?: string } | undefined)?.email ?? null) || null;
}

const profileLabel = (key?: string | null) =>
  LICENCE_PROFILE_OPTIONS.find((p) => p.value === key)?.label ?? null;

export async function GET(req: Request) {
  const ctx = await auth(req);
  if (!ctx.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const clientId = new URL(req.url).searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "missing_client" }, { status: 400 });

  const [acces, referent] = await Promise.all([
    readTimAccesses(ctx.payload, clientId),
    referentEmail(ctx.payload, clientId),
  ]);

  return NextResponse.json({
    referent,
    // Le mot de passe ne sort PAS d'ici : l'écran n'a pas à l'afficher, il a
    // seulement besoin de savoir qui peut recevoir quoi. Le déchiffré reste
    // côté serveur, dans l'envoi et la page d'impression.
    people: acces.map((a) => ({
      id: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email,
      profileLabel: profileLabel(a.licenceProfile),
      hasAccess: Boolean(a.timPassword),
    })),
  });
}

export async function POST(req: Request) {
  const ctx = await auth(req);
  if (!ctx.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (body?.clientId == null) return NextResponse.json({ error: "missing_client" }, { status: 400 });

  const client = (await ctx.payload
    .findByID({ collection: "partner-clients", id: body.clientId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { companyName?: string | null } | null;
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const acces = await readTimAccesses(ctx.payload, body.clientId);

  // ── Tous les accès, en un message ──────────────────────────────────────────
  if (body.all) {
    const ready = acces.filter((a) => a.timPassword);
    if (ready.length === 0) return NextResponse.json({ error: "no_access" }, { status: 409 });

    const to = (body.to?.trim() || (await referentEmail(ctx.payload, body.clientId)) || "").trim();
    if (!to) return NextResponse.json({ error: "no_recipient" }, { status: 409 });

    const mail = buildTimAccessRecapEmail({
      clientName: client.companyName ?? null,
      accesses: ready.map((a) => ({
        firstName: a.firstName,
        lastName: a.lastName,
        login: a.email ?? "",
        password: a.timPassword as string,
        profileLabel: profileLabel(a.licenceProfile),
        // Le profil décide de la porte annoncée : logiciel en ligne, application
        // mobile, ou les deux pour un chef de chantier.
        profileKey: a.licenceProfile,
      })),
    });

    try {
      await ctx.payload.sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text });
    } catch (err) {
      ctx.payload.logger.error(`[accès] récapitulatif à ${to} échoué : ${err}`);
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }

    ctx.payload.logger.info(
      `[accès] récapitulatif de ${ready.length} accès envoyé à ${to} (client ${body.clientId}).`,
    );
    return NextResponse.json({ ok: true, to, count: ready.length });
  }

  // ── Une personne, à sa propre adresse ──────────────────────────────────────
  if (body.id == null) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const personne = acces.find((a) => String(a.id) === String(body.id));
  if (!personne) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!personne.timPassword) return NextResponse.json({ error: "no_access" }, { status: 409 });
  if (!personne.email?.trim()) return NextResponse.json({ error: "no_email" }, { status: 409 });

  const mail = buildTimAccessEmail({
    firstName: personne.firstName,
    lastName: personne.lastName,
    login: personne.email,
    password: personne.timPassword,
    profileLabel: profileLabel(personne.licenceProfile),
    profileKey: personne.licenceProfile,
    clientName: client.companyName ?? null,
  });

  try {
    await ctx.payload.sendEmail({
      to: personne.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch (err) {
    ctx.payload.logger.error(`[accès] envoi à ${personne.email} échoué : ${err}`);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  ctx.payload.logger.info(
    `[accès] accès TIM envoyés à ${personne.email} depuis le back-office (client ${body.clientId}).`,
  );
  return NextResponse.json({ ok: true, to: personne.email });
}
