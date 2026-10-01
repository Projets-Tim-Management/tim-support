import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig, TextFieldSingleValidation } from "payload";

import { isAdmin } from "@/core/access";
import { PAGE_ID, parsePageRef } from "@/modules/ads/lib/ad-library";

/**
 * Concurrents suivis (plan Publicité, §9 quater, décision 2 du 29/09/2026).
 *
 * La liste de départ se saisit à la main. L'agent peut en proposer d'autres,
 * trouvés par mots-clés dans la bibliothèque publicitaire : ils naissent
 * `propose` et n'entrent dans la liste (`suivi`) que sur le geste de Charlie.
 * Seuls les `suivi` sont lus quand l'agent étudie les publicités concurrentes.
 *
 * Un concurrent EST l'identifiant de sa page Meta (unique) : on colle un lien
 * de la bibliothèque ou l'identifiant seul, et seul l'identifiant reste dans
 * le champ. Le lien collé est gardé à part, tel quel, pour y retourner.
 */
export const COMPETITOR_STATUSES = [
  { label: "Suivi", value: "suivi" },
  { label: "Proposé par l'agent", value: "propose" },
  { label: "Refusé", value: "refuse" },
] as const;

/**
 * Lien collé → identifiant, avant la validation. Un lien illisible est laissé
 * tel quel : c'est la validation du champ qui dit pourquoi il est refusé.
 */
const normalizePageRef: CollectionBeforeValidateHook = ({ data, originalDoc }) => {
  if (!data || data.pageId == null) return data;
  const ref = parsePageRef(data.pageId);
  if (!ref.ok) return data;
  const sourceUrl = ref.sourceUrl ?? (ref.pageId === originalDoc?.pageId ? originalDoc?.sourceUrl : null);
  return { ...data, pageId: ref.pageId, sourceUrl: sourceUrl ?? null };
};

/** Le motif du refus, ou un doublon nommé : « déjà dans la liste », pas une erreur de base. */
const validatePageId: TextFieldSingleValidation = async (value, { req, id }) => {
  if (!value || !PAGE_ID.test(value)) {
    const ref = parsePageRef(value);
    return ref.ok ? true : ref.reason;
  }
  const same = await req.payload.find({
    collection: "ad-competitors",
    where: { and: [{ pageId: { equals: value } }, ...(id != null ? [{ id: { not_equals: id } }] : [])] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const other = same.docs[0] as { name?: string; status?: string } | undefined;
  if (!other) return true;
  const state = other.status === "refuse" ? " (refusé)" : other.status === "propose" ? " (proposé par l'agent)" : "";
  return `Cette page est déjà dans la liste : « ${other.name ?? value} »${state}.`;
};

/** La date du geste : posée quand l'état passe à « suivi » ou « refusé », pas avant. */
const stampDecision: CollectionBeforeChangeHook = ({ data, originalDoc }) =>
  data?.status && data.status !== "propose" && data.status !== originalDoc?.status ? { ...data, decidedAt: new Date().toISOString() } : data;

export const AdCompetitors: CollectionConfig = {
  slug: "ad-competitors",
  labels: { singular: "Concurrent", plural: "Concurrents" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "pageId", "status", "decidedAt"],
    group: "Publicité",
    description: "Les pages Facebook des concurrents dont l'agent lit les publicités. Il peut en proposer ; elles n'entrent qu'après validation.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "name",
  hooks: { beforeValidate: [normalizePageRef], beforeChange: [stampDecision] },
  fields: [
    { name: "name", type: "text", label: "Nom", required: true },
    {
      name: "pageId",
      type: "text",
      // Court : c'est aussi l'en-tête de colonne de la liste.
      label: "Page Meta (lien ou identifiant)",
      required: true,
      unique: true,
      index: true,
      validate: validatePageId,
      admin: {
        placeholder: "https://www.facebook.com/ads/library/?…&view_all_page_id=1759865937563144",
        description:
          "Collez le lien de l'annonceur dans la bibliothèque publicitaire Meta (il contient view_all_page_id=…), ou l'identifiant seul. À l'enregistrement, seul l'identifiant reste ici ; le lien est gardé en dessous.",
      },
    },
    {
      name: "sourceUrl",
      type: "text",
      label: "Lien d'origine",
      admin: { readOnly: true, condition: (data) => Boolean(data?.sourceUrl), description: "Le lien collé, tel quel." },
    },
    {
      type: "row",
      fields: [
        { name: "status", type: "select", label: "État", options: [...COMPETITOR_STATUSES], defaultValue: "suivi", required: true, index: true, admin: { width: "50%" } },
        { name: "decidedAt", type: "date", label: "Ajouté ou refusé le", admin: { width: "50%", readOnly: true } },
      ],
    },
    { name: "proposedBy", type: "relationship", relationTo: "ad-agent-runs", label: "Proposé par le passage", admin: { readOnly: true } },
    { name: "keywords", type: "text", label: "Mots-clés qui l'ont fait trouver", admin: { readOnly: true } },
    { name: "rationale", type: "textarea", label: "Pourquoi l'agent le propose", admin: { readOnly: true } },
  ],
};
