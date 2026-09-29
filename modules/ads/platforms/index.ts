import type { PlatformKey } from "@/modules/ads/lib/platforms";
import { META_DEFAULT_VERSION, createMetaPlatform } from "@/modules/ads/platforms/meta";
import { createMockMetaPlatform } from "@/modules/ads/platforms/meta-mock";
import type { AdPlatform } from "@/modules/ads/platforms/types";

/**
 * L'adaptateur d'une régie — le seul endroit qui sait lequel instancier.
 *
 * Meta tourne sur des données SIMULÉES tant que `ADS_META_MOCK=1` : l'app Meta
 * et son jeton ne sont pas encore fournis. Le drapeau est lu à chaque appel, pas
 * figé au chargement : le retirer sur Vercel suffit à basculer.
 */

type Env = Record<string, string | undefined>;

export const isMetaMock = (env: Env = process.env): boolean => env.ADS_META_MOCK === "1";

/** Une régie dont l'adaptateur n'est pas configuré dit POURQUOI, au lieu d'échouer plus loin. */
export class PlatformNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformNotConfigured";
  }
}

export function getPlatform(key: PlatformKey | string, env: Env = process.env): AdPlatform {
  if (key === "meta") {
    if (isMetaMock(env)) return createMockMetaPlatform();
    const appId = env.META_APP_ID?.trim();
    const appSecret = env.META_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      throw new PlatformNotConfigured("Meta : META_APP_ID et META_APP_SECRET manquent (ou ADS_META_MOCK=1 pour les données simulées).");
    }
    return createMetaPlatform({
      appId,
      appSecret,
      version: env.META_GRAPH_VERSION?.trim() || META_DEFAULT_VERSION,
      fetch: (url, init) => fetch(url, init),
      now: () => new Date(),
    });
  }
  throw new PlatformNotConfigured(`Aucun adaptateur pour la régie « ${key} » (prévu : phases 5 et 6).`);
}
