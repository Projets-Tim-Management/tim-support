import {
  fieldRequired,
  fieldVisible,
  type PortalField,
  type PortalSection,
} from "@/modules/marketing/lib/portal-sections";

/**
 * Import CSV des sections du dossier de démarrage.
 *
 * TOUT VIENT DU REGISTRE `portal-sections`. Le modèle proposé au client, les
 * colonnes attendues, les valeurs autorisées et les champs obligatoires en sont
 * déduits — jamais recopiés. C'est la seule façon d'être sûr que le modèle
 * qu'on lui fait remplir correspond au formulaire qui le validera : deux
 * descriptions séparées divergent au premier champ ajouté, et le client
 * découvre le décalage après avoir rempli quarante lignes.
 *
 * Pur : aucune base, aucun réseau. Ce qui est testé ici est exactement ce qui
 * s'exécutera.
 */

/** Les colonnes qu'un client remplit : ni réservées à TIM, ni calculées. */
export const importableFields = (section: PortalSection): PortalField[] =>
  section.fields.filter((f) => !f.adminOnly && !f.readOnly);

/* ─── Écriture du modèle ─────────────────────────────────────────────────── */

/**
 * Un champ contenant le séparateur, un guillemet ou un retour à la ligne doit
 * être encadré, sinon il casse la ligne entière à la relecture.
 */
const escapeCell = (value: string, sep: string): string =>
  new RegExp(`["${sep === "\t" ? "\\t" : sep}\\r\\n]`).test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;

export const toCsvLine = (cells: string[], sep = ";"): string =>
  cells.map((c) => escapeCell(c, sep)).join(sep);

/** Exemple de valeur, pour que le client voie le format attendu, pas une case vide. */
function sampleFor(field: PortalField): string {
  if (field.sample) return field.sample;
  if (field.options?.length) return field.options[0].label;
  switch (field.type) {
    case "date":
      return "31/12/2026";
    case "email":
      return "prenom.nom@exemple.fr";
    case "tel":
      return "06 12 34 56 78";
    case "number":
      return "2020";
    case "checkbox":
      return "oui";
    default:
      return field.placeholder || "";
  }
}

/**
 * Le modèle à remplir.
 *
 * Point-virgule par défaut : c'est ce qu'Excel en français écrit ET attend. Une
 * virgule produirait un fichier qui s'ouvre en une seule colonne — le client
 * croirait le modèle cassé.
 *
 * Le BOM en tête n'est pas décoratif : sans lui, Excel lit un fichier UTF-8
 * comme du latin-1 et affiche « SociÃ©tÃ© ». C'est la première chose que voit
 * le client en ouvrant le modèle.
 */
export function csvTemplate(section: PortalSection, sep = ";"): string {
  const fields = importableFields(section);
  const header = fields.map((f) => (f.required ? `${f.label} (obligatoire)` : f.label));
  /**
   * L'exemple se remplit en deux temps : les valeurs d'abord, puis on vide
   * celles que la ligne rend sans objet. Une date de fin de contrat en face
   * d'un CDI est une contradiction que le client recopierait, et qui
   * n'apparaît même pas dans le formulaire.
   */
  const brut = fields.map(sampleFor);
  const ligne: Record<string, unknown> = {};
  fields.forEach((f, i) => {
    ligne[f.name] = f.options?.length
      ? f.options.find((o) => o.label === brut[i])?.value
      : brut[i];
  });
  const example = fields.map((f, i) => (fieldVisible(f, ligne) ? brut[i] : ""));
  return `﻿${toCsvLine(header, sep)}\n${toCsvLine(example, sep)}\n`;
}

/* ─── Export des lignes saisies ──────────────────────────────────────────── */

