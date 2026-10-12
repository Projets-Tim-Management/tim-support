import type { GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";
import { ANNOUNCE_VARIABLES, DEFAULT_ANNOUNCE_TEXTS } from "@/modules/dev/lib/announce-email";

/**
 * Développements → Paramètres → Modèles d'e-mail → « C'est disponible ». Hors du menu
 * (`group: false`) : on y arrive par la liste des modèles
 * (DevEmailTemplatesView), qui accueillera les suivants.
 *
 * Le message envoyé aux clients qui avaient demandé un développement, quand on
 * les prévient depuis la fiche (fenêtre « Prévenir les demandeurs »). Textes et
 * image se reprennent ici, comme ceux des séquences marketing.
 *
 * Chaque champ est prérempli avec le texte d'origine ; le vider le ramène. Ce
 * qui dépend du client — prénom, lien de la fiche, bouton de réservation du
 * partenaire — reste fabriqué par le code (voir lib/announce-email).
 *
 * Réservé à TIM, comme le module.
 */
const D = DEFAULT_ANNOUNCE_TEXTS;

export const DevAnnounceEmail: GlobalConfig = {
  slug: "dev-announce-email",
  label: "E-mail « C'est disponible »",
  admin: {
    group: false,
    description: `Le message qui prévient les clients qu'un développement demandé est livré. Variables : ${ANNOUNCE_VARIABLES.map((v) => `{{${v.key}}} (${v.label.toLowerCase()})`).join(", ")}. **gras** pour mettre en avant. Un champ vidé reprend le texte d'origine.`,
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    {
      name: "back",
      type: "ui",
      admin: { components: { Field: "/modules/dev/admin/EmailTemplatesBackLink#EmailTemplatesBackLink" } },
    },
    {
      type: "row",
      fields: [
        { name: "subject", type: "text", label: "Objet de l'e-mail", defaultValue: D.subject, admin: { width: "50%" } },
        {
          name: "preheader",
          type: "text",
          label: "Pré-en-tête",
          defaultValue: D.preheader,
          admin: { width: "50%", description: "La ligne grise affichée après l'objet dans la boîte de réception." },
        },
      ],
    },
    { name: "heading", type: "text", label: "Titre du bandeau", defaultValue: D.heading },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      label: "Image du bandeau",
      admin: {
        description:
          "Affichée à droite du titre. 540 × 400 px, dessinée sur le fond du bandeau (#ccd0f6) avec sa vague : les messageries n'affichent pas les formes dessinées en code. Vide = la fusée par défaut.",
      },
    },
    {
      name: "intro",
      type: "textarea",
      label: "La bonne nouvelle",
      defaultValue: D.intro,
      admin: { description: "Après « Bonjour {prénom}, », ajouté automatiquement." },
    },
    {
      name: "featureLead",
      type: "text",
      label: "Avant le lien vers la fiche du site support",
      defaultValue: D.featureLead,
      admin: { description: "Seulement si le développement est relié à une fiche fonctionnalité." },
    },
    {
      type: "row",
      fields: [
        {
          name: "proposalWithBooking",
          type: "textarea",
          label: "Proposition — le partenaire a un lien de réservation",
          defaultValue: D.proposalWithBooking,
          admin: { width: "50%" },
        },
        {
          name: "proposalWithoutBooking",
          type: "textarea",
          label: "Proposition — sans lien de réservation",
          defaultValue: D.proposalWithoutBooking,
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "ctaLabel",
      type: "text",
      label: "Texte du bouton de réservation",
      defaultValue: D.ctaLabel,
      admin: { description: "Le lien est celui du partenaire du client ; sans lien, pas de bouton." },
    },
    { name: "signoff", type: "textarea", label: "Formule de fin", defaultValue: D.signoff },
    {
      // Le rendu tel qu'il partira, régénéré par le code d'envoi à partir de ce
      // qui est ENREGISTRÉ — même principe que les séquences.
      name: "preview",
      type: "ui",
      admin: { components: { Field: "/modules/dev/admin/AnnounceEmailPreview#AnnounceEmailPreview" } },
    },
  ],
};
