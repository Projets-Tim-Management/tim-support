import type { CollectionBeforeOperationHook, CollectionBeforeValidateHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Médias publicitaires (plan Publicité) — les logos et les polices du kit de
 * marque, à joindre aux briefs Claude Design. Les enregistrements de l'app vont
 * dans les rushes ; les fichiers finis des pubs, sur leur créa.
 *
 * Séparés de la médiathèque : celle-ci est lisible par les partenaires selon des
 * règles de propriété (RBAC), et rien de ce qui prépare une publicité n'a à y
 * paraître. Admin seul. Stockés sur Vercel Blob sous le préfixe `ads/`.
 *
 * Une police sans licence ne doit pas finir dans une publicité : la licence est
 * exigée à l'enregistrement, pas rappelée dans une note.
 */

export const AD_MEDIA_KINDS = [
  { label: "Logo", value: "logo" },
  { label: "Police", value: "police" },
] as const;

export type AdMediaKind = (typeof AD_MEDIA_KINDS)[number]["value"];

const FONT_EXT = /\.(ttf|otf)$/i;

/** Une police se dépose en TTF ou OTF : les fichiers qu'on installe et qu'on joint à Claude Design. */
const checkFontFormat: CollectionBeforeValidateHook = ({ data, req }) => {
  const name = String(req.file?.name ?? data?.filename ?? "");
  if (data?.kind === "police" && name && !FONT_EXT.test(name)) {
    throw new Error("Une police se dépose en .ttf ou .otf.");
  }
  return data;
};

/**
 * Un SVG d'Affinity Designer commence par `<!DOCTYPE svg …>` : le contrôle de
 * Payload, qui n'attend qu'une déclaration XML ou des commentaires avant
 * `<svg>`, le prend alors pour du XML et le refuse (« Invalid MIME type:
 * application/xml », 14/10/2026). La ligne ne sert à rien : on la retire
 * avant le contrôle, sur le fichier reçu.
 */
export const stripSvgDoctype = (data: Buffer): Buffer => {
  const head = data.toString("utf8", 0, Math.min(data.length, 4096));
  const m = head.match(/<!DOCTYPE\s+svg[^>]*>\s*/i);
  if (!m || m.index === undefined) return data;
  const start = Buffer.byteLength(head.slice(0, m.index), "utf8");
  return Buffer.concat([data.subarray(0, start), data.subarray(start + Buffer.byteLength(m[0], "utf8"))]);
};

const cleanSvg: CollectionBeforeOperationHook = ({ args, req }) => {
  const file = req.file;
  if (file?.name?.toLowerCase().endsWith(".svg") && file.data?.length) {
    file.data = stripSvgDoctype(file.data);
    file.size = file.data.length;
  }
  return args;
};

const required = (message: string) => (value: unknown, { siblingData }: { siblingData: Record<string, unknown> }) =>
  value || !siblingData ? true : message;

export const AdMedia: CollectionConfig = {
  slug: "ad-media",
  labels: { singular: "Média publicitaire", plural: "Médias publicitaires" },
  admin: {
    useAsTitle: "filename",
    defaultColumns: ["filename", "kind", "updatedAt"],
    group: "Publicité",
    description: "Les logos et les polices du kit de marque. Réservé à TIM.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  hooks: { beforeOperation: [cleanSvg], beforeValidate: [checkFontFormat] },
  upload: {
    focalPoint: false,
    crop: false,
    mimeTypes: [
      "image/*",
      // Les navigateurs envoient une police sous des types variables : le
      // format est contrôlé par l'extension (checkFontFormat).
      "font/ttf",
      "font/otf",
      "font/sfnt",
      "application/x-font-ttf",
      "application/x-font-otf",
      "application/font-sfnt",
      "application/vnd.ms-opentype",
      "application/octet-stream",
    ],
  },
  fields: [
    { name: "kind", type: "select", label: "Nature", required: true, options: [...AD_MEDIA_KINDS], index: true },
    { name: "alt", type: "text", label: "Description", admin: { description: "Ce que montre le fichier, en une phrase." } },
    {
      name: "license",
      type: "textarea",
      label: "Licence de la police",
      validate: (v: unknown, opts: { siblingData: Record<string, unknown> }) =>
        opts.siblingData?.kind === "police" ? required("La licence doit autoriser l'usage publicitaire.")(v, opts) : true,
      admin: { condition: (d) => d?.kind === "police" },
    },
  ],
};
