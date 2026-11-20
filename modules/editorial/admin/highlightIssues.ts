/**
 * SURLIGNAGE DES PASSAGES À CORRIGER (tiroir, 19/11/2026).
 *
 * Les alertes du contrôle citent le passage fautif entre « ». On le retrouve dans les éditeurs du
 * document et on le surligne avec l'API « CSS Custom Highlight » : AUCUNE balise n'est ajoutée au
 * texte, donc rien de ce surlignage ne peut partir dans WordPress. Navigateur sans cette API : rien
 * ne se passe (la liste rouge reste).
 */

/** Les passages cités par les alertes : la dernière citation « … » de chaque alerte. Pur. */
export function quotedPassages(alerts: string[]): string[] {
  const out = new Set<string>();
  for (const a of alerts) {
    const all = [...a.matchAll(/«\s*([^«»]+?)\s*»/g)].map((m) => m[1]);
    // Marque : la forme fautive est la 1re citation ; ailleurs, la phrase est la dernière.
    const q = /Marque mal écrite/.test(a) ? all[0] : all[all.length - 1];
    if (q && q.replace(/…$/, "").trim().length >= 2) out.add(q.replace(/…$/, "").trim());
  }
  return [...out];
}

const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/[  ]/g, " ");

// Le style du surlignage, posé à l'exécution : le compilateur de styles du projet ne connaît pas
// encore le pseudo-élément ::highlight() et refusait la feuille entière (19/11/2026).
const STYLE_ID = "cdx-issue-style";
function ensureStyle(name: string) {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `::highlight(${name}) { background-color: rgba(220, 38, 38, 0.22); color: #b91c1c; text-decoration: underline wavy #dc2626; }`;
  document.head.appendChild(el);
}

/** Surligne chaque passage dans les éléments donnés (texte réparti sur plusieurs nœuds compris). */
export function highlightIn(roots: Element[], passages: string[], name = "cdx-issue"): number {
  ensureStyle(name);
  const reg = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
  const HighlightCtor = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  if (!reg || !HighlightCtor) return 0;
  const ranges: Range[] = [];
  for (const root of roots) {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    // Le texte de l'éditeur bout à bout, et où commence chaque nœud.
    let text = "";
    const starts: number[] = [];
    for (const n of nodes) {
      starts.push(text.length);
      text += norm(n.data);
    }
    const flat = text.replace(/\s/g, " ");
    const at = (pos: number): [Text, number] => {
      let i = starts.length - 1;
      while (i > 0 && starts[i] > pos) i--;
      return [nodes[i], pos - starts[i]];
    };
    for (const p of passages) {
      const needle = norm(p).replace(/\s+/g, " ");
      const brand = /^tim( management)?$/i.test(needle);
      let from = 0;
      for (;;) {
        // La marque : la forme fautive exacte (casse comprise), mot entier ; une phrase : sans casse.
        const idx = brand ? findWord(flat, needle, from) : flat.toLowerCase().indexOf(needle.toLowerCase(), from);
        if (idx < 0 || !nodes.length) break;
        const r = document.createRange();
        const [sn, so] = at(idx);
        const [en, eo] = at(idx + needle.length);
        r.setStart(sn, Math.min(so, sn.length));
        r.setEnd(en, Math.min(eo, en.length));
        ranges.push(r);
        from = idx + needle.length;
      }
    }
  }
  reg.set(name, new HighlightCtor(...ranges));
  return ranges.length;
}

function findWord(text: string, word: string, from: number): number {
  for (let i = text.indexOf(word, from); i >= 0; i = text.indexOf(word, i + 1)) {
    const before = text[i - 1] ?? " ";
    const after = text[i + word.length] ?? " ";
    // « Tim » seul : pas suivi de « Management » (sinon c'est la forme « Tim Management », signalée à part).
    if (/\w/.test(before) || /\w/.test(after)) continue;
    if (word === "Tim" && /^\s+management/i.test(text.slice(i + 3))) continue;
    return i;
  }
  return -1;
}

export function clearHighlights(name = "cdx-issue") {
  (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights?.delete(name);
}
