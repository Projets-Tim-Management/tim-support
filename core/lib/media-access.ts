import type { Access, Field, PayloadRequest, Where } from "payload";

import { hasAdminRole, isPartner, isPartnerMetier, isSupport, partnerIdOf } from "@/core/access";

/**
 * Qui LIT la médiathèque par l'API (/api/media, GraphQL, et le peuplement des
 * champs « fichier » dans l'admin).
 *
 * Les fichiers eux-mêmes sont servis par le CDN Blob, à une adresse au nom
 * aléatoire (`disablePayloadAccessControl`) : les pages du site, l'espace
 * client et les e-mails n'appellent jamais cette API. Ce qui se protège ici,
 * c'est la LISTE — sans cette règle, n'importe qui pouvait obtenir, sans se
 * connecter, l'adresse de tous les devis et contrats signés.
 *
 *   - sans compte back-office : rien ;
 *   - admin, support : tout ;
 *   - partenaire : ce qu'il a déposé lui-même, les visuels communs (features,
 *     récompenses, missions, avatars, logos de l'apparence), et les pièces de
 *     SES fiches — le partenaire-métier celles de ses clients (fiches,
 *     contrats, signatures, activités), le partenaire-utilisateur celles de ses
 *     missions ; chacun celles de sa propre fiche partenaire. Jamais les pièces
 *     d'un autre partenaire, images comprises (un devis signé peut être une photo).
 */

type Source = {
  collection: string;
  where?: (pid: string | number) => Where;
  /** Limiter aux champs nommés (sinon : tous les champs « fichier »). */
  only?: string[];
  /** Lire aussi le brouillon en cours (fiche client : pièce déposée, pas encore publiée). */
  draft?: boolean;
};

/** Visuels communs à tous les partenaires. */
const SHARED: Source[] = [
  { collection: "features" },
  { collection: "rewards" },
  { collection: "missions" },
  { collection: "users", only: ["avatar"] },
  { collection: "partners", only: ["avatar"] },
];

const OWN_PARTNER: Source = { collection: "partners", where: (pid) => ({ id: { equals: pid } }) };

/** Les pièces des clients d'un partenaire-métier. */
const METIER: Source[] = [
  { collection: "partner-clients", where: (pid) => ({ partner: { equals: pid } }), draft: true },
  { collection: "client-contracts", where: (pid) => ({ partner: { equals: pid } }) },
  { collection: "electronic-signatures", where: (pid) => ({ partner: { equals: pid } }) },
  { collection: "client-activities", where: (pid) => ({ partner: { equals: pid } }) },
  OWN_PARTNER,
];

/** Les pièces d'un partenaire-utilisateur. */
const UTILISATEUR: Source[] = [
  { collection: "mission-submissions", where: (pid) => ({ partner: { equals: pid } }) },
  OWN_PARTNER,
];

const APPEARANCE_FIELDS = ["logo", "icon", "companyLogo"];

/** Tous les médias référencés par un document (champs « fichier », y compris dans les tableaux et groupes). */
export function mediaIdsIn(fields: Field[], value: unknown, out: Set<string | number>): void {
  if (!value || typeof value !== "object") return;
  const data = value as Record<string, unknown>;
  for (const field of fields) {
    if ("fields" in field && !("name" in field)) {
      // Ligne, bloc repliable : pas de niveau de données.
      mediaIdsIn(field.fields, data, out);
      continue;
    }
    if (field.type === "tabs") {
      for (const tab of field.tabs) mediaIdsIn(tab.fields, "name" in tab && tab.name ? data[tab.name] : data, out);
      continue;
    }
    if (!("name" in field)) continue;
    const v = data[field.name];
    if (field.type === "upload" && field.relationTo === "media") {
      for (const item of Array.isArray(v) ? v : [v]) {
        const id = item && typeof item === "object" ? (item as { id?: string | number }).id : item;
        if (typeof id === "number" || typeof id === "string") out.add(id);
      }
    } else if (field.type === "group") {
      mediaIdsIn(field.fields, v, out);
    } else if (field.type === "array" && Array.isArray(v)) {
      for (const row of v) mediaIdsIn(field.fields, row, out);
    } else if (field.type === "blocks" && Array.isArray(v)) {
      for (const row of v) {
        const block = field.blocks.find((b) => b.slug === (row as { blockType?: string })?.blockType);
        if (block) mediaIdsIn(block.fields, row, out);
      }
    }
  }
}

