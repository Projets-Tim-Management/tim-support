import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { armAutoStep } from "@/modules/marketing/lib/auto-steps";
import { generatePassword } from "@/modules/marketing/lib/credentials";

/**
 * POST /api/admin/tim-access  { clientId }
 *
 * Génère le mot de passe des utilisateurs qui n'en ont pas encore.
 *
 * L'identifiant de connexion est l'adresse e-mail de la personne : il n'y a donc
 * qu'un secret à fabriquer, et un seul à recopier sur la fiche remise en main
 * propre.
 *
 * Les comptes eux-mêmes sont créés DANS TIM, pas ici : cette route ne fabrique
 * que ce que le client doit pouvoir relire et distribuer à ses équipes.
 *
 * Ne touche JAMAIS un accès déjà généré. Un mot de passe distribué en réunion de
 * chantier, recopié sur un papier, ne se change pas parce qu'on a recliqué sur
 * un bouton — on casserait des connexions sans que personne ne le sache.
 */

type Contact = { id: number | string; timPassword?: string | null };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { clientId?: string | number } | null;
  const clientId = body?.clientId;
  if (clientId == null) return NextResponse.json({ error: "missing_client" }, { status: 400 });

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const res = await payload.find({
    collection: "client-contacts",
    where: { client: { equals: Number(clientId) } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });

  const contacts = res.docs as Contact[];

  let created = 0;
  for (const contact of contacts) {
    // Le mot de passe arrive MASQUÉ quand il existe : sa présence suffit, on ne
    // le relit jamais en clair ici.
    if (contact.timPassword) continue;

    await payload.update({
      collection: "client-contacts",
      id: contact.id,
      data: { timPassword: generatePassword() },
      overrideAccess: true,
    });
    created += 1;
  }

  // Générer les accès EST l'étape « Provisionnement des accès » : c'est le geste
  // attendu, il n'y a rien à cocher en plus. Sans cet armement, l'étape resterait
  // à faire indéfiniment — et n'ayant pas de bouton, elle bloquerait le parcours.
  if (created > 0) await armAutoStep(payload, Number(clientId), "provisionnement");

  payload.logger.info(`[accès TIM] ${created} accès générés pour le client ${clientId}.`);
  return NextResponse.json({ ok: true, created, total: contacts.length });
}
