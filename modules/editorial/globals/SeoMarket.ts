import type { GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * LE MARCHÉ SEO (19/11/2026) : le résultat de l'analyse mensuelle DataForSEO — nos
 * concurrents réels sur Google (ceux qui se classent sur les mêmes requêtes que nous),
 * le nombre de requêtes sur lesquelles tim-management.co est classé, la date et le coût.
 * Écrit par le code ; lu par les agents SEO/GEO (Sergey, Paige, Guy, Georges).
 */
export const SeoMarket: GlobalConfig = {
  slug: "seo-market",
  label: "Marché SEO",
  admin: { group: "Éditorial", hidden: true },
  access: { read: isAdmin, update: () => false },
  fields: [
    { name: "ranAt", type: "date", label: "Analyse du" },
    { name: "costUsd", type: "number", label: "Coût ($)" },
    { name: "ourKeywords", type: "number", label: "Requêtes où tim-management.co est classé" },
    { name: "ourTop10", type: "number", label: "Dont dans le top 10" },
    { name: "competitors", type: "json", label: "Concurrents sur Google (domaine, requêtes communes, position moyenne)" },
    { name: "errors", type: "json", label: "Erreurs du dernier passage" },
  ],
};
