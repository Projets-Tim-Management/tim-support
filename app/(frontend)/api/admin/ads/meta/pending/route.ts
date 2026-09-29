import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { upsertConnectedAccount } from "@/modules/ads/lib/accounts";
import { allowedAccounts, isAllowedAccount, refusal } from "@/modules/ads/lib/allowlist";
import { PENDING_COOKIE, PENDING_PATH, openPending } from "@/modules/ads/lib/meta-oauth";
import { getPlatform, isMetaMock } from "@/modules/ads/platforms";

/**
 * Le choix du compte, quand le jeton en ouvre plusieurs.
 *
 * GET    → { simulated, allowed, accounts: [{ externalId, name, currency, known }] | null }
 *          `allowed` : les comptes connectables (pré-remplissage du formulaire).
 *          `known` : déjà connu — le choisir le RECONNECTE, il n'en crée pas un second.
 * POST   { externalId } → connecte ce compte, efface le choix en attente.
 * DELETE → abandonne le choix.
 *
 * Le jeton ne sort jamais d'ici : il reste dans le cookie chiffré.
 */
export const dynamic = "force-dynamic";

async function context(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user || !hasAdminRole(user)) return { payload, user: null, pending: null };
  const pending = openPending((await cookies()).get(PENDING_COOKIE)?.value, user.id, new Date());
  return { payload, user, pending };
}

const cleared = (body: unknown, status = 200) => {
  const res = NextResponse.json(body, { status });
  res.cookies.set(PENDING_COOKIE, "", { path: PENDING_PATH, maxAge: 0 });
  return res;
};

export async function GET(req: Request) {
  const { payload, user, pending } = await context(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const allowed = [...allowedAccounts()];
  if (!pending) return NextResponse.json({ simulated: isMetaMock(), allowed, accounts: null });

  const accounts = (await getPlatform("meta").listAccounts(pending.token)).filter((a) => isAllowedAccount(a.externalId));
  const known = await payload.find({
    collection: "ad-accounts",
    where: { and: [{ platform: { equals: "meta" } }, { externalId: { in: accounts.map((a) => a.externalId) } }] },
    limit: accounts.length,
    depth: 0,
    overrideAccess: true,
  });
  const byId = new Map(known.docs.map((d) => [d.externalId, d.status]));
  return NextResponse.json({
    simulated: isMetaMock(),
    allowed,
    accounts: accounts.map((a) => ({ ...a, known: byId.has(a.externalId), status: byId.get(a.externalId) ?? null })),
  });
}

export async function POST(req: Request) {
  const { payload, user, pending } = await context(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!pending) return cleared({ error: "La demande de connexion a expiré : relancez « Connecter un compte Meta »." }, 410);

  const { externalId } = (await req.json().catch(() => ({}))) as { externalId?: string };
  if (!isAllowedAccount(externalId)) return NextResponse.json({ error: refusal(externalId) }, { status: 403 });
  const account = (await getPlatform("meta").listAccounts(pending.token)).find((a) => a.externalId === externalId);
  if (!account) return NextResponse.json({ error: "Ce compte n'est pas accessible avec ce jeton." }, { status: 400 });

  const res = await upsertConnectedAccount(payload, {
    platform: "meta",
    account,
    token: pending.token,
    expiresAt: pending.expiresAt ? new Date(pending.expiresAt) : null,
  });
  payload.logger.info(`[publicité] compte Meta ${account.externalId} ${res.created ? "connecté" : "reconnecté"} par ${user.email}.`);
  return cleared({ id: res.id, created: res.created, name: account.name });
}

export async function DELETE(req: Request) {
  const { user } = await context(req);
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return cleared({ ok: true });
}
