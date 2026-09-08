import type { CollectionAfterChangeHook, CollectionBeforeDeleteHook, CollectionConfig, FieldHook } from "payload";
import { APIError } from "payload";

import { isAdmin } from "@/core/access";
import { DEFAULT_PALETTE_COLOR, PALETTE_OPTIONS } from "@/modules/dev/lib/devMeta";
import { DEV_PHASE_OPTIONS, DEV_STATUS_ROLES, DEV_STATUS_ROLE_OPTIONS } from "@/modules/dev/lib/devStatus";

/**
 * Statuts — les colonnes du Kanban, éditables.
 *
 * Ils étaient une liste figée dans le code (enum Postgres) : ajouter une colonne
 * exigeait une migration, donc un développeur. Ils sont désormais du contenu —
 * on en crée, on les renomme, on les recolore et on les réordonne depuis cet
 * écran, et le tableau suit immédiatement.
 *
 * Deux champs font tout le travail et méritent qu'on s'y arrête :
 *  - la PHASE range la colonne sous l'un des cinq bandeaux du Kanban. C'est ce
 *    qui permet d'avoir beaucoup de colonnes sans rendre l'écran illisible ;
 *  - les RÔLES disent ce que le statut DÉCLENCHE. Le code ne peut pas deviner
 *    qu'un statut fraîchement créé signifie « c'est livré » : sans rôle, un
 *    nouveau statut est une simple étape, et plus aucune date de jalon ne serait
 *    posée en passant par lui.
 */

/** Minuscules sans accents, façon slug — même traitement que `core/fields/slug`. */
const slugify = (val: string): string =>
  val
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

/**
 * Identifiant stable, posé à la création et jamais recalculé ensuite.
 *
 * Renommer « À trier » en « Boîte d'entrée » ne doit pas changer la clé : c'est
 * par elle que le code retrouve le statut d'entrée (celui qu'on pose sur un
 * développement qui vient de naître).
 */
const setKey: FieldHook = ({ value, data, originalDoc, operation }) => {
  if (typeof value === "string" && value.trim() !== "") return slugify(value);
  if (operation === "create") {
    const name = (data?.name ?? "") as string;
    return slugify(name) || `statut-${Date.now()}`;
  }
  return originalDoc?.key ?? value;
};

/**
 * Un statut déplacé emmène ses développements avec lui.
 *
 * `statusRank` est recopié sur chaque développement pour que la LISTE se trie
 * dans l'ordre du flux sans jointure. Sans cette propagation, réordonner les
 * colonnes aurait laissé la liste triée selon l'ancien ordre jusqu'à ce que
 * chaque fiche soit rouverte et réenregistrée.
 */
const propagateRank: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (previousDoc && previousDoc.position === doc.position) return doc;
  try {
    await req.payload.update({
      collection: "developments",
      where: { status: { equals: doc.id } },
      data: { statusRank: doc.position } as never,
      depth: 0,
      overrideAccess: true,
      req,
    });
  } catch (err) {
    // Le rang n'est qu'un ordre d'affichage : son échec ne doit pas empêcher
    // d'enregistrer le statut lui-même.
    req.payload.logger.error(`[dev] propagation du rang de statut échouée : ${err}`);
  }
  return doc;
};

/**
 * On ne supprime pas un statut qui porte des développements : la relation est
 * en `ON DELETE set null`, ils se retrouveraient donc sans statut, invisibles de
 * toutes les colonnes du Kanban. On demande de les déplacer d'abord.
 */
const guardUsed: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const used = await req.payload.count({
    collection: "developments",
    where: { status: { equals: id } },
    overrideAccess: true,
    req,
  });
  if (used.totalDocs > 0) {
    throw new APIError(
      `Ce statut porte encore ${used.totalDocs} développement(s). Déplacez-les dans une autre colonne avant de le supprimer.`,
      400,
    );
  }
};

export const DevStatuses: CollectionConfig = {
  slug: "dev-statuses",
  labels: { singular: "Statut", plural: "Statuts" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["position", "name", "phase", "roles", "hint"],
    group: "Développements",
    description:
      "Les colonnes du Kanban. L'ordre ci-dessous est celui du tableau — utilisez les flèches pour déplacer une colonne.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "position",
  hooks: { afterChange: [propagateRank], beforeDelete: [guardUsed] },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "name",
          type: "text",
          label: "Nom",
          required: true,
          admin: {
            width: "60%",
            placeholder: "Ex. En recette client",
            components: { Cell: "/modules/dev/admin/DevStatusNameCell#DevStatusNameCell" },
          },
        },
        {
          name: "color",
          type: "select",
          label: "Couleur",
          defaultValue: DEFAULT_PALETTE_COLOR,
          options: PALETTE_OPTIONS,
          admin: {
            width: "40%",
            components: { Field: "/modules/dev/admin/PaletteColorField#PaletteColorField" },
          },
        },
      ],
    },
    {
      name: "phase",
      type: "select",
      label: "Phase",
      required: true,
      defaultValue: "entree",
      options: DEV_PHASE_OPTIONS,
      index: true,
      admin: {
        description:
          "Le bandeau sous lequel la colonne se range dans le Kanban, et l'onglet qui la regroupe dans la liste.",
      },
    },
    {
      name: "roles",
      type: "select",
      hasMany: true,
      label: "Ce que ce statut déclenche",
      options: DEV_STATUS_ROLE_OPTIONS,
      admin: {
        description: DEV_STATUS_ROLES.map((r) => `${r.label} : ${r.hint}`).join(" — "),
        components: { Cell: "/modules/dev/admin/DevRolesCell#DevRolesCell" },
      },
    },
    {
      name: "hint",
      type: "text",
      label: "Aide",
      admin: {
        description:
          "Ce qui distingue ce statut du voisin. Affiché sous le sélecteur d'une fiche et au survol de la colonne.",
        placeholder: "Ex. Bug : reproduire et diagnostiquer avant de corriger.",
      },
    },
    {
      name: "position",
      type: "number",
      label: "Position",
      required: true,
      defaultValue: 999,
      index: true,
      admin: {
        position: "sidebar",
        description:
          "Ordre des colonnes, du plus petit au plus grand. Les statuts livrés sont espacés de 10 : il reste donc de la place pour en intercaler un sans renuméroter les autres.",
        components: { Cell: "/modules/dev/admin/DevStatusMoveCell#DevStatusMoveCell" },
      },
    },
    {
      name: "key",
      type: "text",
      label: "Clé",
      unique: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "Identifiant technique, posé à la création et jamais modifié — renommer le statut ne le change pas.",
      },
      hooks: { beforeValidate: [setKey] },
    },
  ],
};
