import type { PayloadHandler } from "payload";

import {
  convertLexicalToMarkdown,
  editorConfigFactory,
} from "@payloadcms/richtext-lexical";

import {
  featureExportFilename,
  featureExportText,
  featureToImportJson,
  type FeatureSource,
} from "@/modules/editorial/import/featureExport";

/**
 * Endpoint GET `/payload-api/features/:id/export`.
 *
 * Rend une feature dans le format que l'IMPORT sait relire — le miroir exact
 * de importFeatureHandler. On peut ainsi reprendre une fiche existante pour la
 * faire relire, la décliner sur une fonctionnalité voisine, ou corriger une
 * série de parties d'un coup, au lieu de tout réécrire.
 *
 * ⚠️ Les MÉDIAS n'en font pas partie, exactement comme à l'import. Un JSON
 * réimporté crée donc une fiche sans ses visuels : c'est dit à l'écran, parce
 * que la surprise se découvrirait sinon après coup, sur un brouillon déjà créé.
 *
 * La lecture passe par le contrôle d'accès de la collection (`overrideAccess`
 * laissé à faux) : qui peut voir la feature peut l'exporter, ni plus ni moins.
 */
export const exportFeatureHandler: PayloadHandler = async (req) => {
  const { payload, user, routeParams } = req;

  const id = routeParams?.id;
  if (id == null) {
    return Response.json({ error: "Identifiant manquant." }, { status: 400 });
  }

  const doc = await payload
    .findByID({
      collection: "features",
      id: String(id),
      depth: 0,
      // Le brouillon, pas la version publiée : on exporte ce qu'on a sous les
      // yeux dans l'éditeur, sinon les modifications en cours seraient perdues.
      draft: true,
      req,
      user,
    })
    .catch(() => null);

  if (!doc) {
    return Response.json({ error: "Feature introuvable ou inaccessible." }, { status: 404 });
  }

  const editorConfig = await editorConfigFactory.default({ config: payload.config });
  const toMarkdown = (rich: unknown): string => {
    if (!rich || typeof rich !== "object") return "";
    try {
      return convertLexicalToMarkdown({ data: rich as never, editorConfig }).trim();
    } catch (err) {
      // Un champ qu'on ne sait pas reconvertir ne doit pas emporter tout
      // l'export : on rend le reste, et on le dit dans les journaux.
      payload.logger.warn(`[features] conversion Markdown impossible sur ${id} : ${err}`);
      return "";
    }
  };

  const feature = featureToImportJson(doc as FeatureSource, toMarkdown);

  return Response.json({
    json: featureExportText(feature),
    filename: featureExportFilename(feature.title),
  });
};
