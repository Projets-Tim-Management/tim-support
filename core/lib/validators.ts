/**
 * Validateurs de champs réutilisables (Payload `validate`).
 */

/**
 * Adresse e-mail dont le caractère obligatoire dépend d'un champ voisin (Payload
 * ne sait pas rendre `required` conditionnel).
 *
 * ⚠️ Fournir un `validate` REMPLACE le contrôle de format natif du type `email` :
 * c'est donc à lui de le refaire, sinon n'importe quelle chaîne passerait.
 */
export const validateEmail =
  (isRequired: (sibling: Record<string, unknown> | undefined) => boolean, message: string) =>
  (value: unknown, { siblingData }: { siblingData?: unknown }): true | string => {
    const sibling = siblingData as Record<string, unknown> | undefined;
    if (!value) return isRequired(sibling) ? message : true;
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(value)) || "Adresse e-mail invalide.";
  };

/** Numéro de téléphone optionnel : chiffres, +, espaces, tirets, parenthèses. */
export const validatePhone = (value: unknown): true | string => {
  if (!value) return true;
  return (
    /^[+()\d\s.-]{6,20}$/.test(String(value)) ||
    "Numéro de téléphone invalide (chiffres, +, espaces, tirets)."
  );
};

/**
 * Date de naissance : garde-fou de FRAPPE, pas règle d'emploi.
 *
 * Il y avait ici un seuil de 16 ans. Personne ne l'avait demandé, et il était
 * faux : un apprenti s'embauche dès 15 ans révolus. Une règle métier inventée
 * refusait donc une donnée vraie — et le disait au moment d'enregistrer, pas à
 * la saisie.
 *
 * Ce qui reste ne juge pas de qui on emploie : une naissance dans le futur ou
 * il y a plus d'un siècle n'est pas une personne, c'est une année mal tapée.
 */
export const validateBirthDate = (value: unknown): true | string => {
  if (!value) return true;

  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return "Date invalide.";

  if (d.getTime() > Date.now()) return "La date de naissance est dans le futur.";

  const ans = (Date.now() - d.getTime()) / 31_557_600_000;
  if (ans > 100) return "Date de naissance improbable — vérifiez l'année.";

  return true;
};
