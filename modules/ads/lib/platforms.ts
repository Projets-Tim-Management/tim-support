import type { Channel } from "@/core/lib/channels";

/**
 * Les régies publicitaires — registre (plan Publicité, D2 et D3).
 *
 * La régie se stocke en TEXTE validé par ce registre, pas en enum Postgres :
 * ajouter Google Ads ou ChatGPT Ads, c'est une entrée ici et un adaptateur,
 * sans migration. Le reste du module (écrans, synchro, plus tard les agents) ne
 * connaît aucune régie par son nom.
 *
 * `channels` relie une régie aux canaux d'acquisition qu'elle produit
 * (core/lib/channels.ts) : c'est ce qui permettra de rapprocher une dépense des
 * leads et des affaires gagnées qu'elle a amenés.
 */
export const AD_PLATFORMS = [
  { key: "meta", label: "Meta", channels: ["meta-facebook", "meta-instagram"] },
  { key: "google", label: "Google Ads", channels: ["sea"] },
  { key: "chatgpt", label: "ChatGPT Ads", channels: ["chatgpt"] },
] as const satisfies readonly { key: string; label: string; channels: readonly Channel[] }[];

export type PlatformKey = (typeof AD_PLATFORMS)[number]["key"];

export const isPlatformKey = (value: unknown): value is PlatformKey =>
  typeof value === "string" && AD_PLATFORMS.some((p) => p.key === value);

export const platformLabel = (value?: string | null): string =>
  AD_PLATFORMS.find((p) => p.key === value)?.label ?? (value || "Régie inconnue");

/** Validation Payload d'un champ texte « régie ». */
export const validatePlatform = (value: unknown): true | string =>
  isPlatformKey(value) ? true : `Régie inconnue : « ${String(value ?? "")} ».`;
