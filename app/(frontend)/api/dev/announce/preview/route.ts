import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { buildAnnounceEmail } from "@/modules/dev/lib/announce-email";
import { readAnnounceSettings } from "@/modules/dev/lib/announce-settings";

/**
 * Rendu de l'e-mail « C'est disponible » sur un exemple fictif, pour l'écran
 * de réglage. Régénéré par `buildAnnounceEmail` — la fonction de l'envoi réel —
 * à partir des réglages enregistrés : ce qu'on regarde est ce qui partira.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return new Response("Accès refusé", { status: 403 });

  const settings = await readAnnounceSettings(payload);
  const { html } = buildAnnounceEmail({
    title: "Export des heures & absences",
    contactFirstName: "Karim",
    bookingUrl: "https://exemple.fr/reserver",
    featureSlug: "exemple",
    featureTitle: "Exporter les heures",
    recipientEmail: "karim@exemple.fr",
    ...settings,
  });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
