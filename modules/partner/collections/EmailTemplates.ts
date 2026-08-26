import type { CollectionBeforeChangeHook, CollectionConfig, Where } from "payload";

import {
  adminOnlyField,
  hasAdminRole,
  isAdminOrMetier,
  isPartnerMetier,
  metierScoped,
  partnerIdOf,
} from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import { TEMPLATE_VARIABLES } from "@/modules/partner/lib/email-template";

/**
 * Modèles d'e-mail — les messages qu'on réécrit chaque semaine : relance sans
 * retour, récapitulatif après démo, envoi d'offre.
 *
 * DEUX PORTÉES, et c'est tout l'intérêt :
 *  - `tim` : les modèles de la maison, visibles par TOUS les partenaires et
 *    modifiables par les seuls admins. Corriger un tarif ou une formulation les
 *    corrige pour tout le monde d'un coup ;
 *  - `partenaire` : ceux d'un partenaire, que lui seul voit et modifie. Chacun
 *    écrit avec ses mots.
 *
 * Un partenaire ne peut donc pas altérer un modèle TIM — mais il peut le
 * DUPLIQUER pour s'en faire une version, et il modifie librement le texte une
 * fois inséré dans son message : le modèle est un point de départ, pas un cadre.
 *
 * Le corps est du Markdown, comme les notes : c'est le même éditeur qui le
 * rédige, et le même convertisseur qui le transforme en HTML au moment de
 * l'envoi. Rien de ce qui est saisi n'est réinjecté tel quel (voir lib/rich-text).
 *
 * Créés et utilisés depuis le drawer « Envoyer un e-mail » d'une opportunité.
 */

/**
 * Un modèle de partenaire DOIT être rattaché à une fiche ; un modèle TIM ne
 * doit surtout pas l'être (il serait alors invisible pour les autres).
 *
 * Contrôlé ici et non par `required` : l'obligation dépend de la portée, ce que
 * la déclaration d'un champ ne sait pas exprimer.
 */
const requirePartnerScope: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const scope = data?.scope ?? originalDoc?.scope ?? "partenaire";
  if (scope === "tim") {
    if (!hasAdminRole(req.user)) {
      throw new Error("Seul un administrateur peut créer ou modifier un modèle TIM.");
    }
    return { ...data, partner: null };
  }
  if (data?.partner == null && originalDoc?.partner == null) {
    throw new Error("Un modèle de partenaire doit être rattaché à une fiche partenaire.");
  }
  return data;
};

export const EmailTemplates: CollectionConfig = {
  slug: "email-templates",
  labels: { singular: "Modèle d'e-mail", plural: "Modèles d'e-mail" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "subject", "scope", "partner", "updatedAt"],
    group: "Partenaires",
    // Gérés depuis le drawer « Envoyer un e-mail » (créer, modifier, supprimer),
    // là où on s'en sert. Une page de plus dans le menu pour la même chose
    // n'apporterait qu'un deuxième endroit à tenir à jour.
    hidden: true,
    description:
      "Messages types réutilisables lors d'un envoi depuis une opportunité. Variables disponibles : " +
      TEMPLATE_VARIABLES.map((v) => v.token).join(", ") +
      ".",
  },
  defaultSort: "name",
  disableDuplicate: false, // dupliquer un modèle pour le décliner : cas d'usage réel
  access: {
    /**
     * LECTURE : ses propres modèles ET ceux de TIM. C'est le seul endroit du
     * module où un partenaire voit une ligne qui ne lui appartient pas — d'où
     * une règle écrite à la main plutôt que le `metierScoped` habituel.
     */
    read: ({ req: { user } }): Where | boolean => {
      if (hasAdminRole(user)) return true;
      const pid = partnerIdOf(user);
      if (isPartnerMetier(user) && pid != null) {
        return { or: [{ partner: { equals: pid } }, { scope: { equals: "tim" } }] };
      }
      return false;
    },
    create: isAdminOrMetier,
    // ÉCRITURE scopée à sa fiche : un modèle TIM (sans partenaire) n'entre pas
    // dans ce filtre, il est donc hors de portée d'un partenaire. L'admin, lui,
    // n'est pas filtré.
    update: metierScoped(),
    delete: metierScoped(),
  },
  hooks: {
    // Anti-usurpation : un partenaire ne peut créer un modèle que sur SA fiche.
    beforeChange: [requirePartnerScope, enforcePartnerField()],
  },
  fields: [
    {
      name: "name",
      type: "text",
      label: "Nom du modèle",
      required: true,
      admin: { description: "Ce qui s'affiche dans la liste de choix. Ex. « Relance sans retour »." },
    },
    {
      name: "subject",
      type: "text",
      label: "Objet",
      required: true,
    },
    {
      name: "body",
      type: "textarea",
      label: "Message",
      required: true,
      admin: {
        rows: 12,
        description:
          "Markdown : **gras**, *italique*, # Titre, - liste. Les variables sont remplacées à l'insertion.",
      },
    },
    {
      name: "scope",
      type: "select",
      label: "Portée",
      defaultValue: "partenaire",
      index: true,
      options: [
        { label: "Partenaire — visible par lui seul", value: "partenaire" },
        { label: "TIM — proposé à tous les partenaires", value: "tim" },
      ],
      // Seul un admin décide qu'un modèle s'adresse à tout le monde.
      access: { create: adminOnlyField, update: adminOnlyField },
      admin: { position: "sidebar" },
    },
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      label: "Partenaire",
      index: true,
      admin: {
        position: "sidebar",
        allowEdit: false,
        allowCreate: false,
        condition: (data) => data?.scope !== "tim",
        description: "Le modèle n'est proposé que sur les opportunités de ce partenaire.",
      },
      // Même règle que les opportunités : sa propre fiche pour un partenaire,
      // le paramètre d'URL pour un admin qui crée depuis une fiche.
      defaultValue: ({ req }) => {
        const own = partnerIdOf(req?.user);
        if (own != null && !hasAdminRole(req?.user)) return own;
        const p = req?.searchParams?.get?.("partner");
        return p ? p : undefined;
      },
    },
  ],
};
