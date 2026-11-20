/**
 * Équivalents exacts des primitives Python dont dépend la validation des articles
 * (portage de tim-management/validation.py). Voir docs/articles/inventaire-pipeline-python/
 * socle-code.md, § 12 « Points fragiles » : chaque fonction ici répond à l'un d'eux.
 */

// ── Expressions régulières ────────────────────────────────────────────────────

/** `\w` de Python 3 (str) : lettre, chiffre ou nombre Unicode, ou « _ » (pas les marques combinantes). */
const W_CLASS_BODY = String.raw`\p{L}\p{N}_`;
/** `\s` de Python 3 (str.isspace) : diffère de `\s` JS (ajoute \x1c-\x1f et \x85, retire \ufeff). */
const S_CLASS_BODY = String.raw`\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000`;
const W = `[${W_CLASS_BODY}]`;
/** `\b` de Python : frontière entre un caractère de mot Unicode et un autre (ou le bord). */
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;

export const PY_WS_RE = new RegExp(`[${S_CLASS_BODY}]+`, "gu");
const PY_WS_EDGE_START = new RegExp(`^[${S_CLASS_BODY}]+`, "u");
const PY_WS_EDGE_END = new RegExp(`[${S_CLASS_BODY}]+$`, "u");

function swapCase(c: string): string {
  const lo = c.toLowerCase();
  const up = c.toUpperCase();
  if (lo !== c && lo.length === c.length) return lo;
  if (up !== c && up.length === c.length) return up;
  return "";
}

/**
 * Traduit une regex écrite en syntaxe Python (str) vers une RegExp JS au comportement identique :
 * `\b`, `\w`, `\s` Unicode comme en Python, et modificateur local `(?i:…)` remplacé par des classes
 * explicites (`[sS]`), la casse du reste du motif restant significative. Le drapeau `u` est toujours ajouté.
 * `\d` reste ASCII (Python accepte tous les chiffres décimaux Unicode : sans effet sur du français).
 */
export function pyRe(src: string, flags = ""): RegExp {
  let out = "";
  let inClass = false;
  const ciStack: boolean[] = [];
  const ci = () => ciStack.some(Boolean);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      const n = src[i + 1];
      if ((n === "p" || n === "P") && src[i + 2] === "{") {
        const end = src.indexOf("}", i);
        out += src.slice(i, end + 1);
        i = end;
        continue;
      }
      if (n === "u" || n === "x") {
        const len = n === "u" ? 4 : 2;
        out += src.slice(i, i + 2 + len);
        i += 1 + len;
        continue;
      }
      i++;
      if (n === "b" && !inClass) out += B;
      else if (n === "w") out += inClass ? W_CLASS_BODY : W;
      else if (n === "s") out += inClass ? S_CLASS_BODY : `[${S_CLASS_BODY}]`;
      else if (n === "S" && !inClass) out += `[^${S_CLASS_BODY}]`;
      else if (n === "W" && !inClass) out += `[^${W_CLASS_BODY}]`;
      else out += "\\" + n;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      out += c;
      if (c !== "]" && ci()) out += swapCase(c);
      continue;
    }
    if (c === "[") {
      inClass = true;
      out += c;
      if (src[i + 1] === "^") {
        out += "^";
        i++;
      }
      continue;
    }
    if (c === "(") {
      if (src.startsWith("(?i:", i)) {
        ciStack.push(true);
        out += "(?:";
        i += 3;
        continue;
      }
      ciStack.push(false);
      out += c;
      continue;
    }
    if (c === ")") {
      ciStack.pop();
      out += c;
      continue;
    }
    if (ci()) {
      const o = swapCase(c);
      out += o ? `[${c}${o}]` : c;
      continue;
    }
    out += c;
  }
  const f = flags.includes("u") ? flags : flags + "u";
  return new RegExp(out, f);
}

function globalOf(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
}

/** `re.finditer` : toutes les correspondances, sans état partagé. */
export function finditer(re: RegExp, s: string): RegExpExecArray[] {
  return Array.from(s.matchAll(globalOf(re))) as RegExpExecArray[];
}

/** `re.findall` : groupe 1 s'il y a un seul groupe, tuple de groupes s'il y en a plusieurs, sinon le texte. */
export function findall(re: RegExp, s: string): string[] {
  return finditer(re, s).map((m) => (m.length > 1 ? (m[1] ?? "") : m[0]));
}

/** `re.findall` avec plusieurs groupes : chaque élément est la liste des groupes (vide → ""). */
export function findallGroups(re: RegExp, s: string): string[][] {
  return finditer(re, s).map((m) => m.slice(1).map((g) => g ?? ""));
}

/** `re.search` : première correspondance ou null. */
export function search(re: RegExp, s: string): RegExpExecArray | null {
  return new RegExp(re.source, re.flags.replace("g", "")).exec(s);
}

/** `re.sub` (toutes les occurrences). */
export function sub(re: RegExp, repl: string | ((m: string, ...g: string[]) => string), s: string): string {
  const g = globalOf(re);
  if (typeof repl === "string") return s.replace(g, () => repl);
  const nGroups = (new RegExp(`${re.source}|`, re.flags.replace("g", "")).exec("") as RegExpExecArray).length - 1;
  return s.replace(g, (m: string, ...rest: unknown[]) => repl(m, ...rest.slice(0, nGroups).map((x) => (x as string | undefined) ?? "")));
}

/** `re.escape` adapté au mode `u` de JS (seuls les caractères de syntaxe sont échappés). */
export function escapeRe(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
}

