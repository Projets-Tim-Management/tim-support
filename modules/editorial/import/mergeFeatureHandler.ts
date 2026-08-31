import type { PayloadHandler } from "payload";

import {
  convertMarkdownToLexical,
  editorConfigFactory,
} from "@payloadcms/richtext-lexical";

import { hasAdminRole } from "@/core/access";
import { AVAILABILITY_VALUES } from "@/modules/editorial/lib/availability";
import { mergeFeatureFromJson } from "@/modules/editorial/import/featureMerge";

/**
 * Endpoint POST `/payload-api/features/:id/merge`.
 *
 * Remet un JSON dans une feature EXISTANTE : seul ce que le JSON contient est
 * écrasé, le reste survit — et surtout les VISUELS, qui ne figurent pas dans le
 * JSON et qu'une fusion naïve effacerait en silence.
 *
 * Le pendant de l'export : on sort le JSON d'une fiche, on le retravaille
 * ailleurs, on le remet. Sans cela il fallait créer un brouillon neuf par
 * l'import, puis rattacher les GIF un par un en devinant lequel allait où.
 *
 * L'écriture se fait EN BROUILLON : la fiche publiée ne bouge pas tant que
 * personne n'a relu. Un JSON venu de l'extérieur ne publie rien tout seul.
 */
export const mergeFeatureHandler: PayloadHandler = async (req) => {
  const { payload, user, routeParams } = req;

  // Modification réservée aux admins, comme l'import.
  if (!hasAdminRole(user)) {
    return Response.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  const id = routeParams?.id;
  if (id == null) return Response.json({ error: "Identifiant manquant." }, { status: 400 });

  let json: Record<string, unknown>;
  try {
    const brut = typeof req.json === "function" ? await req.json() : req.data;
    if (!brut || typeof brut !== "object" || Array.isArray(brut)) throw new Error("forme");
    json = brut as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "JSON invalide : vérifie que tu as collé le bloc complet (accolades comprises)." },
      { status: 400 },
    );
  }

  const existant = (await payload
    .findByID({ collection: "features", id: String(id), depth: 0, draft: true, overrideAccess: true })
    .catch(() => null)) as { doc?: unknown } | null;
  if (!existant) return Response.json({ error: "Feature introuvable." }, { status: 404 });

  const editorConfig = await editorConfigFactory.default({ config: payload.config });
  const toRich = (markdown: string) => convertMarkdownToLexical({ editorConfig, markdown });

  const patch = mergeFeatureFromJson(existant, json, toRich, AVAILABILITY_VALUES);
  if (Object.keys(patch).length === 0) {
    return Response.json(
      { error: "Ce JSON ne contient aucun champ reconnu — rien n'a été modifié." },
      { status: 400 },
    );
  }

  try {
    await payload.update({
      collection: "features",
      id: String(id),
      data: patch as never,
      draft: true,
      overrideAccess: true,
      user,
    });
  } catch (err) {
    payload.logger.error(`[features] fusion du JSON sur ${id} échouée : ${err}`);
    const cause = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `Mise à jour impossible : ${cause.slice(0, 300)}` },
      { status: 400 },
    );
  }

  payload.logger.info(
    `[features] feature ${id} mise à jour depuis un JSON (${Object.keys(patch).join(", ")}).`,
  );
  return Response.json({ ok: true, champs: Object.keys(patch) });
};
