/**
 * Validateurs de champs réutilisables (Payload `validate`).
 */

/** Numéro de téléphone optionnel : chiffres, +, espaces, tirets, parenthèses. */
export const validatePhone = (value: unknown): true | string => {
  if (!value) return true;
  return (
    /^[+()\d\s.-]{6,20}$/.test(String(value)) ||
    "Numéro de téléphone invalide (chiffres, +, espaces, tirets)."
  );
};
