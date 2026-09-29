import { NextResponse } from "next/server";

import { adminRequest } from "@/modules/ads/lib/route-auth";
import { upsertConnectedAccount } from "@/modules/ads/lib/accounts";
import { isAllowedAccount, refusal } from "@/modules/ads/lib/allowlist";
import { getPlatform } from "@/modules/ads/platforms";
import { AdTokenError } from "@/modules/ads/platforms/types";

/**
 * POST /api/admin/ads/meta/system-token  { externalId, token }
 *
 * Connecter un compte avec un JETON D'UTILISATEUR SYSTÈME — la voie principale
 * (D11) : sans échéance, sans écran de consentement, sans adresse de retour à
 * déclarer chez Meta. Crée le compte la première fois, le reconnecte ensuite
 * (même enregistrement, sort de l'archive).
 *
 * Rien n'est enregistré avant deux vérifications : le compte est dans la liste
 * autorisée, et Meta confirme que CE jeton ouvre CE compte — c'est aussi Meta
 * qui donne son nom, sa devise et son fuseau. Un jeton collé de travers est
 * refusé ici, pas découvert à la synchro de la nuit.
 *
 * Le jeton ne revient jamais dans la réponse.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;

  const body = (await req.json().catch(() => ({}))) as { externalId?: unknown; token?: unknown };
  const raw = typeof body.externalId === "string" ? body.externalId.trim() : "";
  const externalId = raw && !raw.startsWith("act_") ? `act_${raw}` : raw;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!externalId || !token) return NextResponse.json({ error: "L'identifiant du compte et le jeton sont tous deux nécessaires." }, { status: 400 });
  if (!isAllowedAccount(externalId)) return NextResponse.json({ error: refusal(externalId) }, { status: 403 });

  let accounts;
  try {
    accounts = await getPlatform("meta").listAccounts(token);
  } catch (e) {
    const message =
      e instanceof AdTokenError ? `Meta refuse ce jeton : ${e.message}` : (e as Error).message || "Meta ne répond pas.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const account = accounts.find((a) => a.externalId === externalId);
  if (!account) {
    return NextResponse.json(
      {
        error: `Ce jeton n'ouvre pas ${externalId}. Dans le portefeuille business, attribuez le compte publicitaire à l'utilisateur système (droit « Consulter les performances »), puis régénérez le jeton.`,
      },
      { status: 400 },
    );
  }

  const res = await upsertConnectedAccount(payload, { platform: "meta", account, token, expiresAt: null, kind: "system" });
  payload.logger.info(`[publicité] compte Meta ${externalId} ${res.created ? "créé" : "reconnecté"} par jeton système, par ${user.email}.`);
  return NextResponse.json({ id: res.id, created: res.created, name: account.name });
}
