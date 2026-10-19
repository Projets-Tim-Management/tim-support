import type { Payload } from "payload";

import { syncDecision, usableToken, type RawAccount } from "@/modules/ads/lib/sync";
import { getPlatform, isMetaMock } from "@/modules/ads/platforms";
import { accessVerdict, type AccessVerdict } from "@/modules/ads/lib/access-verdict";
import type { AccessReport, AccountContext, AdPlatform } from "@/modules/ads/platforms/types";

export { accessVerdict, type AccessVerdict };

export class AccountUnavailable extends Error {}

const REASONS: Record<string, string> = {
  archive: "Compte archivé : réactivez-le d'abord.",
  "simule-hors-mode-simule": "Compte simulé : il ne s'utilise qu'en données simulées (ADS_META_MOCK=1).",
  "reel-en-mode-simule": "Compte réel : jamais utilisé en données simulées.",
  "hors-liste": "Compte hors de META_ALLOWED_AD_ACCOUNTS.",
};

/** Le compte, son jeton en clair (serveur seulement) et l'adaptateur de sa régie — ou la raison de ne pas s'en servir. */
export async function accountContext(payload: Payload, id: number | string, env = process.env): Promise<{ acc: RawAccount; ctx: AccountContext; platform: AdPlatform }> {
  const res = (await payload.db.find({ collection: "ad-accounts", where: { id: { equals: id } }, limit: 1 } as never)) as { docs: RawAccount[] };
  const acc = res.docs[0];
  if (!acc) throw new AccountUnavailable("Compte introuvable.");
  const decision = syncDecision(acc, isMetaMock(env), env);
  if (decision !== "ok") throw new AccountUnavailable(REASONS[decision] ?? decision);
  const token = usableToken(acc);
  if (!token) throw new AccountUnavailable("Aucun jeton : collez le jeton d'utilisateur système sur la fiche du compte.");
  return { acc, ctx: { externalId: acc.externalId ?? "", token, currency: acc.currency, timezone: acc.timezone }, platform: getPlatform(acc.platform ?? "meta", env) };
}

/** Vérifie les droits du compte chez la régie et garde le rapport sur sa fiche (jamais le jeton). */
export async function checkAccountAccess(payload: Payload, id: number | string, now = new Date()): Promise<AccessReport & { verdict: AccessVerdict }> {
  const { acc, ctx, platform } = await accountContext(payload, id);
  if (!platform.checkAccess) throw new AccountUnavailable(`${platform.label} : la vérification des droits n'est pas encore branchée.`);
  const report = await platform.checkAccess(ctx);
  const current = (acc as { diffusion?: { pageId?: string | null; instagramId?: string | null; pixelId?: string | null } }).diffusion ?? {};
  // Une seule Page (ou un seul pixel) : on la choisit d'office ; sinon on garde le choix déjà fait s'il existe encore.
  const keep = <T extends { id: string }>(list: T[], chosen?: string | null) => (chosen && list.some((x) => x.id === chosen) ? chosen : list.length === 1 ? list[0].id : null);
  const pageId = keep(report.pages, current.pageId);
  const page = report.pages.find((p) => p.id === pageId);
  const instagramId = keep(report.instagram, current.instagramId ?? page?.instagram?.id ?? null);
  const pixelId = keep(report.pixels, current.pixelId);
  await payload.update({
    collection: "ad-accounts",
    id,
    data: {
      diffusion: {
        pageId,
        pageName: page?.name ?? null,
        instagramId,
        instagramName: report.instagram.find((i) => i.id === instagramId)?.username ?? null,
        pixelId,
        pixelName: report.pixels.find((p) => p.id === pixelId)?.name ?? null,
        scopes: report.scopes,
        found: { pages: report.pages, instagram: report.instagram, pixels: report.pixels },
        checkedAt: now.toISOString(),
      },
    } as never,
    overrideAccess: true,
  });
  return { ...report, verdict: accessVerdict(report.scopes, { pageId }) };
}
