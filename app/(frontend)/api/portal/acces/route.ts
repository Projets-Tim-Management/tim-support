import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { readTimAccesses } from "@/modules/marketing/lib/credential-secrets";
import { buildTimAccessEmail } from "@/modules/marketing/lib/emails";
import { LICENCE_PROFILE_OPTIONS } from "@/modules/marketing/lib/onboarding";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";

/**
 * POST /api/portal/acces  { id }
 *
 * Envoie à UNE personne ses accès au logiciel TIM, à l'adresse déclarée pour
 * elle dans le dossier de démarrage.
 *
 * Trois garde-fous, et ils tiennent ensemble :
 *
 *  1. la session client décide de l'entreprise — jamais le corps de la requête.
 *     Un identifiant d'une autre entreprise ne renvoie rien ;
 *  2. le destinataire n'est pas transmis : il est LU sur la fiche. On ne peut
 *     donc pas se faire envoyer le mot de passe d'un collègue chez soi ;
 *  3. rien n'est envoyé si la personne n'a pas d'accès généré.
 *
 * L'expéditeur est TIM : c'est notre nom sur le message, et c'est voulu — un
 * mot de passe qui arrive d'une adresse inconnue ressemble à une arnaque.
 */
export async function POST(req: Request) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: number | string } | null;
  if (body?.id == null) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const payload = await payloadClient();

  // Lecture déchiffrée, bornée à l'entreprise de la session : c'est cette
  // lecture, et non l'identifiant reçu, qui définit ce qui est atteignable.
  const acces = await readTimAccesses(payload, ctx.client.id);
  const personne = acces.find((a) => String(a.id) === String(body.id));

  if (!personne) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!personne.timPassword) {
    return NextResponse.json({ error: "no_access" }, { status: 409 });
  }
  if (!personne.email?.trim()) {
    return NextResponse.json({ error: "no_email" }, { status: 409 });
  }

  const profil = LICENCE_PROFILE_OPTIONS.find((p) => p.value === personne.licenceProfile);

  const mail = buildTimAccessEmail({
    firstName: personne.firstName,
    lastName: personne.lastName,
    // L'identifiant de connexion EST l'adresse e-mail : il n'y a rien d'autre
    // à retenir, et c'est aussi là que le message arrive.
    login: personne.email,
    password: personne.timPassword,
    profileLabel: profil?.label ?? null,
    clientName: ctx.client.companyName,
  });

  try {
    await payload.sendEmail({
      to: personne.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch (err) {
    payload.logger.error(`[accès] envoi à ${personne.email} échoué : ${err}`);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  payload.logger.info(
    `[accès] accès TIM envoyés à ${personne.email} (client ${ctx.client.id}).`,
  );
  return NextResponse.json({ ok: true, to: personne.email });
}
