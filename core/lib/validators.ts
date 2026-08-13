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
