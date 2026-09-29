import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { adminRequest } from "@/modules/ads/lib/route-auth";
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

/** La barrière, puis le choix en attente de CE compte admin (cookie chiffré). */
async function context(req: Request) {
  const auth = await adminRequest(req);
  if ("response" in auth) return auth;
  const pending = openPending((await cookies()).get(PENDING_COOKIE)?.value, auth.user.id, new Date());
  return { ...auth, pending };
}

const cleared = (body: unknown, status = 200) => {
  const res = NextResponse.json(body, { status });
  res.cookies.set(PENDING_COOKIE, "", { path: PENDING_PATH, maxAge: 0 });
  return res;
};

export async function GET(req: Request) {
  const ctx = await context(req);
  if ("response" in ctx) return ctx.response;
  const { payload, pending } = ctx;
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
  const ctx = await context(req);
  if ("response" in ctx) return ctx.response;
  const { payload, user, pending } = ctx;
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
  const ctx = await context(req);
  if ("response" in ctx) return ctx.response;
  return cleared({ ok: true });
}
