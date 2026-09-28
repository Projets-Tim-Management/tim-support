import { PRICES_VAR, type ContractVars } from "@/modules/partner/lib/contract-vars";

/**
 * Le texte du modèle → une structure de blocs, prête à mettre en page.
 *
 * Module PUR (ni React, ni PDF) : l'aperçu, le PDF et les tests lisent la même
 * interprétation du texte. La syntaxe, pensée pour être tapée par TIM dans un
 * simple champ texte :
 *
 *   paragraphes séparés par une ligne vide (les retours à la ligne internes
 *   sont gardés) ; `- ` liste ; `### ` sous-titre ; `**gras**` ;
 *   `Terme :: définition` (tableau de définitions) ; `>` aligné à droite ;
 *   `^` centré ; `{{variable}}` ; `{{licences.tableau}}` et `{{signatures}}`
 *   seuls sur leur ligne ; `[[si variable]] … [[sinon]] … [[/si]]`.
 *
 * Une variable vide devient « [à compléter] », marquée `missing` : le PDF la
 * surligne, et l'envoi est bloqué tant qu'il en reste.
 */

/** `filled` : texte venu d'une variable — surligné dans les aperçus de travail. */
export type Run = { text: string; bold?: boolean; missing?: boolean; filled?: boolean };

export type Block =
  | { type: "p"; align?: "left" | "right" | "center"; runs: Run[] }
  | { type: "h"; runs: Run[] }
  | { type: "list"; items: Run[][] }
  | { type: "defs"; rows: { term: Run[]; def: Run[] }[] }
  | { type: "prices" }
  | { type: "signatures" };

export type TemplateSection = { key: string; title: string; kind: "preambule" | "article" | "annexe"; body: string };

type RenderedSection = {
  key: string;
  title: string;
  kind: TemplateSection["kind"];
  blocks: Block[];
  /** La section a été personnalisée pour ce client. */
  custom: boolean;
};

export type RenderedContract = {
  title: string;
  sections: RenderedSection[];
  /** Variables utilisées dans le texte affiché, et vides (sans doublon). */
  missing: string[];
};

export const MISSING_TEXT = "[à compléter]";

const truthy = (v: string | boolean | null | undefined): boolean =>
  v === true || (typeof v === "string" && v.trim() !== "");

/** `[[si x]] … [[sinon]] … [[/si]]` → la branche qui s'applique. */
export function resolveConditionals(body: string, vars: ContractVars): string {
  return body.replace(
    /\[\[si\s+([\w.]+)\]\]([\s\S]*?)(?:\[\[sinon\]\]([\s\S]*?))?\[\[\/si\]\]/g,
    (_m, name: string, yes: string, no?: string) => (truthy(vars[name]) ? yes : (no ?? "")),
  );
}

/** Texte avec `**gras**` et `{{variables}}` → segments. */
export function inlineRuns(text: string, vars: ContractVars, missing: Set<string>): Run[] {
  const runs: Run[] = [];
  // Le gras d'abord (il peut contenir des variables), puis les variables.
  const parts = text.split(/(\*\*[\s\S]+?\*\*)/g).filter((p) => p !== "");
  for (const part of parts) {
    const bold = part.startsWith("**") && part.endsWith("**") && part.length > 4;
    const inner = bold ? part.slice(2, -2) : part;
    for (const piece of inner.split(/(\{\{\s*[\w.]+\s*\}\})/g).filter((p) => p !== "")) {
      const m = piece.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
      if (!m) {
        runs.push({ text: piece, ...(bold ? { bold } : {}) });
        continue;
      }
      const value = vars[m[1]];
      if (typeof value === "string" && value.trim()) runs.push({ text: value, filled: true, ...(bold ? { bold } : {}) });
      else if (value === true) runs.push({ text: "oui", filled: true, ...(bold ? { bold } : {}) });
      else {
        missing.add(m[1]);
        runs.push({ text: MISSING_TEXT, missing: true, ...(bold ? { bold } : {}) });
      }
    }
  }
  return runs;
}

/** Le corps d'une section → blocs. */
export function parseBody(body: string, vars: ContractVars, missing: Set<string>): Block[] {
  const text = resolveConditionals(body, vars);
  const blocks: Block[] = [];
  let para: string[] = [];
  let align: "left" | "right" | "center" = "left";

  const flush = () => {
    if (!para.length) return;
    blocks.push({
      type: "p",
      ...(align !== "left" ? { align } : {}),
      runs: inlineRuns(para.join("\n"), vars, missing),
    });
    para = [];
    align = "left";
  };

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    if (/^\{\{\s*licences\.tableau\s*\}\}$/.test(line.trim())) {
      flush();
      blocks.push({ type: "prices" });
      continue;
    }
    if (/^\{\{\s*signatures\s*\}\}$/.test(line.trim())) {
      flush();
      blocks.push({ type: "signatures" });
      continue;
    }
    if (line.startsWith("### ")) {
      flush();
      blocks.push({ type: "h", runs: inlineRuns(line.slice(4), vars, missing) });
      continue;
    }
    if (/^[-•]\s+/.test(line)) {
      flush();
      const item = inlineRuns(line.replace(/^[-•]\s+/, ""), vars, missing);
      const last = blocks[blocks.length - 1];
      if (last?.type === "list") last.items.push(item);
      else blocks.push({ type: "list", items: [item] });
      continue;
    }
    if (line.includes(" :: ")) {
      flush();
      const [term, ...rest] = line.split(" :: ");
      const row = { term: inlineRuns(term, vars, missing), def: inlineRuns(rest.join(" :: "), vars, missing) };
      const last = blocks[blocks.length - 1];
      if (last?.type === "defs") last.rows.push(row);
      else blocks.push({ type: "defs", rows: [row] });
      continue;
    }
    // Alignement : porté par la première ligne du paragraphe.
    const mark = line[0] === ">" ? "right" : line[0] === "^" ? "center" : "left";
    if (mark !== "left") {
      if (para.length && align !== mark) flush();
      align = mark;
      para.push(line.slice(1));
      continue;
    }
    if (para.length && align !== "left") flush();
    para.push(line);
  }
  flush();
  return blocks;
}

/**
 * Le contrat rendu : sections du modèle, remplacées par leur version
 * personnalisée pour ce client quand il y en a une (`overrides`, par clé).
 *
 * `hasPrices: false` : aucune licence tarifée — si le texte affiche le tableau
 * des tarifs, il manque (le PDF y écrit « [à compléter] ») et bloque l'envoi
 * comme une variable vide. Non renseigné : pas de contrôle.
 */
export function renderContract(
  template: { title: string; sections: TemplateSection[] },
  vars: ContractVars,
  overrides: Record<string, string> = {},
  opts: { hasPrices?: boolean } = {},
): RenderedContract {
  const missing = new Set<string>();
  const sections = template.sections.map((s) => {
    const custom = typeof overrides[s.key] === "string";
    return {
      key: s.key,
      title: s.title,
      kind: s.kind,
      custom,
      blocks: parseBody(custom ? overrides[s.key] : s.body, vars, missing),
    };
  });
  if (opts.hasPrices === false && sections.some((sec) => sec.blocks.some((b) => b.type === "prices"))) {
    missing.add(PRICES_VAR);
  }
  return { title: template.title, sections, missing: [...missing] };
}
