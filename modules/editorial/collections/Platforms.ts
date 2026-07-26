import type { CollectionConfig } from "payload";

import { editorialAccess } from "@/core/access";
import { slugField } from "@/core/fields/slug";

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
    group: "Features",
  },
  access: editorialAccess,
  fields: [
    { name: "name", type: "text", label: "Nom", required: true },
    slugField("name"),
  ],
};
