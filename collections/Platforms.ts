import type { CollectionConfig } from "payload";

import { editorialAccess } from "./access";
import { slugField } from "../fields/slug";

/**
 * Plateformes (taxonomie non hiérarchique attachée aux features).
 * Sert de filtre : GET /features?platform=…
 */
export const Platforms: CollectionConfig = {
  slug: "platforms",
  labels: { singular: "Plateforme", plural: "Plateformes" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug"],
    group: "Éditorial",
  },
  access: editorialAccess,
  fields: [
    { name: "name", type: "text", label: "Nom", required: true },
    slugField("name"),
  ],
};
