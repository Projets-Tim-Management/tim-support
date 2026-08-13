import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { revealCodeEmail } from "@/modules/marketing/lib/credential-reveal-email";
import { readClientCredentials } from "@/modules/marketing/lib/credential-secrets";
import { codeMatches, generateCode, hashCode } from "@/modules/marketing/lib/portal-auth";

/**
 * Affichage des mots de passe d'accès dans le back-office, sous condition.
 *
 * POST { clientId }            → tire un code, l'envoie au demandeur, ouvre une demande
 * POST { clientId, code }      → vérifie le code et renvoie les accès en clair
 *
 * Pourquoi un code alors que la personne est DÉJÀ authentifiée ? Parce qu'une
 * session d'administration reste ouverte des heures sur un poste qu'on quitte,
 * et que ces mots de passe ouvrent le logiciel de production du client. Le code
 * transforme un affichage passif en geste délibéré, tracé nominativement.
 *
 * Réservé aux admins : ce sont eux qui créent ces accès.
 */

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: unknown; code?: unknown };
  const clientId = Number(body.clientId);
  if (!clientId) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const userId = Number((user as { id: number | string }).id);
  const email = (user as { email?: string }).email;
  if (!email) return NextResponse.json({ error: "no_email" }, { status: 400 });

  const client = (await payload
    .findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true })
    .catch(() => null)) as { companyName?: string } | null;
  if (!client) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // ── Demande d'un code ─────────────────────────────────────────────────────
  if (!body.code) {
    const code = generateCode();
    await payload.create({
      collection: "credential-reveals",
      data: {
        user: userId,
        client: clientId,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
        attempts: 0,
      },
      overrideAccess: true,
    });

    await payload.sendEmail({
      to: email,
      ...revealCodeEmail(code, client.companyName, CODE_TTL_MIN),
    });
    payload.logger.info(
      `[accès] code de consultation envoyé à ${email} pour le client ${clientId}.`,
    );
    return NextResponse.json({ ok: true, sent: true, to: email });
  }

  // ── Vérification ──────────────────────────────────────────────────────────
  const pending = await payload.find({
    collection: "credential-reveals",
    where: {
      and: [
        { user: { equals: userId } },
        { client: { equals: clientId } },
        { usedAt: { exists: false } },
      ],
    },
    sort: "-createdAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const demande = pending.docs[0] as
    | { id: number | string; codeHash?: string; expiresAt?: string; attempts?: number }
    | undefined;
  if (!demande) return NextResponse.json({ error: "no_request" }, { status: 409 });

  if (demande.expiresAt && Date.parse(demande.expiresAt) < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  if ((demande.attempts ?? 0) >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  if (!codeMatches(String(body.code), demande.codeHash)) {
    // L'essai raté est compté AVANT toute réponse : un compteur incrémenté
    // seulement en cas de succès ne limiterait rien.
    await payload
      .update({
        collection: "credential-reveals",
        id: demande.id,
        data: { attempts: (demande.attempts ?? 0) + 1 },
        overrideAccess: true,
      })
      .catch(() => undefined);
    return NextResponse.json({ error: "bad_code" }, { status: 401 });
  }

  // Consommé : le même code ne rouvre pas une seconde consultation.
  await payload
    .update({
      collection: "credential-reveals",
      id: demande.id,
      data: { usedAt: new Date().toISOString() },
      overrideAccess: true,
    })
    .catch(() => undefined);

  const credentials = await readClientCredentials(payload, clientId);
  payload.logger.info(
    `[accès] ${email} a consulté ${credentials.length} accès du client ${clientId}.`,
  );

  return NextResponse.json({
    ok: true,
    credentials: credentials.map((c) => ({
      id: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      username: c.username,
      password: c.password,
    })),
  });
}
