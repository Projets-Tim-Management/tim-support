import type { Payload } from "payload";

import type { PlatformKey } from "@/modules/ads/lib/platforms";
import type { AccountSnapshot } from "@/modules/ads/platforms/types";
import { encryptSecret } from "@/core/lib/secrets";

/**
 * Cycle de vie d'un compte publicitaire.
 *
 * Un compte ne se SUPPRIME pas, il s'ARCHIVE : il n'est plus synchronisé, et ses
 * campagnes et ses chiffres restent en place. On le reconnectera — au passage au
 * jeton d'utilisateur système, par exemple — et les agents auront besoin de son
 * historique. La suppression définitive existe, réservée au super-admin, avec
 * le nombre de lignes effacées annoncé avant (voir la route « purge »).
 *
 * Et une reconnexion retrouve TOUJOURS le même enregistrement, par sa clé
 * (régie + identifiant chez la régie) : un nouveau compte couperait l'historique
 * en deux, et l'index unique le refuserait de toute façon.
 */

export type AccountStatus = "sans-jeton" | "connecte" | "expire" | "erreur" | "archive";

export type AccountTokens = {
  status?: string | null;
  token?: string | null;
  systemUserToken?: string | null;
  tokenExpiresAt?: string | Date | null;
};

/** Un compte archivé n'est plus lu chez la régie. */
export const isSyncable = (a: { status?: string | null }): boolean => a.status !== "archive";

/**
 * L'état d'un compte d'après ses jetons — ce qu'on peut constater sans appeler
 * la régie. La synchro suivante confirme (ou passe « En erreur »).
 *
 * Le jeton système prime : il n'expire pas.
 */
export function statusFromTokens(a: AccountTokens, now: Date): AccountStatus {
  if (a.systemUserToken) return "connecte";
  if (!a.token) return "sans-jeton";
  const exp = a.tokenExpiresAt ? new Date(a.tokenExpiresAt).getTime() : null;
  return exp !== null && exp <= now.getTime() ? "expire" : "connecte";
}

type ConnectInput = {
  platform: PlatformKey;
  account: AccountSnapshot;
  token: string;
  expiresAt: Date | null;
  /**
   * `oauth` (défaut) : jeton longue durée, daté, alerte J-7.
   * `system` : jeton d'utilisateur système, sans échéance — la cible (D11).
   * Il est passé EN CLAIR : le champ le chiffre à l'enregistrement.
   */
  kind?: "oauth" | "system";
};

/**
 * Connexion d'un compte — OAuth ou jeton d'utilisateur système : crée l'enregistrement la première fois, le
 * RETROUVE ensuite — archivé ou non. Le jeton est remplacé, l'échéance et
 * l'alerte J-7 repartent de zéro, et le compte sort de l'archive : se
 * reconnecter est le geste qui dit qu'on veut à nouveau le suivre.
 *
 * Lecture via `payload.find` en `overrideAccess` : c'est une route serveur
 * qui appelle, après avoir vérifié le rôle.
 */
export async function upsertConnectedAccount(payload: Payload, input: ConnectInput): Promise<{ id: number | string; created: boolean }> {
  const { platform, account, token, expiresAt } = input;
  const common = { name: account.name, currency: account.currency, timezone: account.timezone, status: "connecte" as const, lastError: null };
  // Un jeton système ne touche pas au jeton OAuth éventuel : il prime, sans l'effacer.
  const data =
    input.kind === "system"
      ? { ...common, systemUserToken: token }
      : { ...common, token: encryptSecret(token), tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null, tokenAlertSentAt: null };

  const existing = (
    await payload.find({
      collection: "ad-accounts",
      where: { and: [{ platform: { equals: platform } }, { externalId: { equals: account.externalId } }] },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
  ).docs[0];

  if (existing) {
    await payload.update({ collection: "ad-accounts", id: existing.id, data, overrideAccess: true });
    return { id: existing.id, created: false };
  }
  const doc = await payload.create({
    collection: "ad-accounts",
    data: { ...data, platform, externalId: account.externalId },
    overrideAccess: true,
  });
  return { id: doc.id, created: true };
}

/** Ce qu'effacerait la suppression définitive d'un compte. */
export type PurgeImpact = { campaigns: number; metrics: number };

export async function purgeImpact(payload: Payload, id: number | string): Promise<PurgeImpact> {
  const where = { account: { equals: id } };
  const [campaigns, metrics] = await Promise.all([
    payload.count({ collection: "ad-campaigns", where, overrideAccess: true }),
    payload.count({ collection: "ad-metrics-daily", where, overrideAccess: true }),
  ]);
  return { campaigns: campaigns.totalDocs, metrics: metrics.totalDocs };
}

/** La confirmation portait-elle sur les chiffres actuels ? Sinon, on redemande. */
export const sameImpact = (a: PurgeImpact, b: Partial<PurgeImpact> | null | undefined): boolean =>
  Boolean(b) && a.campaigns === b!.campaigns && a.metrics === b!.metrics;

/** Contexte qui autorise la suppression : posé par la route de purge, et par elle seule. */
export const PURGE_CONTEXT = "adsAccountPurge";
