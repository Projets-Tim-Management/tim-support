import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { csvTemplate } from "@/modules/marketing/lib/portal-csv";
import { sectionByKey } from "@/modules/marketing/lib/portal-sections";

/**
 * GET /api/portal/dossier/<section>/modele → le CSV à remplir.
 *
 * Engendré à la demande depuis le registre, jamais servi depuis un fichier
 * figé : un modèle statique cesserait de correspondre au formulaire dès le
 * premier champ ajouté, et le client s'en apercevrait après avoir rempli
 * quarante lignes.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ section: string }> }) {
  const ctx = await getPortalClient();
  if (!ctx) return new Response("Non autorisé", { status: 401 });

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
