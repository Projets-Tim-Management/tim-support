/**
 * Les régies publicitaires — registre (plan Publicité, D2 et D3).
 *
 * La régie se stocke en TEXTE validé par ce registre, pas en enum Postgres :
 * ajouter Google Ads ou ChatGPT Ads, c'est une entrée ici et un adaptateur,
 * sans migration. Le reste du module (écrans, synchro, plus tard les agents) ne
 * connaît aucune régie par son nom.
 */
export const AD_PLATFORMS = [
  { key: "meta", label: "Meta" },
  { key: "google", label: "Google Ads" },
  { key: "chatgpt", label: "ChatGPT Ads" },
] as const satisfies readonly { key: string; label: string }[];

export type PlatformKey = (typeof AD_PLATFORMS)[number]["key"];

export const isPlatformKey = (value: unknown): value is PlatformKey =>
  typeof value === "string" && AD_PLATFORMS.some((p) => p.key === value);

export const platformLabel = (value?: string | null): string =>
  AD_PLATFORMS.find((p) => p.key === value)?.label ?? (value || "Régie inconnue");

/** Validation Payload d'un champ texte « régie ». */
export const validatePlatform = (value: unknown): true | string =>
  isPlatformKey(value) ? true : `Régie inconnue : « ${String(value ?? "")} ».`;