/** « 12/03/1985 » depuis un ISO ; ce qui n'est pas une date ISO ressort tel quel. */
const frDate = (value: unknown): string => {
  const iso = value ? String(value).slice(0, 10) : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Une valeur enregistrée, écrite comme on la saisirait : libellé de la liste, date française, oui/non. */
export const cellToCsv = (field: PortalField, value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (field.options?.length) {
    return field.options.find((o) => o.value === String(value))?.label ?? String(value);
  }
  switch (field.type) {
    case "date":
      return frDate(value);
    case "checkbox":
      return value ? "oui" : "non";
    default:
      return String(value);
  }
};

/**
 * Ce qui est saisi, dans un fichier qui se ROUVRE ET SE RÉIMPORTE tel quel.
 *
 * Mêmes en-têtes que le modèle (le « (obligatoire) » compris — l'import
 * l'ignore), mêmes écritures que la grille : ce qu'on exporte pour corriger
 * dans Excel revient sans surprise. Point-virgule et BOM, pour les mêmes
 * raisons que le modèle.
 *
 * `fields` : les colonnes à écrire — celles du client, ou, côté TIM, aussi les
 * colonnes réservées (mots de passe) : c'est l'équipe qui exporte, pour elle.
 */
export function csvExport(
  fields: PortalField[],
  rows: Record<string, unknown>[],
  sep = ";",
): string {
  const header = fields.map((f) => (f.required ? `${f.label} (obligatoire)` : f.label));
  const lines = rows.map((row) => toCsvLine(fields.map((f) => cellToCsv(f, row[f.name])), sep));
  return `\uFEFF${[toCsvLine(header, sep), ...lines].join("\n")}\n`;
}

/** Les valeurs acceptées par les listes de choix, à rappeler dans la fenêtre d'aide. */
export const choicesOf = (section: PortalSection): { label: string; values: string[] }[] =>
  importableFields(section)
    .filter((f) => f.options?.length)
    .map((f) => ({ label: f.label, values: f.options!.map((o) => o.label) }));

/* ─── Décodage du fichier reçu ───────────────────────────────────────────── */

/**
 * Le fichier arrive en OCTETS, et son encodage n'est pas celui qu'on croit.
 *
 * Le modèle part en UTF-8 avec BOM. Il revient de tout autre chose : Excel le
 * réenregistre volontiers en Windows-1252, parfois en UTF-16, et il lui arrive
 * de relire notre UTF-8 comme du latin-1 puis de sauver le résultat — auquel
 * cas le fichier contient pour de bon « SociÃ©tÃ© ».
 *
 * Le lire en UTF-8 sans se poser la question rendait les en-têtes accentués
 * méconnaissables : « Société » et « Prénom » passaient pour absentes et
 * l'import entier était refusé, alors que le fichier était bon. Le client, lui,
 * n'a aucun moyen de deviner ce qu'on lui reproche — c'est donc ici que ça se
 * règle, pas dans une consigne.
 */
const MOJIBAKE = /Ã[\u0080-\u00bf]|Â[\u00a0-\u00bf]|â\u0080[\u0080-\u00bf]/;

/**
 * Rend leur forme aux caractères passés par un aller-retour latin-1 → UTF-8.
 *
 * On relit les caractères du texte comme les octets qu'ils étaient, puis on les
 * décode en UTF-8 — en mode strict : si ça ne retombe pas juste, c'est que le
 * texte n'était pas abîmé, et on n'y touche pas.
 */
function repairChunk(text: string): string {
  if (!MOJIBAKE.test(text)) return text;

  // La marque d'ordre des octets n'est pas du contenu, mais elle est hors
  // latin-1 : la laisser ferait renoncer à la réparation dès le premier
  // caractère — et c'est justement le cas le plus courant, Excel la réécrivant
  // systématiquement.
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;

  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i += 1) {
    const code = body.charCodeAt(i);
    // Un caractère hors latin-1 prouve que le texte n'est pas un simple
    // aller-retour d'octets : le réparer le casserait.
    if (code > 0xff) return text;
    bytes[i] = code;
  }
  try {
    return (bom ? "\ufeff" : "") + new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return text;
  }
}

/**
 * Répare le fichier, ligne par ligne au besoin.
 *
 * La relecture des octets est tout ou rien : une seule séquence abîmée — un
 * caractère perdu en route, une ligne recopiée à la main — ferait renoncer sur
 * l'ENSEMBLE du fichier, en-tête compris. Or c'est l'en-tête qui décide si
 * l'import est possible. On tente donc le texte entier, puis ligne à ligne :
 * une ligne intraitable reste telle quelle et ne condamne pas les autres.
 */
