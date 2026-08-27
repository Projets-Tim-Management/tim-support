import type { PortalField } from "@/modules/marketing/lib/portal-sections";

/**
 * Coller depuis un tableur, dans le dossier de démarrage.
 *
 * Ces informations existent déjà, dans un Excel, chez le client. Les lui faire
 * retaper ligne à ligne était la vraie raison de l'ancien fichier à importer —
 * on a supprimé l'import, il faut donc que le collage fonctionne, sinon on a
 * juste déplacé la corvée.
 *
 * Isolé de l'écran pour être testable : une conversion de dates se vérifie, elle
 * ne se constate pas.
 */

/** Découpe un presse-papiers de tableur : tabulations = colonnes, retours = lignes. */
export const parseClipboard = (text: string): string[][] =>
  text
    .replace(/\r\n?/g, "\n")
    // Un tableur termine sa sélection par un retour : sans ça, on collerait une
    // ligne vide de plus à chaque fois.
    .replace(/\n+$/, "")
    .split("\n")
    .map((line) => line.split("\t"));

/**
 * Date saisie ou collée → format ISO court attendu par un `<input type="date">`.
 *
 * Un champ date natif REFUSE le collage : sa valeur doit être « aaaa-mm-jj » et
 * il ne convertit rien. Or personne ne stocke ses dates ainsi dans un tableur —
 * on y trouve « 12/03/1985 », parfois « 12.03.85 ». Sans cette conversion, coller
 * une colonne de dates ne produit que des cases vides.
 *
 * Le jour vient toujours en premier : c'est l'usage français, et l'ambiguïté
 * 03/12 se tranche dans ce sens, pas dans l'autre.
 */
export const parseDateText = (raw: string): string | null => {
  const text = raw.trim();
  if (!text) return null;

  // Déjà au format ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const m = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(text);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  // Deux chiffres : 70–99 renvoient au XXe siècle, le reste au XXIe. Une date de
  // naissance en 1985 est courante, une en 2085 n'existe pas.
  if (m[3].length === 2) year += year >= 70 ? 1900 : 2000;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Le mois de février ne fait pas 31 jours : on vérifie que la date existe.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const TRUE_WORDS = ["oui", "x", "true", "vrai", "1", "o"];

/**
 * Texte collé → valeur du champ.
 *
 * Une liste accepte l'intitulé AUTANT que la clé : un tableur contient
 * « Chef de chantier », pas « chefChantier ». Refuser l'intitulé reviendrait à
 * n'accepter que ce que le logiciel a lui-même écrit.
 */
export const coerceCell = (field: PortalField, raw: string): unknown => {
  const text = raw.trim();

  switch (field.type) {
    case "date":
      return parseDateText(text) ?? "";
    case "number":
      return text === "" ? "" : Number(text.replace(",", ".").replace(/\s/g, ""));
    case "checkbox":
      return TRUE_WORDS.includes(text.toLowerCase());
    case "select": {
      if (!text) return "";
      const match = field.options?.find(
        (o) =>
          o.value.toLowerCase() === text.toLowerCase() ||
          o.label.toLowerCase() === text.toLowerCase(),
      );
      return match?.value ?? "";
    }
    default:
      return text;
  }
};
