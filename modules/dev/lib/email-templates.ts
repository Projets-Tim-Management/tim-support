/**
 * Les modèles d'e-mail du module Développements, listés sur la page
 * « Modèles d'e-mail » (/admin/dev/modeles-email). Chacun est un global : ses
 * textes et son image s'y reprennent. Un nouveau modèle = une ligne ici.
 */
export type DevEmailTemplate = {
  /** Slug du global qui porte ses réglages. */
  slug: string;
  name: string;
  /** Quand il part, et à qui. */
  when: string;
};

export const DEV_EMAIL_TEMPLATES: DevEmailTemplate[] = [
  {
    slug: "dev-announce-email",
    name: "C'est disponible",
    when: "Aux clients qui avaient demandé un développement, quand on les prévient depuis sa fiche qu'il est livré.",
  },
];
