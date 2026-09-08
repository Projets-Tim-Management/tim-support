import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { csvTemplate } from "@/modules/marketing/lib/portal-csv";
import { sectionByKey } from "@/modules/marketing/lib/portal-sections";

/**
 * GET /api/admin/dossier/<section>/modele — le même CSV que côté client.
 *
 * Engendré depuis le registre, jamais servi depuis un fichier figé : deux
 * modèles séparés divergeraient au premier champ ajouté, et on enverrait au
 * client un fichier que notre propre console refuserait.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ section: string }> }) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return new Response("Interdit", { status: 403 });

  const section = sectionByKey((await params).section);
  if (!section) return new Response("Section inconnue", { status: 404 });

  return new Response(csvTemplate(section), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="modele-${section.key}.csv"`,
      "cache-control": "no-store",
    },
  });
}
