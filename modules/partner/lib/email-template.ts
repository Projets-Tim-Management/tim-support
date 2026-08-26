/**
 * Modèles d'e-mail : variables de personnalisation.
 *
 * Un modèle sans variables oblige à retaper le nom de l'entreprise à chaque
 * envoi — donc à le retaper mal un jour sur dix. Le jeu est volontairement
 * court : ce qu'on sait TOUJOURS de l'opportunité au moment d'écrire.
 *
 * Pur, donc testé : c'est ici que se joue la différence entre « Bonjour Dupont
 * BTP » et « Bonjour {{entreprise}} » envoyé à un client.
 */

export const TEMPLATE_VARIABLES: { token: string; label: string; hint: string }[] = [
  { token: "{{entreprise}}", label: "Entreprise", hint: "Nom de l'entreprise cliente" },
  { token: "{{contact}}", label: "Contact", hint: "Prénom et nom du contact principal" },
  { token: "{{prenom}}", label: "Prénom", hint: "Prénom seul du contact" },
  { token: "{{email}}", label: "E-mail", hint: "Adresse de l'opportunité" },
  { token: "{{partenaire}}", label: "Partenaire", hint: "Nom du partenaire apporteur" },
  {
    token: "{{tarifs}}",
    label: "Tarifs",
    hint: "Liste des licences aux prix de CE client (à défaut, les prix de base)",
  },
  {
    token: "{{premier_lundi}}",
    label: "1er lundi",
    hint: "Premier lundi démarrable pour la phase de test",
  },
];

export type TemplateContext = {
  /** Liste des tarifs, déjà mise en forme (une ligne Markdown par profil). */
  tarifs?: string | null;
  /** Premier lundi démarrable, en toutes lettres. */
  premier_lundi?: string | null;
  /**
   * Partenaire de l'opportunité — pas une variable de texte, mais la fiche à
   * laquelle rattacher un modèle enregistré depuis ce composeur.
   */
  partnerId?: number | string | null;
  entreprise?: string | null;
  contact?: string | null;
  prenom?: string | null;
  email?: string | null;
  partenaire?: string | null;
};

/**
 * Marque interne d'une variable restée sans valeur. Le caractère nul ne peut pas
 * venir d'une saisie : aucun risque de collision avec le texte du modèle.
 */
const EMPTY = "\u0000";

/**
 * Remplace les variables d'un modèle par les valeurs de l'opportunité.
 *
 * Trois règles, dans l'ordre de ce qui se voit le plus dans un e-mail parti :
 *  - une variable INCONNUE est laissée telle quelle. C'est le seul moyen de
 *    repérer qu'on a écrit `{{prenoom}}` en rédigeant le modèle ;
 *  - une variable SANS VALEUR disparaît avec l'espace qui l'entoure, et emporte
 *    l'espace qui la précède si une virgule ou un point suit. « Bonjour , »
 *    trahit le publipostage encore plus sûrement que « Bonjour {{prenom}} » ;
 *  - le reste de la ponctuation française (`; : ! ?`) garde son espace, qui lui
 *    est dû.
 */
export function fillTemplate(text: string, ctx: TemplateContext): string {
  const marked = (text ?? "").replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    // `partnerId` n'est pas une variable de texte : c'est la fiche à laquelle
    // rattacher un modèle enregistré (voir TemplateContext).
    // `hasOwnProperty` et non `in` : `{{toString}}` ou `{{constructor}}` sont
    // des clés HÉRITÉES du prototype. Avec `in`, elles étaient considérées comme
    // des variables connues et le code source d'une fonction native se
    // retrouvait dans l'e-mail d'un client.
    if (key === "partnerId" || !Object.prototype.hasOwnProperty.call(ctx, key)) return whole;
    const value = (ctx as Record<string, unknown>)[key];
    return value ? String(value) : EMPTY;
  });

  return marked
    .replace(new RegExp(` *${EMPTY} *`, "g"), (match, offset: number, whole: string) => {
      const next = whole[offset + match.length];
      const prev = whole[offset - 1];
      // Début de ligne, fin de texte, ou ponctuation collée : rien à laisser.
      if (!prev || !next || /[,.)\]»\n]/.test(next)) return "";
      return " ";
    })
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

/** Aperçu d'un modèle dans la liste de choix : une ligne, sans mise en forme. */
export function templatePreview(body: string, max = 120): string {
  const flat = (body ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*?([^*]+)\*\*?/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
