/**
 * Les rendus de signature proposés au signataire — module SANS dépendance,
 * lisible par le navigateur (aperçu) comme par le serveur (PDF).
 *
 * Trois rendus, au choix. Ils n'ajoutent rien à la valeur juridique (c'est le
 * procédé qui fait foi) : ils donnent à voir la signature, comme sur papier.
 * Polices libres (licence OFL), embarquées dans assets/fonts/signature pour le
 * PDF, et chargées par next/font pour l'aperçu (components/portal/signature-fonts).
 */
export const SIGNATURE_STYLES = [
  { key: "elegante", label: "Élégante", file: "GreatVibes-Regular.ttf" },
  { key: "fluide", label: "Fluide", file: "Allura-Regular.ttf" },
  { key: "manuscrite", label: "Manuscrite", file: "Kalam-Regular.ttf" },
] as const;

export type SignatureStyle = (typeof SIGNATURE_STYLES)[number]["key"];

export const isSignatureStyle = (v: unknown): v is SignatureStyle =>
  SIGNATURE_STYLES.some((s) => s.key === v);

/** « Charlie Piancatelli » → « CP » : le paraphe de chaque page. */
export const initialsOf = (firstName: string, lastName: string): string =>
  [firstName, lastName]
    .map((n) => n.trim().charAt(0).toUpperCase())
    .filter(Boolean)
    .join("");
