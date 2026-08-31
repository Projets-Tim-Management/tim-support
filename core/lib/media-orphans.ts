/**
 * Quels médias ne servent à rien, et peuvent donc être supprimés.
 *
 * ⚠️ Ces fonctions décident d'une SUPPRESSION DÉFINITIVE. Une erreur ici
 * n'affiche pas un message : elle efface le logo d'un partenaire ou la capture
 * d'un ticket, et personne ne s'en aperçoit avant d'ouvrir la fiche. D'où le
 * choix de tout dériver du CATALOGUE de la base plutôt que d'une liste écrite à
 * la main — une liste s'oublie au premier champ ajouté, et ce qu'on oublie
 * d'interroger passe pour inutilisé.
 */

/** Une colonne qui pointe vers `media`. */
export type Reference = { table: string; column: string };

/**
 * Tables dont la présence ne prouve PAS un usage.
 *
 * `payload_locked_documents_rels` enregistre les verrous d'édition : « untel a
 * cette fiche ouverte en ce moment ». C'est un état temporaire, pas un lien.
 */
export const TABLES_IGNOREES = ["payload_locked_documents_rels"];

/** Un identifiant SQL sain — le catalogue n'en produit pas d'autres. */
const IDENTIFIANT = /^[a-z_][a-z0-9_]*$/i;

/**
 * Les références qui comptent comme un usage.
 *
 * Les tables de VERSIONS (`_features_v`…) sont gardées volontairement : un
 * média rattaché à un brouillon est utilisé, même si rien de publié ne le
 * montre. Le supprimer viderait le brouillon de son auteur.
 */
export const referencesUtiles = (refs: Reference[]): Reference[] =>
  refs.filter(
    (r) =>
      !TABLES_IGNOREES.includes(r.table) &&
      IDENTIFIANT.test(r.table) &&
      IDENTIFIANT.test(r.column),
  );

/**
 * Condition SQL « ce média est référencé quelque part ».
 *
 * ⚠️ LÈVE plutôt que de rendre une condition vide. Une liste vide produirait
 * « NOT (rien) » — c'est-à-dire « aucun média n'est utilisé », donc la
 * suppression de la médiathèque entière. Le cas se présente pour de bon si la
 * requête de catalogue échoue ou si les droits changent : il doit arrêter le
 * balayage, pas le laisser continuer à l'aveugle.
 *
 * @param alias alias de la table `media` dans la requête appelante.
 */
export const conditionReferencee = (refs: Reference[], alias = "m"): string => {
  const utiles = referencesUtiles(refs);
  if (utiles.length === 0) {
    throw new Error(
      "Aucune référence vers `media` trouvée dans le catalogue : balayage interrompu " +
        "(une condition vide supprimerait toute la médiathèque).",
    );
  }
  if (!IDENTIFIANT.test(alias)) throw new Error(`Alias SQL invalide : ${alias}`);

  return utiles
    .map((r) => `exists (select 1 from "${r.table}" r where r."${r.column}" = ${alias}.id)`)
    .join(" or ");
};

/**
 * Noms des colonnes de TEXTE LIBRE où une URL de média peut avoir été collée.
 *
 * Les références structurées (clés étrangères) ne racontent pas tout : un
 * modèle d'e-mail ou une note d'activité est du texte, et rien n'empêche d'y
 * coller l'adresse d'une image. Ce média serait alors invisible du catalogue —
 * et effacé, laissant une image cassée dans un message déjà parti.
 *
 * On repère ces colonnes par leur NOM plutôt que par une liste de tables : un
 * nouveau champ « body » ou « content » est couvert d'office. Ce n'est pas une
 * garantie absolue — un champ nommé autrement échapperait au filet — mais c'est
 * le compromis honnête entre la sécurité et un balayage de toute la base.
 */
export const COLONNES_TEXTE_LIBRE = ["body", "content", "description", "note", "notes"];

/**
 * Condition SQL « le nom de ce fichier apparaît dans un texte libre ».
 *
 * Rend `null` quand il n'y a aucune colonne à fouiller : il n'y a alors rien à
 * ajouter à la condition principale — contrairement aux clés étrangères, dont
 * l'absence est le signe d'un problème et doit tout arrêter.
 */
export const conditionCitee = (
  colonnes: Reference[],
  alias = "m",
): string | null => {
  const utiles = colonnes.filter(
    (c) => IDENTIFIANT.test(c.table) && IDENTIFIANT.test(c.column) && c.table !== "media",
  );
  if (utiles.length === 0) return null;
  if (!IDENTIFIANT.test(alias)) throw new Error(`Alias SQL invalide : ${alias}`);

  // `position(... in ...)` plutôt que LIKE : le nom d'un fichier contient
  // volontiers « % » ou « _ », qui sont des JOKERS pour LIKE — « photo_1.png »
  // correspondrait alors à « photoX1.png », et on protégerait le mauvais média.
  return utiles
    .map(
      (c) =>
        `exists (select 1 from "${c.table}" t where t."${c.column}" is not null ` +
        `and position(${alias}.filename in t."${c.column}") > 0)`,
    )
    .join(" or ");
};
