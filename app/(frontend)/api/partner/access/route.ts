import { NextResponse } from "next/server";

import { ROLES, hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";

/**
 * Provisioning de l'ACCÈS back-office d'un partenaire MÉTIER : crée (ou met à
 * jour) le compte `Users` (rôle Métier, lié à la fiche) avec un mot de passe
 * défini par un admin. Réservé aux admins/super-admins.
 *
 * Le mot de passe ne transite QUE par cet endpoint (jamais stocké sur la fiche).
 *
 * GET  /api/partner/access?partnerId=<id>  → { linked, email, userId }
 * POST /api/partner/access  { partnerId, email, password? }  → crée/màj le compte
 */

async function requireAdmin(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  return { payload, ok: hasAdminRole(user) };
}

/** Compte lié à un partenaire (via Users.partner). */
async function linkedAccount(payload: Awaited<ReturnType<typeof payloadClient>>, partnerId: number) {
  const res = await payload.find({
    collection: "users",
    where: { partner: { equals: partnerId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return res.docs[0] as
    | { id: number | string; email?: string; firstName?: string; lastName?: string }
    | undefined;
}

/**
 * Identité du compte reprise de la fiche : prénom = « Prénom », nom = « Nom »
 * (les fiches importées stockent souvent le nom complet dans « Nom »).
 * Le champ `Users.name` — libellé affiché partout (barre du haut, switcher
 * « Voir comme ») — est recalculé par un hook à partir de ces deux champs : sans
 * eux, l'interface retombe sur l'e-mail.
 */
function identityFrom(partner: { firstName?: string; name?: string } | null) {
  return {
    firstName: partner?.firstName?.trim() || undefined,
    lastName: partner?.name?.trim() || undefined,
  };
}

export async function GET(req: Request) {
  const { payload, ok } = await requireAdmin(req);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const partnerId = Number(new URL(req.url).searchParams.get("partnerId"));
  if (!partnerId) return NextResponse.json({ error: "missing_partner" }, { status: 400 });

  const u = await linkedAccount(payload, partnerId);
  return NextResponse.json({ linked: Boolean(u), email: u?.email ?? null, userId: u?.id ?? null });
}

export async function POST(req: Request) {
  const { payload, ok } = await requireAdmin(req);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { partnerId?: number; password?: string };
  const partnerId = Number(body.partnerId);
  const password = typeof body.password === "string" ? body.password : "";
  if (!partnerId) {
    return NextResponse.json({ error: "missing_partner" }, { status: 400 });
  }

  // L'email du compte est FORCÉ sur le champ « Email » de la fiche partenaire ;
  // on reprend aussi prénom / nom / avatar pour préremplir le compte.
  const partner = (await payload
    .findByID({ collection: "partners", id: partnerId, depth: 0, overrideAccess: true })
    .catch(() => null)) as
    | {
        email?: string;
        firstName?: string;
        name?: string;
        partnerKind?: string;
        avatar?: number | string | null;
      }
    | null;
  // Le rôle DÉCOULE du type de la fiche : la validation de `Users.partner` exige
  // que les deux concordent (métier ↔ métier, utilisateur ↔ utilisateur).
  const role =
    partner?.partnerKind === "utilisateur" ? ROLES.partnerUtilisateur : ROLES.partnerMetier;
  const email = String(partner?.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "no_email", message: "Ajoute d'abord un email sur la fiche (champ « Email ») — c'est l'identifiant de connexion." },
      { status: 400 },
    );
  }

  try {
    const identity = identityFrom(partner);
    const current = await linkedAccount(payload, partnerId);
    if (current) {
      const data: { email: string; password?: string; firstName?: string; lastName?: string } = { email };
      if (password) data.password = password;
      // Rattrapage : un compte sans prénom NI nom s'affiche par son e-mail — on
      // le complète depuis la fiche, sans écraser une saisie existante.
      if (!current.firstName && !current.lastName) Object.assign(data, identity);
      await payload.update({ collection: "users", id: current.id, data, overrideAccess: true });
      return NextResponse.json({ ok: true, created: false, email });
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "weak_password", message: "Mot de passe requis (8 caractères min.) pour créer l'accès." },
        { status: 400 },
      );
    }
    await payload.create({
      collection: "users",
      data: {
        email,
        password,
        roles: [role],
        partner: partnerId,
        // Infos reprises de la fiche partenaire.
        ...identity,
        avatar: typeof partner?.avatar === "number" ? partner.avatar : undefined,
      },
      overrideAccess: true,
    });
    return NextResponse.json({ ok: true, created: true, email });
  } catch (e) {
    // Ex. e-mail déjà utilisé par un autre compte.
    const message = e instanceof Error ? e.message : "Échec de la création de l'accès.";
    return NextResponse.json({ error: "provision_failed", message }, { status: 400 });
  }
}
