import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";

/**
 * GET — le prompt de l'image d'un article pour Claude Design (charte « 5a — Éditorial doux »,
 * 19/11/2026) : le texte de la direction, bloc « À REMPLIR » rempli avec les données de
 * l'article. `?motif=` et `?italic=` forcent le motif et les mots en italique. Rend aussi le
 * texte alternatif, la légende et le nom de fichier suggérés. Réservé aux administrateurs.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const a = (await payload.findByID({ collection: "articles" as never, id, depth: 1, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null;
  if (!a) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });
  const ch = await import("@/modules/editorial/lib/visual/charte");
  const draft = (a.draft ?? {}) as Record<string, unknown>;
  const title = String(a.title || draft.title || "").trim();
  const keyword = String(a.keyword || a.wpFocusKeyword || "").trim();
  const theme = a.theme && typeof a.theme === "object" ? (a.theme as Record<string, unknown>) : null;
  const category = ch.categoryOf(theme ? Number(theme.number) : null, title);
  const forcedItalic = String(q.get("italic") ?? a.visualItalic ?? "").trim();
  const italic = forcedItalic && title.toLowerCase().includes(forcedItalic.toLowerCase()) ? forcedItalic : ch.splitKeyword(ch.frenchSpacing(title), keyword || title)[1];
  const motifParam = q.get("motif");
  const motif = (motifParam ?? (a.visualMotif as string | null) ?? "") || null;
  const guess = (motif as never) ?? ch.motifOf(title, category);
  return NextResponse.json({
    prompt: ch.buildImagePrompt({ title, category, keyword, italic, motif }),
    category,
    italic,
    motif: motif ?? "auto",
    suggestions: { alt: ch.altText(guess, category, keyword || title), caption: ch.captionOf(keyword, title), fileName: `${ch.fileSlug(keyword, title)}.webp` },
  });
}
