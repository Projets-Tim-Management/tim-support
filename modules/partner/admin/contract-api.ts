/**
 * Petits outils partagés par les écrans « contrat » de l'admin (encart de la
 * fiche, contresignature, passage « Gagnée ») — une seule copie de chaque.
 */

/**
 * Réglages du lecteur PDF du navigateur : sans le panneau des miniatures, à
 * 72 % — la page entière tient dans la colonne d'aperçu.
 */
export const PDF_VIEW = "#navpanes=0&zoom=72";

/** L'adresse d'un PDF avec ces réglages — sauf si elle porte déjà les siens. */
export const viewerUrl = (url: string) => (url.includes("#") ? url : `${url}${PDF_VIEW}`);

/**
 * Appel JSON à une route admin. En cas d'échec, l'erreur porte le message du
 * serveur, son code (`code`), le corps (`body`) et le statut HTTP.
 */
export async function adminApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) {
    throw Object.assign(new Error(body.message ?? body.error ?? "Erreur"), {
      code: body.error,
      body,
      status: res.status,
    });
  }
  return body;
}

type ContractStart = { date: string; reference: string };

/**
 * La date de début prévue AU CONTRAT généré d'un client (elle prime sur la
 * fiche). null si aucun contrat n'en fixe, ou si l'appel échoue — ce n'est
 * qu'une proposition. `signal` : annuler quand l'écran change de client.
 */
export async function fetchContractStart(
  clientId: number | string,
  signal?: AbortSignal,
): Promise<ContractStart | null> {
  try {
    const res = await fetch(`/api/admin/contracts?clientId=${clientId}`, { credentials: "include", signal });
    if (!res.ok) return null;
    const d = (await res.json()) as { contractStart?: ContractStart | null };
    return d.contractStart ?? null;
  } catch {
    return null;
  }
}
