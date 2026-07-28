import type { PayloadHandler } from "payload";

import {
  convertMarkdownToLexical,
  editorConfigFactory,
} from "@payloadcms/richtext-lexical";

import { hasAdminRole } from "@/core/access";
import { AVAILABILITY_VALUES } from "@/modules/editorial/lib/availability";

/**
 * Endpoint POST `/payload-api/features/import`.
 *
 * Reçoit le JSON rempli par Claude (voir featureTemplate.ts), convertit les
 * champs Markdown en état Lexical, et crée une feature EN BROUILLON.
 * Les médias/images ne sont pas gérés ici (à ajouter à la main ensuite).
 */

const MEDIA_POS = new Set(["droite", "gauche"]);

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

export const importFeatureHandler: PayloadHandler = async (req) => {
  const { payload, user } = req;

  // Création réservée aux admins (aligné sur editorialAccess.create = isAdmin).
  if (!hasAdminRole(user)) {
    return Response.json({ error: "Accès réservé aux administrateurs." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = typeof req.json === "function" ? await req.json() : (req.data ?? {});
  } catch {
    return Response.json(
      { error: "JSON invalide : vérifie que tu as collé le bloc complet (accolades comprises)." },
      { status: 400 },
    );
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Contenu vide ou illisible." }, { status: 400 });
  }

  const title = str(body.title);
  if (!title) {
    return Response.json({ error: 'Le champ « title » est obligatoire.' }, { status: 400 });
  }

  // Convertisseur Markdown → Lexical (partagé pour intro + descriptions).
  const editorConfig = await editorConfigFactory.default({ config: payload.config });
  const toRich = (md: unknown) => {
    const s = str(md);
    return s ? convertMarkdownToLexical({ editorConfig, markdown: s }) : undefined;
  };

  const keywords = Array.isArray(body.keywords)
    ? body.keywords.filter((k): k is string => typeof k === "string" && k.trim() !== "")
    : undefined;

  const rawParties = Array.isArray(body.parties) ? body.parties : [];
  const doc = rawParties
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      titleDoc: str(p.titre) ?? str(p.titleDoc),
      descriptionDoc: toRich(p.description ?? p.descriptionDoc),
      mediaPosition: MEDIA_POS.has(p.mediaPosition as string)
        ? (p.mediaPosition as string)
        : "droite",
    }));

  const data = {
    title,
    titleFeature: str(body.titleFeature),
    shortDescription: str(body.shortDescription),
    keywords,
    availability: AVAILABILITY_VALUES.has(body.availability as string)
      ? (body.availability as string)
      : "disponible",
    content: toRich(body.intro ?? body.content),
    doc,
  };

  try {
    const created = await payload.create({
      collection: "features",
      // Champs custom validés ci-dessus ; le type strict des collections n'est
      // pas connu ici (payload-types régénéré au build) → cast volontaire.
      data: data as never,
      draft: true, // brouillon : on relit/complète avant publication
      req, // conserve l'auth → contrôle d'accès appliqué
      overrideAccess: false,
    });
    return Response.json({ id: created.id, title: created.title, parts: doc.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    return Response.json({ error: `Échec de la création : ${message}` }, { status: 500 });
  }
};
