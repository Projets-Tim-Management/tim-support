import type { Payload } from "payload";

import { htmlToText } from "@/core/lib/html";
import { topicTokens } from "@/modules/editorial/lib/articles/cannibal";
import { loadSitemap } from "@/modules/editorial/lib/articles/writer/prep";

/**
 * LES SUGGESTIONS DE LIENS INTERNES (étape 5 du module de note, 19/11/2026) : nos articles,
 * nos fiches métier et les pages du site (produit, outils) proches du sujet d'un article et
 * PAS ENCORE liées depuis lui, avec l'expression du texte qui peut porter le lien. Rien n'est
 * inséré tout seul : la direction (ou le rédacteur) choisit.
 */

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const clean = (u: string) => u.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();

export type LinkCandidate = { url: string; label: string; keyword?: string | null; kind: "article" | "fiche" | "page"; clicks?: number | null };
export type LinkSuggestion = LinkCandidate & { score: number; anchor: string | null };

/** Les adresses déjà liées dans un HTML. Pure. */
export function linkedUrls(html: string): Set<string> {
  return new Set([...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => clean(m[1].replace(/^\//, "https://tim-management.co/"))));
}

/** L'expression du texte qui peut porter le lien : le mot-clé de la cible s'il y figure, sinon son titre. Pure. */
function anchorIn(text: string, c: LinkCandidate): string | null {
  const t = ` ${fold(text).replace(/[^a-z0-9]+/g, " ")} `;
  for (const phrase of [c.keyword, c.label].filter(Boolean) as string[]) {
    const f = fold(phrase).replace(/[^a-z0-9]+/g, " ").trim();
    if (f.length >= 6 && t.includes(` ${f} `)) return phrase;
  }
  return null;
}

/** Classe les pages à lier. Pure (testée). */
export function rankLinks(o: { text: string; html: string; selfUrl?: string | null; candidates: LinkCandidate[]; limit?: number }): LinkSuggestion[] {
  // Combien de fois chaque mot porteur revient dans le texte : un mot cité une fois (un appel à
  // l'action, une parenthèse) ne suffit pas à rapprocher deux sujets.
  const freq = new Map<string, number>();
  for (const w of o.text.split(/\s+/)) for (const t of topicTokens(w)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const already = linkedUrls(o.html);
  const self = o.selfUrl ? clean(o.selfUrl) : null;
  const out: LinkSuggestion[] = [];
  for (const c of o.candidates) {
    const u = clean(c.url);
    if (!u || u === self || already.has(u)) continue;
    const toks = topicTokens(`${c.label} ${c.keyword ?? ""}`);
    if (toks.size < 2) continue;
    let common = 0;
    let weight = 0;
    for (const w of toks) {
      const n = freq.get(w) ?? 0;
      if (n) common++;
      weight += Math.min(n, 3) / 3;
    }
    const score = weight / toks.size;
    if (common < 2 || score < 0.5) continue;
    out.push({ ...c, score: Math.round(score * 100) / 100, anchor: anchorIn(o.text, c) });
  }
  return out.sort((a, b) => Number(Boolean(b.anchor)) - Number(Boolean(a.anchor)) || b.score - a.score || Number(b.clicks ?? 0) - Number(a.clicks ?? 0)).slice(0, o.limit ?? 6);
}

/** Les pages du plan du site hors articles et fiches, avec un libellé tiré de l'adresse. Pure. */
export function sitePages(urls: string[]): LinkCandidate[] {
  return urls
    .filter((u) => /tim-management\.co/.test(u) && !/\/(actualite|fiche-metier|metier|blog|category|tag|author)\//.test(u) && !/\/(contact|mentions|cgu|cgv|confidentialite|politique)/.test(u))
    .map((u) => {
      const slug = clean(u).split("/").filter(Boolean).pop() ?? "";
      return { url: u, label: slug.replace(/-/g, " "), kind: "page" as const };
    })
    .filter((c) => c.label && !/^tim management\.co$/.test(c.label));
}

/** Les suggestions pour un article du tableau. */
export async function suggestLinks(payload: Payload, id: number | string): Promise<LinkSuggestion[]> {
  const doc = (await payload.findByID({ collection: "articles" as never, id, depth: 0, overrideAccess: true })) as unknown as Raw;
  const a = Object.keys(obj(doc.acf)).length ? obj(doc.acf) : obj(doc.draft);
  const html = [String(a.introduction ?? ""), ...(Array.isArray(a.contenu) ? (a.contenu as Raw[]).map((b) => String(b.texte ?? "")) : []), String(a.conclusion ?? "")].join("\n");
  const [articles, jobs, sitemap] = await Promise.all([
    payload.find({ collection: "articles" as never, where: { status: { in: ["publie", "a-rafraichir"] } }, pagination: false, depth: 0, overrideAccess: true, select: { title: true, keyword: true, wpFocusKeyword: true, wpLink: true, gscClicks: true } as never }),
    payload.find({ collection: "job-sheets" as never, where: { wpId: { greater_than: 0 } }, pagination: false, depth: 0, overrideAccess: true, select: { title: true, wpLink: true, gscClicks: true } as never }),
    loadSitemap().catch(() => [] as string[]),
  ]);
  const candidates: LinkCandidate[] = [
    ...(articles.docs as unknown as Raw[]).filter((d) => d.wpLink && d.id !== doc.id).map((d) => ({ url: String(d.wpLink), label: String(d.title ?? ""), keyword: String(d.keyword || d.wpFocusKeyword || "") || null, kind: "article" as const, clicks: (d.gscClicks as number) ?? null })),
    ...(jobs.docs as unknown as Raw[]).filter((d) => d.wpLink).map((d) => ({ url: String(d.wpLink), label: `fiche métier ${String(d.title ?? "")}`, keyword: String(d.title ?? ""), kind: "fiche" as const, clicks: (d.gscClicks as number) ?? null })),
    ...sitePages(sitemap),
  ];
  return rankLinks({ text: `${String(doc.title ?? "")}\n${htmlToText(html)}`, html, selfUrl: (doc.wpLink as string) ?? null, candidates });
}
