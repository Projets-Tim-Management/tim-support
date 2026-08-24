import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { generatePassword, suggestUsername } from "@/modules/marketing/lib/credentials";

/**
 * Accès de test d'un client, générés depuis son dossier de démarrage.
 *
 * GET  ?clientId=…  → combien d'utilisateurs déclarés, combien d'accès créés
 * POST { clientId } → crée les accès MANQUANTS (un par salarié « Accès TIM »)
 *
 * Réservé aux admins : c'est TIM qui ouvre les comptes de test, la règle est la
 * même que pour l'espace client.
 *
 * Ne crée QUE ce qui manque, et ne touche jamais à un accès existant : relancer
 * l'action après avoir ajouté trois salariés doit ajouter trois lignes, pas
 * réinitialiser les douze premières.
 */

type PortalUser = {
  id: number | string;
  firstName?: string;
  lastName?: string;
  licenceProfile?: string;
};

type Credential = {
  id: number | string;
  username?: string;
  password?: string;
  /** Utilisateur déclaré dont cet accès découle. */
  contact?: number | string | { id?: number | string };
};

const idOf = (ref: unknown): string =>
  String(ref && typeof ref === "object" ? ((ref as { id?: unknown }).id ?? "") : (ref ?? ""));

async function context(req: Request, clientId: string | null) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user) || !clientId) return { payload, ok: false as const };

  const [employees, credentials] = await Promise.all([
    payload.find({
      // Les utilisateurs déclarés par le client, et non plus les salariés cochés
      // « Accès TIM » : une seule liste décide des comptes à créer et des
      // licences facturées.
      collection: "client-contacts",
      where: { client: { equals: Number(clientId) } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: "client-credentials",
      where: { client: { equals: Number(clientId) } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  return {
    payload,
    ok: true as const,
    users: employees.docs as PortalUser[],
    existing: credentials.docs as Credential[],
  };
}

export async function GET(req: Request) {
  const clientId = new URL(req.url).searchParams.get("clientId");
  const ctx = await context(req, clientId);
  if (!ctx.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const linked = new Set(ctx.existing.map((c) => idOf(c.contact)).filter(Boolean));
  const missing = ctx.users.filter((u) => !linked.has(String(u.id)));

  return NextResponse.json({
    declared: ctx.users.length,
    created: ctx.existing.length,
    missing: missing.length,
    // Un accès sans mot de passe n'est pas distribuable : c'est ce qui reste à
    // faire pour TIM, et ce que l'écran doit mettre en avant. Le masque compte
    // comme un mot de passe présent — il en signale un, chiffré.
    incomplete: ctx.existing.filter((c) => !c.password?.trim()).length,
  });
}

export async function POST(req: Request) {
  let clientId: string | undefined;
  try {
    clientId = (await req.json())?.clientId?.toString();
  } catch {
    /* corps illisible */
  }

  const ctx = await context(req, clientId ?? null);
  if (!ctx.ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const linked = new Set(ctx.existing.map((c) => idOf(c.contact)).filter(Boolean));
  const taken = new Set(ctx.existing.map((c) => c.username ?? "").filter(Boolean));
  const missing = ctx.users.filter((u) => !linked.has(String(u.id)));

  for (const user of missing) {
    const username = suggestUsername(user.firstName, user.lastName, taken);
    taken.add(username);

    await ctx.payload.create({
      collection: "client-credentials",
      data: {
        client: Number(clientId),
        contact: Number(user.id),
        firstName: user.firstName ?? "—",
        lastName: user.lastName ?? "—",
        licenceProfile: user.licenceProfile,
        username,
        // Proposé, pas imposé : l'admin le remplace par celui réellement créé
        // dans l'application TIM si elle en impose un autre.
        password: generatePassword(),
      } as never,
      overrideAccess: true,
    });
  }

  ctx.payload.logger.info(
    `[accès] ${missing.length} accès de test générés pour le client ${clientId}.`,
  );

  return NextResponse.json({ ok: true, created: missing.length });
}