export function repairMojibake(text: string): string {
  if (!MOJIBAKE.test(text)) return text;

  const entier = repairChunk(text);
  if (entier !== text) return entier;

  return text.split("\n").map(repairChunk).join("\n");
}

const decode = (bytes: Uint8Array, label: string): string => new TextDecoder(label).decode(bytes);

/** Le texte du fichier, quel que soit l'encodage sous lequel il a été sauvé. */
export function decodeCsvBytes(input: ArrayBuffer | Uint8Array): string {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input);

  // Une marque d'ordre des octets tranche la question : on la croit.
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return repairMojibake(decode(b.subarray(3), "utf-8"));
  }
  if (b[0] === 0xff && b[1] === 0xfe) return decode(b.subarray(2), "utf-16le");
  if (b[0] === 0xfe && b[1] === 0xff) {
    try {
      return decode(b.subarray(2), "utf-16be");
    } catch {
      return decode(b.subarray(2), "utf-8");
    }
  }

  // Sans marque : l'UTF-8 est vérifiable, pas le latin-1. On tente donc le
  // premier en strict, et son échec DÉSIGNE le second — l'inverse ne se
  // détecte pas, tout octet étant un caractère valide en Windows-1252.
  try {
    return repairMojibake(new TextDecoder("utf-8", { fatal: true }).decode(b));
  } catch {
    // Dernier recours : si l'environnement ne connaît pas ce jeu de caractères,
    // mieux vaut un texte à accents douteux qu'une exception — le client verra
    // ses colonnes, et corrigera les cases concernées.
    try {
      return decode(b, "windows-1252");
    } catch {
      return decode(b, "utf-8");
    }
  }
}

/* ─── Lecture d'un fichier déposé ────────────────────────────────────────── */

/**
 * Le séparateur du fichier REÇU, deviné sur la ligne d'en-tête.
 *
 * On ne peut pas l'imposer : le client renvoie ce que son tableur a produit, et
 * il n'est pas le même d'un pays ou d'un logiciel à l'autre. On compte les
 * candidats hors guillemets et on prend le plus fréquent.
 */
export function detectSeparator(headerLine: string): string {
  const counts = [";", ",", "\t"].map((sep) => {
    let n = 0;
    let quoted = false;
    for (const ch of headerLine) {
      if (ch === '"') quoted = !quoted;
      else if (ch === sep && !quoted) n += 1;
    }
    return { sep, n };
  });
  const best = counts.sort((a, b) => b.n - a.n)[0];
  return best.n > 0 ? best.sep : ";";
}

/**
 * Découpe un CSV en lignes de cellules.
 *
 * Écrit à la main plutôt qu'avec une bibliothèque : le format tient en trente
 * lignes, et la seule subtilité — un guillemet doublé à l'intérieur d'un champ
 * encadré — est celle qu'on ne peut pas se permettre de rater, car elle décale
 * silencieusement toutes les colonnes suivantes.
 */
export function parseCsv(text: string, sep?: string): string[][] {
  return parseCsvLines(text, sep).map((l) => l.cells);
}

/**
 * Comme `parseCsv`, mais chaque ligne garde SON NUMÉRO dans le fichier.
 *
 * Les lignes vides sont écartées — un tableur en laisse toujours traîner — mais
 * en les retirant sans compter, tout ce qui suivait se décalait : le rapport
 * annonçait « ligne 7 » là où le client en voyait une autre à l'écran. Un
 * numéro faux coûte plus cher qu'un numéro absent.
 */
export function parseCsvLines(
  text: string,
  sep?: string,
): { line: number; cells: string[] }[] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const separator = sep ?? detectSeparator(clean.split("\n")[0] ?? "");

  const rows: { line: number; cells: string[] }[] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // Une cellule encadrée peut contenir un retour à la ligne : le numéro se
  // prend au DÉBUT de l'enregistrement, pas à sa fin.
  let debut = 1;
  let ligne = 1;

  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else {
        if (ch === "\n") ligne += 1;
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push({ line: debut, cells: row });
      row = [];
      cell = "";
      ligne += 1;
      debut = ligne;
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push({ line: debut, cells: row });
  }

  // Les lignes entièrement vides ne disent rien : un tableur en laisse toujours
  // traîner en fin de fichier, et les signaler comme fautives serait absurde.
  return rows.filter((r) => r.cells.some((c) => c.trim() !== ""));
}

