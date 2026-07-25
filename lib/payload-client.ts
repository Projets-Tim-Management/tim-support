import config from "@payload-config";
import { getPayload } from "payload";

/**
 * Instance Payload partagée pour le front (Server Components / route handlers).
 * Utilise la Local API — pas d'appel HTTP, pas de collision de routes.
 */
let cached: Awaited<ReturnType<typeof getPayload>> | null = null;

export async function payloadClient() {
  if (!cached) cached = await getPayload({ config });
  return cached;
}
