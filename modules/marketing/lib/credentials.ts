import { randomInt } from "node:crypto";

/**
 * Mots de passe des accès au logiciel TIM.
 *
 * Les comptes eux-mêmes sont créés DANS TIM : on ne fabrique ici que le mot de
 * passe que le client relira et distribuera à ses équipes. L'identifiant, lui,
 * est l'adresse e-mail de la personne — plus rien à inventer.
 */

export const generatePassword = (): string =>
  Array.from({ length: 6 }, () => randomInt(10)).join("");