// ── Chaînes ──────────────────────────────────────────────────────────────────

/** `str.strip()` sans argument (blancs au sens de Python). */
export function pyStrip(s: string): string {
  return s.replace(PY_WS_EDGE_START, "").replace(PY_WS_EDGE_END, "");
}

export function pyRstrip(s: string): string {
  return s.replace(PY_WS_EDGE_END, "");
}

/** `str.strip(chars)`, `lstrip`, `rstrip` avec un jeu de caractères. */
export function stripChars(s: string, chars: string, side: "both" | "left" | "right" = "both"): string {
  const set = new Set(Array.from(chars));
  const cps = Array.from(s);
  let a = 0;
  let b = cps.length;
  if (side !== "right") while (a < b && set.has(cps[a])) a++;
  if (side !== "left") while (b > a && set.has(cps[b - 1])) b--;
  return cps.slice(a, b).join("");
}

/** `str.split()` sans argument : découpe sur tout blanc Python, sans élément vide ("" → []). */
export function pySplit(s: string): string[] {
  const t = pyStrip(s);
  return t ? t.split(PY_WS_RE) : [];
}

/** `len(s)` : nombre de points de code (pas d'unités UTF-16). */
export function cpLen(s: string): number {
  return Array.from(s).length;
}

/** `s[a:b]` en points de code. */
export function cpSlice(s: string, a: number, b?: number): string {
  return Array.from(s).slice(a, b).join("");
}

/** `str(x)` pour des valeurs JSON (None → "None", booléens en Python). */
export function pyStr(x: unknown): string {
  if (x === undefined) return "";
  if (x === null) return "None";
  if (x === true) return "True";
  if (x === false) return "False";
  return String(x);
}

// ── Nombres ──────────────────────────────────────────────────────────────────

/**
 * Arrondi décimal exact à `nd` chiffres, au pair en cas d'égalité exacte (comme `round(x, nd)` et
 * `format(x, ".{nd}f")` de Python, qui travaillent sur la valeur binaire exacte). Renvoie la chaîne.
 */
export function pyFixed(x: number, nd: number): string {
  if (!Number.isFinite(x)) return String(x);
  const neg = x < 0 || Object.is(x, -0);
  const exact = Math.abs(x).toFixed(100); // développement décimal exact de la valeur binaire
  const [intPart, frac] = exact.split(".");
  const kept = frac.slice(0, nd);
  const rest = frac.slice(nd);
  let n = BigInt(intPart + kept);
  const first = rest.charCodeAt(0) - 48;
  const tail = rest.slice(1).replace(/0+$/, "");
  if (first > 5 || (first === 5 && tail !== "") || (first === 5 && tail === "" && n % BigInt(2) === BigInt(1))) {
    n += BigInt(1);
  }
  let digits = n.toString();
  if (nd > 0) {
    digits = digits.padStart(nd + 1, "0");
    digits = `${digits.slice(0, -nd)}.${digits.slice(-nd)}`;
  }
  return (neg ? "-" : "") + digits;
}

/** `round(x, nd)` de Python (au pair, sur la valeur exacte). */
export function pyRound(x: number, nd = 0): number {
  return Number(pyFixed(x, nd));
}

// ── URL ──────────────────────────────────────────────────────────────────────

export type UrlParts = { scheme: string; netloc: string; path: string; query: string; fragment: string; hostname: string | null };

const SCHEME_CHARS = /^[A-Za-z0-9+\-.]+$/;

/**
 * `urllib.parse.urlsplit` de Python 3.9.6 (version du cron du pipeline) : jamais d'exception, chemin
 * brut, `hostname` en minuscules sans port ni identifiants, null si absent. Les blancs de tête ne sont
 * PAS retirés (« https://… » précédé d'un espace n'a pas d'hôte), seuls \t \r \n le sont.
 * `new URL()` ne convient pas (URL relatives, chemins normalisés, exceptions).
 */
export function urlSplit(input: string): UrlParts {
  let url = input.replace(/[\t\r\n]/g, "");
  let scheme = "";
  let netloc = "";
  let query = "";
  let fragment = "";
  const i = url.indexOf(":");
  if (i > 0 && /^[A-Za-z]/.test(url) && SCHEME_CHARS.test(url.slice(0, i))) {
    scheme = url.slice(0, i).toLowerCase();
    url = url.slice(i + 1);
  }
  if (url.startsWith("//")) {
    let delim = url.length;
    for (const c of "/?#") {
      const w = url.indexOf(c, 2);
      if (w >= 0) delim = Math.min(delim, w);
    }
    netloc = url.slice(2, delim);
    url = url.slice(delim);
  }
  const h = url.indexOf("#");
  if (h >= 0) {
    fragment = url.slice(h + 1);
    url = url.slice(0, h);
  }
  const q = url.indexOf("?");
  if (q >= 0) {
    query = url.slice(q + 1);
    url = url.slice(0, q);
  }
  const at = netloc.lastIndexOf("@");
  const hostport = at >= 0 ? netloc.slice(at + 1) : netloc;
  let host: string;
  if (hostport.startsWith("[")) {
    const end = hostport.indexOf("]");
    host = end >= 0 ? hostport.slice(1, end) : "";
  } else {
    const colon = hostport.indexOf(":");
    host = colon >= 0 ? hostport.slice(0, colon) : hostport;
  }
  return { scheme, netloc, path: url, query, fragment, hostname: host ? host.toLowerCase() : null };
}