/* ─── Correspondance des colonnes et conversion ──────────────────────────── */

/** Comparaison indulgente : casse, accents, espaces et « (obligatoire) » ignorés. */
const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(obligatoire\)/gi, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();

/**
 * Associe chaque colonne du fichier à un champ du registre.
 *
 * On accepte le LIBELLÉ (ce que contient le modèle) comme le nom technique :
 * un client renvoie parfois un export tiré d'un autre logiciel, et refuser une
 * colonne « firstName » parce qu'on attendait « Prénom » n'aiderait personne.
 *
 * @returns pour chaque colonne, le champ visé ou `null` si elle est inconnue.
 */
export function matchColumns(section: PortalSection, header: string[]): (PortalField | null)[] {
  const fields = importableFields(section);
  const byKey = new Map<string, PortalField>();
  for (const f of fields) {
    byKey.set(normalize(f.label), f);
    byKey.set(normalize(f.name), f);
  }
  return header.map((h) => byKey.get(normalize(h)) ?? null);
}

/** `31/12/2026`, `2026-12-31`, `31-12-2026` → ISO. `null` si la date n'a pas de sens. */
export function parseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const fr = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(v);
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : fr
      ? [Number(fr[3]), Number(fr[2]), Number(fr[1])]
      : [0, 0, 0];
  if (!y) return null;

  const date = new Date(Date.UTC(y, m - 1, d));
  // Contrôle de cohérence : `Date` accepte le 31 février et le décale au 3 mars.
  // Une date fausse doit être signalée, pas silencieusement déplacée.
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString();
}

const TRUTHY = new Set(["oui", "o", "yes", "y", "true", "vrai", "1", "x"]);
const FALSY = new Set(["non", "n", "no", "false", "faux", "0", ""]);

/** Convertit une cellule selon le type du champ. `error` prime sur `value`. */
export function convertCell(field: PortalField, raw: string): { value?: unknown; error?: string } {
  const v = raw.trim();
  if (!v) return { value: "" };

  if (field.options?.length) {
    const hit = field.options.find(
      (o) => normalize(o.label) === normalize(v) || normalize(o.value) === normalize(v),
    );
    if (!hit) {
      const shown = field.options.slice(0, 6).map((o) => o.label).join(", ");
      return { error: `Valeur inconnue. Attendu : ${shown}${field.options.length > 6 ? "…" : ""}` };
    }
    return { value: hit.value };
  }

  switch (field.type) {
    case "date": {
      const iso = parseDate(v);
      return iso ? { value: iso } : { error: "Date illisible. Format attendu : JJ/MM/AAAA." };
    }
    case "number": {
      const n = Number(v.replace(",", ".").replace(/\s/g, ""));
      return Number.isFinite(n) ? { value: n } : { error: "Nombre attendu." };
    }
    case "checkbox": {
      const k = v.toLowerCase();
      if (TRUTHY.has(k)) return { value: true };
      if (FALSY.has(k)) return { value: false };
      return { error: "Répondre par oui ou non." };
    }
    default:
      return { value: v };
  }
}

export interface ImportedRow {
  /** Numéro de ligne DANS LE FICHIER, en-tête comprise — celui qu'affiche le tableur. */
  line: number;
  data: Record<string, unknown>;
  /** Messages BLOQUANTS. Une ligne qui en porte n'est pas enregistrée. */
  errors: Record<string, string>;
  /** Cases dont la valeur n'a pas été comprise. Conservées pour être corrigées. */
  dropped: Record<string, string>;
  /**
   * Les valeurs TELLES QUE LE CLIENT LES A ÉCRITES, par champ.
   *
   * Indispensable pour lui rendre son fichier corrigeable : effacer une valeur
   * fautive et lui demander de la retrouver dans son tableur, c'est lui faire
   * refaire le travail. Il doit voir « Atlantide » dans la case et pouvoir la
   * remplacer.
   */
  raw: Record<string, string>;
}

