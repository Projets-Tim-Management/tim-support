import type { Field } from "payload";

/**
 * Tableau « Documents » — les pièces rattachées à une fiche.
 *
 * Le même objet existe sur un ticket, une opportunité et un développement :
 * un fichier, ce qu'on cherchera dans six mois (l'intitulé), d'où il vient (la
 * note), et la signature du dépôt. Trois copies conformes cohabitaient ; la
 * quatrième aurait fini par diverger.
 *
 * À combiner avec le hook `stampDocuments` (core/hooks/documents), qui date et
 * signe les lignes NEUVES — corriger l'intitulé d'une pièce n'en fait pas la
 * sienne.
 */
export const documentsField = (options: {
  /** Ce que ces pièces sont, et ce qu'elles ne sont pas. Propre à chaque fiche. */
  description: string;
  name?: string;
  label?: string | false;
}): Field => ({
  name: options.name ?? "documents",
  type: "array",
  label: options.label ?? false,
  labels: { singular: "Document", plural: "Documents" },
  admin: {
    description: options.description,
    components: {
      // Mosaïque : une pièce se reconnaît à ce qu'elle montre, pas à un numéro
      // de ligne. Le détail s'ouvre au clic.
      Field: "/admin/fields/Documents#DocumentsField",
    },
  },
  fields: [
    {
      name: "file",
      type: "upload",
      relationTo: "media",
      required: true,
      label: "Fichier",
      // Dépôt direct au CDN : un gros PDF ne transite pas par la fonction
      // serveur, qui le refuserait au-delà de sa limite.
      admin: { components: { Field: "/admin/fields/DirectUpload#default" } },
    },
    {
      name: "label",
      type: "text",
      label: "Intitulé",
      admin: { description: "Ce qu'on cherchera dans six mois. À défaut, le nom du fichier." },
    },
    {
      name: "note",
      type: "textarea",
      label: "Note",
      admin: { description: "D'où vient cette pièce, ce qu'elle montre." },
    },
    {
      type: "row",
      fields: [
        {
          name: "addedAt",
          type: "date",
          label: "Déposé le",
          admin: {
            width: "50%",
            readOnly: true,
            date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
          },
        },
        {
          name: "addedBy",
          type: "relationship",
          relationTo: "users",
          label: "Déposé par",
          admin: { width: "50%", readOnly: true },
        },
      ],
    },
  ],
});
