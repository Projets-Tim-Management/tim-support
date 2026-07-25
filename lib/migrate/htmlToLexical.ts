import {
  convertHTMLToLexical,
  editorConfigFactory,
} from "@payloadcms/richtext-lexical";
import { JSDOM } from "jsdom";
import type { Payload } from "payload";

/**
 * Convertit du HTML (contenu WordPress) en état Lexical éditable par Payload.
 * La config d'éditeur est mise en cache (une seule sanitisation par process).
 */
let cachedEditorConfig: Awaited<
  ReturnType<typeof editorConfigFactory.default>
> | null = null;

export async function htmlToLexical(payload: Payload, html: string) {
  if (!html || !html.trim()) return undefined;

  if (!cachedEditorConfig) {
    cachedEditorConfig = await editorConfigFactory.default({
      config: payload.config,
    });
  }

  return convertHTMLToLexical({
    editorConfig: cachedEditorConfig,
    html,
    JSDOM,
  });
}

/** Retire les balises HTML pour obtenir un texte simple (champs textarea). */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;/g, "’")
    .replace(/\s+/g, " ")
    .trim();
}
