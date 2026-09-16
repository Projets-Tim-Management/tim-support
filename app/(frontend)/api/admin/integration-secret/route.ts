import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { readPassword } from "@/modules/marketing/lib/credential-secrets";

/**
 * GET /api/admin/integration-secret?id=… → { password }
 *
 * Le mot de passe du compte démo d'une connexion API, en clair, pour un admin
 * qui clique « Révéler » sur la fiche. Lu en brut via `payload.db` : `findByID`
 * appliquerait le masque. Pas de code par e-mail ici — c'est un compte de
 * démonstration chez un éditeur, sur une fiche déjà réservée aux admins — mais
 * le rôle est vérifié, et la lecture est journalisée.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const doc = (await payload.db
    .findOne({ collection: "integrations", where: { id: { equals: id } } } as never)
    .catch(() => null)) as { name?: string; demoPassword?: string | null } | null;
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  payload.logger.info(`[integrations] mot de passe démo de « ${doc.name ?? id} » révélé par ${user.email}.`);
  return NextResponse.json({ password: readPassword(doc.demoPassword) });
}
