import type { CollectionConfig, Field } from "payload";

import { isAdmin } from "@/core/access";
import { AdRushes, deleteFiles, prepare } from "@/modules/ads/collections/AdRushes";
import { INSPIRATION_VERDICTS } from "@/modules/ads/lib/style";

/**
 * Inspirations (plan Publicité, §9 sexies, I1) : des pubs à imiter ou à éviter,
 * de TIM ou d'ailleurs, de n'importe quelle marque ou application. Rien ici
 * n'est une donnée de l'entreprise : pas de source, pas de fonctionnalités, pas
 * de droits, pas de recadrage — une inspiration n'est JAMAIS montée.
 *
 * Même import que les rushes (direct au stockage, 500 Mo, MOV compris), même
 * conversion (images clés) ; l'IA en tire une FICHE DE STYLE que Charlie
 * valide, et que le directeur artistique lit avant chaque montage.
 *
 * Les blocs techniques (dépôt, conversion, version de travail, description IA,
 * état) sont ceux des rushes, repris tels quels : la chaîne de traitement est
 * la même pour les deux collections.
 */

const shared = (name: string): Field => {
  const f = (AdRushes.fields as Field[]).find((x) => "name" in x && x.name === name);
  if (!f) throw new Error(`Champ « ${name} » absent des rushes.`);
  return f;
};

export const AdInspirations: CollectionConfig = {
  slug: "ad-inspirations",
  labels: { singular: "Inspiration", plural: "Inspirations" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "verdict", "etat", "mediaType", "updatedAt"],
    group: "Publicité",
    description:
      "Des pubs que vous aimez, ou à éviter — de TIM ou de n'importe quelle marque. L'IA en tire une fiche de style que vous validez ; le directeur artistique la lit avant chaque montage. Jamais montrées dans une vidéo.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "-createdAt",
  hooks: { beforeChange: [prepare], afterDelete: [deleteFiles] },
  fields: [
    shared("upload"),
    shared("original"),
    { name: "title", type: "text", label: "Nom", required: true, admin: { placeholder: "Strava — l'app au naturel" } },
    {
      type: "row",
      fields: [
        { name: "verdict", type: "select", label: "Verdict", options: [...INSPIRATION_VERDICTS], defaultValue: "aimer", required: true, admin: { width: "30%" } },
        { name: "link", type: "text", label: "Lien (facultatif)", admin: { width: "70%", placeholder: "Bibliothèque publicitaire Meta, Instagram…" } },
      ],
    },
    {
      name: "why",
      type: "textarea",
      label: "Ce qui plaît, ou pas",
      required: true,
      maxLength: 600,
      admin: {
        placeholder: "Le téléphone en très gros plan, les mots qui apparaissent un à un, les couleurs franches…",
        description: "Ce qui vous fait l'aimer (ou la rejeter) : l'IA regarde les images avec cette phrase pour en tirer une fiche de style.",
      },
    },
    shared("insight"),
    shared("etat"),
    shared("mediaType"),
    shared("processing"),
    shared("working"),
    shared("ai"),
  ],
};