export interface ImportReport {
  /** Colonnes du fichier que le registre ne connaît pas — ignorées, pas fatales. */
  unknownColumns: string[];
  /** Colonnes obligatoires absentes du fichier : là, rien ne peut être importé. */
  missingRequired: string[];
  rows: ImportedRow[];
  ok: number;
  ko: number;
  /** Nombre de cases vidées sur l'ensemble des lignes retenues. */
  droppedCount: number;
}

/**
 * Lit un fichier et dit, ligne par ligne, ce qui passera et ce qui ne passera pas.
 *
 * N'ÉCRIT RIEN. C'est le point de l'étape : montrer le verdict avant que quoi
 * que ce soit ne soit enregistré, pour qu'un fichier à moitié bon ne laisse pas
 * la moitié d'un dossier dans un état qu'on ne comprend plus.
 *
 * La validation finale est déléguée à `validateRow`, celle qu'utilisent déjà
 * l'API et le formulaire : un fichier accepté ici ne peut pas être refusé après.
 */
export function readImport(
  section: PortalSection,
  text: string,
  validate: (section: PortalSection, row: Record<string, unknown>) => Record<string, string>,
): ImportReport {
  // Le navigateur décode déjà les octets ; ce filet couvre le texte qui
  // arriverait abîmé par une autre voie que notre écran.
  const rows = parseCsvLines(repairMojibake(text));
  const empty: ImportReport = {
    unknownColumns: [],
    missingRequired: [],
    rows: [],
    ok: 0,
    ko: 0,
    droppedCount: 0,
  };
  if (rows.length === 0) return empty;

  const header = rows[0].cells;
  const matched = matchColumns(section, header);
  const unknownColumns = header.filter((h, i) => h.trim() !== "" && !matched[i]);

  const present = new Set(matched.filter(Boolean).map((f) => f!.name));
  const missingRequired = importableFields(section)
    .filter((f) => f.required && !present.has(f.name))
    .map((f) => f.label);

  const out: ImportedRow[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const { line, cells } = rows[r];
    const data: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    const dropped: Record<string, string> = {};
    const raw: Record<string, string> = {};

    /**
     * Une case fautive est ÉCARTÉE si sa colonne est facultative, et bloquante
     * seulement si elle est obligatoire — auquel cas il n'y a rien à mettre à
     * la place, et la ligne n'a pas de sens.
     */
    const ecarter = (field: PortalField, message: string) => {
      if (fieldRequired(field, data)) errors[field.name] = message;
      else {
        delete data[field.name];
        dropped[field.name] = message;
      }
    };

    matched.forEach((field, c) => {
      if (!field) return;
      const cell = cells[c] ?? "";
      raw[field.name] = cell;
      const { value, error } = convertCell(field, cell);
      if (error) ecarter(field, error);
      else data[field.name] = value;
    });

    // Les règles du formulaire s'appliquent ensuite, sur les valeurs converties.
    // Une seconde passe suit : vider une case peut lever l'erreur qu'elle
    // causait — deux dates incohérentes cessent de l'être dès que l'une part.
    const byName = new Map(section.fields.map((f) => [f.name, f]));
    for (let pass = 0; pass < 2; pass += 1) {
      const found = validate(section, data);
      if (Object.keys(found).length === 0) break;
      let changed = false;
      for (const [name, message] of Object.entries(found)) {
        const field = byName.get(name);
        if (field && !fieldRequired(field, data) && data[name] !== undefined) {
          delete data[name];
          dropped[name] = message;
          changed = true;
        } else if (!errors[name]) {
          errors[name] = message;
        }
      }
      if (!changed) break;
    }

    out.push({ line, data, errors, dropped, raw });
  }

  return {
    unknownColumns,
    missingRequired,
    rows: out,
    ok: out.filter((r) => Object.keys(r.errors).length === 0).length,
    ko: out.filter((r) => Object.keys(r.errors).length > 0).length,
    droppedCount: out
      .filter((r) => Object.keys(r.errors).length === 0)
      .reduce((n, r) => n + Object.keys(r.dropped).length, 0),
  };
}
