import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";

/**
 * GET — le prompt de l'image d'un article pour Claude Design (charte « 5a — Éditorial doux »,
 * 19/11/2026) : le texte de la direction, bloc « À REMPLIR » rempli avec les données de
 * l'article : catégorie (la couleur), H1, mot-clé et points clés. Rend aussi le
 * texte alternatif, la légende et le nom de fichier suggérés. Réservé aux administrateurs.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  const { id } = await params;
  const a = (await payload.findByID({ collection: "articles" as never, id, depth: 1, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null;
  if (!a) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  const ch = await import("@/modules/editorial/lib/visual/charte");
  const draft = (a.draft ?? {}) as Record<string, unknown>;
  const title = String(a.title || draft.title || "").trim();
  const keyword = String(a.keyword || a.wpFocusKeyword || "").trim();
  const theme = a.theme && typeof a.theme === "object" ? (a.theme as Record<string, unknown>) : null;
  const category = ch.categoryOf(theme ? Number(theme.number) : null, title);
  // Le contenu publié (copie ACF de WordPress), sinon le brouillon rédigé.
  const acf = (a.acf && typeof a.acf === "object" && Object.keys(a.acf).length ? a.acf : draft) as Record<string, unknown>;
  const sections = Array.isArray(acf.contenu) ? (acf.contenu as Record<string, unknown>[]).flatMap((c) => [...String(c?.texte ?? "").matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => m[1])) : [];
  const keyPoints = ch.keyPointsOf(acf.introduction, sections);
  const guess = ch.motifOf(title, category);
  return NextResponse.json({
    prompt: ch.buildImagePrompt({ title, category, keyword, keyPoints }),
    category,
    suggestions: { alt: ch.altText(guess, category, keyword || title), caption: ch.captionOf(keyword, title), fileName: `${ch.fileSlug(keyword, title)}.webp` },
  });
}
