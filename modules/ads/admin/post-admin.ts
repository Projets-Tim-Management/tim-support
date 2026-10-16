/**
 * Un geste de l'admin des pubs : POST vers une route /api/admin/ads/…, en JSON
 * s'il y a un corps. Lève l'erreur que le serveur a écrite (sinon le code
 * HTTP), pour que le toast dise pourquoi ; rend la réponse sinon.
 */
export async function postAdmin<T extends object = Record<string, unknown>>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || String(res.status));
  return data;
}