/** Ne lire que les champs « fichier » (et leurs conteneurs) : pas le document entier. */
export function uploadSelect(fields: Field[], only?: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if ("fields" in field && !("name" in field)) {
      Object.assign(out, uploadSelect(field.fields, only));
      continue;
    }
    if (field.type === "tabs") {
      for (const tab of field.tabs) {
        const inner = uploadSelect(tab.fields, only);
        if (!Object.keys(inner).length) continue;
        if ("name" in tab && tab.name) out[tab.name] = inner;
        else Object.assign(out, inner);
      }
      continue;
    }
    if (!("name" in field)) continue;
    if (field.type === "upload" && field.relationTo === "media" && (!only || only.includes(field.name))) out[field.name] = true;
    else if ((field.type === "group" || field.type === "array") && !only) {
      const inner = uploadSelect(field.fields);
      if (Object.keys(inner).length) out[field.name] = inner;
    } else if (field.type === "blocks" && !only && field.blocks.some((b) => Object.keys(uploadSelect(b.fields)).length)) {
      // Des blocs : on les lit entiers (leur type décide de leurs champs).
      out[field.name] = true;
    }
  }
  return out;
}

type Fields = { config: { fields: Field[] } };

async function idsFrom(req: PayloadRequest, sources: Source[], pid: string | number, into: Set<string | number>): Promise<void> {
  for (const src of sources) {
    const config = (req.payload.collections as Record<string, Fields | undefined>)[src.collection]?.config;
    if (!config) continue;
    const fields = src.only ? config.fields.filter((f) => "name" in f && src.only!.includes(f.name)) : config.fields;
    const select = uploadSelect(config.fields, src.only);
    if (!Object.keys(select).length) continue;
    const read = (draft: boolean) =>
      req.payload.find({
        collection: src.collection as never,
        ...(src.where ? { where: src.where(pid) } : {}),
        select: select as never,
        depth: 0,
        limit: 0,
        pagination: false,
        overrideAccess: true,
        draft,
        req,
      });
    for (const doc of (await read(false)).docs) mediaIdsIn(fields, doc, into);
    if (src.draft) for (const doc of (await read(true)).docs) mediaIdsIn(fields, doc, into);
  }
}

/** Les médias qu'un partenaire peut lire — calculés une fois par requête. */
async function partnerMediaIds(req: PayloadRequest, pid: string | number, metier: boolean): Promise<(string | number)[]> {
  const ctx = req.context as { partnerMediaIds?: (string | number)[] };
  if (ctx.partnerMediaIds) return ctx.partnerMediaIds;
  const ids = new Set<string | number>();
  await idsFrom(req, [...SHARED, ...(metier ? METIER : UTILISATEUR)], pid, ids);
  const appearance = (await req.payload.findGlobal({ slug: "appearance" as never, depth: 0, overrideAccess: true, req })) as Record<string, unknown>;
  for (const k of APPEARANCE_FIELDS) {
    const v = appearance?.[k];
    const id = v && typeof v === "object" ? (v as { id?: string | number }).id : v;
    if (typeof id === "number" || typeof id === "string") ids.add(id);
  }
  ctx.partnerMediaIds = [...ids];
  return ctx.partnerMediaIds;
}

export const mediaRead: Access = async ({ req }) => {
  const { user } = req;
  if (hasAdminRole(user) || isSupport(user)) return true;
  const pid = partnerIdOf(user);
  if (!isPartner(user) || pid == null || !user) return false;
  const ids = await partnerMediaIds(req, pid, isPartnerMetier(user));
  const where: Where = {
    or: [
      // Ce qu'il vient de déposer : lisible avant même que la fiche soit enregistrée.
      { createdBy: { equals: user.id } },
      ...(ids.length ? [{ id: { in: ids } }] : []),
    ],
  };
  return where;
};
