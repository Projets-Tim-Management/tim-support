import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { readState } from "@/core/lib/secrets";
import { upsertConnectedAccount } from "@/modules/ads/lib/accounts";
import {
  ACCOUNTS_LIST,
  PENDING_COOKIE,
  PENDING_PATH,
  PENDING_TTL_SEC,
  metaRedirectUri,
  outcomeOf,
  sealPending,
  type NoticeKey,
} from "@/modules/ads/lib/meta-oauth";
import { getPlatform } from "@/modules/ads/platforms";

/**
 * GET /api/admin/ads/meta/callback?code&state — retour de Meta.
 *
 * Jeton longue durée, puis les comptes publicitaires qu'il ouvre : un seul, il
 * est connecté d'office ; plusieurs, le jeton attend le choix dans un cookie
 * chiffré (voir lib/meta-oauth). Une reconnexion retrouve toujours le même
 * enregistrement (lib/accounts).
 */
export const dynamic = "force-dynamic";

const back = (req: Request, notice: NoticeKey, extra: Record<string, string> = {}) => {
  const to = new URL(ACCOUNTS_LIST, req.url);
  to.searchParams.set("connexion", notice);
  for (const [k, v] of Object.entries(extra)) to.searchParams.set(k, v);
  return NextResponse.redirect(to);
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Refus ou fermeture de l'écran Meta.
  if (url.searchParams.get("error")) return back(req, "annulee");

  const state = readState<{ uid?: string; kind?: string }>(url.searchParams.get("state"));
  const code = url.searchParams.get("code");
  if (!state || state.kind !== "ads-meta" || state.uid !== String(user.id) || !code) return back(req, "expiree");

  try {
    const platform = getPlatform("meta");
    const { token, expiresAt } = await platform.connect(code, metaRedirectUri());
    const outcome = outcomeOf(await platform.listAccounts(token));

    if (outcome.kind === "none") return back(req, "aucun");
    if (outcome.kind === "single") {
      await upsertConnectedAccount(payload, { platform: "meta", account: outcome.account, token, expiresAt });
      payload.logger.info(`[publicité] compte Meta ${outcome.account.externalId} connecté par ${user.email}.`);
      return back(req, "ok", { nom: outcome.account.name });
    }

    const res = back(req, "choix");
    res.cookies.set(PENDING_COOKIE, sealPending({ uid: String(user.id), token, expiresAt: expiresAt?.toISOString() ?? null }, new Date()), {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: PENDING_PATH,
      maxAge: PENDING_TTL_SEC,
    });
    return res;
  } catch (e) {
    payload.logger.error(`[publicité] connexion Meta échouée : ${(e as Error).message}`);
    return back(req, "erreur", { detail: (e as Error).message });
  }
}
