import { htmlToText } from "@/core/lib/html";

/**
 * Un article ou une fiche métier dans la forme du comparateur : tout le texte lu
 * par le visiteur, et ses titres et questions (pour les « Autres questions
 * posées »). Pur ; chargé aussi dans le navigateur (tiroir).
 */

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
const txt = (h: unknown) => htmlToText(String(h ?? ""));
const heads = (html: string) => [...html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)].map((m) => txt(m[1]));

export type CoverageInput = { text: string; headings: string[] };

/** Article : la copie WordPress si elle existe, sinon l'article rédigé. */
export function articleCoverageInput(doc: Raw): CoverageInput {
  const a = Object.keys(obj(doc.acf)).length ? obj(doc.acf) : obj(doc.draft);
  const title = String(doc.title ?? a.title ?? "");
  const blocks = arr(a.contenu).map((b) => String(b.texte ?? ""));
  const faq = arr(a.faq);
  const html = [String(a.introduction ?? ""), ...blocks, String(a.conclusion ?? "")].join("\n");
  return {
    text: [title, txt(html), ...faq.map((q) => `${String(q.titre ?? "")} ${txt(q.text)}`)].join("\n"),
    headings: [title, ...heads(html), ...faq.map((q) => String(q.titre ?? ""))].filter(Boolean),
  };
}

/** Fiche métier : définition, synonymes, points clés, chiffres, certifications, FAQ. */
export function jobCoverageInput(doc: Raw): CoverageInput {
  const acf = obj(doc.acf);
  const vals = (v: unknown) => arr(v).map((x) => String(x.valeur ?? ""));
  const faq = arr(obj(acf.faq).items);
  const stats = arr(obj(acf.statistiques).items).map((s) => `${String(s.label ?? "")} ${String(s.valeur ?? "")}`);
  const certs = arr(obj(acf.certifications).items).map((c) => String(c.intitule ?? ""));
  const title = String(doc.title ?? "");
  return {
    text: [title, String(acf.definition ?? ""), ...vals(acf.synonymes), ...vals(acf.points_cles), ...stats, ...certs, ...faq.map((q) => `${String(q.question ?? "")} ${String(q.reponse ?? "")}`)].join("\n"),
    headings: [title, ...faq.map((q) => String(q.question ?? ""))].filter(Boolean),
  };
}

/** La requête analysée : le mot-clé de l'article ; pour une fiche, « fiche métier <métier> ». */
export function analysisKeyword(kind: "articles" | "job-sheets", doc: Raw): string {
  if (kind === "articles") return String(doc.keyword || doc.wpFocusKeyword || "").trim();
  const t = String(doc.title ?? "").trim();
  return t ? `fiche métier ${t.toLowerCase()}` : "";
}

export const keywordKey = (k: string) => k.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
