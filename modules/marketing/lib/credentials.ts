import { randomInt } from "node:crypto";

/**
 * Fabrication des accès de test à partir du dossier de démarrage.
 *
 * Le client a déjà déclaré QUI utilise TIM (salariés cochés « Accès TIM », avec
 * leur profil de licence). Refaire cette saisie à la main côté TIM serait à la
 * fois pénible et une occasion de se tromper : on génère les lignes, TIM n'a
 * plus qu'à créer les comptes dans l'application et coller les identifiants.
 */

/** Retire accents et signes : un identifiant doit rester tapable partout. */
const slug = (value?: string | null): string =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();

/**
 * Identifiant proposé : `prenom.nom`, suffixé si déjà pris.
 * Ce n'est qu'une suggestion — l'application TIM peut imposer autre chose, le
 * champ reste modifiable.
 */
export const suggestUsername = (
  firstName?: string | null,
  lastName?: string | null,
  taken: Set<string> = new Set(),
): string => {
  const base = [slug(firstName), slug(lastName)].filter(Boolean).join(".") || "utilisateur";
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${randomInt(100, 999)}`;
};

/**
 * Mot de passe : 6 chiffres, rien d'autre.
 *
 * Ces codes sont recopiés depuis une fiche papier, souvent dictés, parfois
 * saisis sur un clavier numérique de téléphone avec les mains sales. Aucune
 * lettre : plus de majuscule à trouver, plus de confusion l/1 ou o/0, plus de
 * question sur l'accent. Les zéros de tête sont conservés — « 094220 » est une
 * suite de caractères, pas un nombre.
 *
 * ⚠️ 10⁶ combinaisons : c'est court. Assumé parce que ces accès ne valent que
 * le temps de la phase de test et sont remplacés à la mise en production.
 */
export const generatePassword = (): string =>
  Array.from({ length: 6 }, () => randomInt(10)).join("");
