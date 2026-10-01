import type { CollectionConfig, Field, GlobalAfterChangeHook } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Historique des garde-fous de la publicité (demande du 01/10/2026) : qui a
 * changé quoi, quand, avant et après. Les plafonds avaient changé deux fois en
 * une journée sans qu'on sache par qui — un plafond de dépense dont on ignore
 * l'auteur n'en est plus vraiment un.
 *
 * Écrit par le serveur seul, à chaque enregistrement qui change une valeur ;
 * lisible des admins, jamais modifiable ni supprimable.
 */
export type SettingChange = { champ: string; libelle: string; avant: unknown; apres: unknown };

/** Les champs que Payload ajoute lui-même (dates, type) : jamais un réglage, donc jamais une modification. */
const SYSTEM_FIELDS = new Set(["id", "createdAt", "updatedAt", "globalType"]);

/** Les champs qui portent une valeur (pas les rangées ni les blocs repliables), avec leur libellé. */
export function settingFields(fields: Field[]): { name: string; label: string }[] {
  return fields.flatMap((f) => {
    if ("fields" in f && !("name" in f && f.name)) return settingFields(f.fields as Field[]);
    if ("name" in f && f.name && !("fields" in f) && !SYSTEM_FIELDS.has(f.name)) return [{ name: f.name, label: typeof f.label === "string" ? f.label : f.name }];
    return [];
  });
}

/** Les valeurs qui ont changé entre deux états. Pure — c'est elle qu'on teste. */
export function settingChanges(fields: { name: string; label: string }[], before: Record<string, unknown> | null | undefined, after: Record<string, unknown>): SettingChange[] {
  const norm = (v: unknown) => (v === undefined ? null : v);
  return fields
    .filter((f) => JSON.stringify(norm(before?.[f.name])) !== JSON.stringify(norm(after[f.name])))
    .map((f) => ({ champ: f.name, libelle: f.label, avant: norm(before?.[f.name]), apres: norm(after[f.name]) }));
}

const show = (v: unknown) => (v === null ? "—" : typeof v === "boolean" ? (v ? "oui" : "non") : String(v));
export const changeSummary = (changes: SettingChange[]) => changes.map((c) => `${c.libelle} : ${show(c.avant)} → ${show(c.apres)}`).join(" ; ");

/** Le crochet à poser sur un global : une ligne d'historique par enregistrement qui change quelque chose. */
export const recordSettingsHistory =
  (fields: Field[]): GlobalAfterChangeHook =>
  async ({ doc, previousDoc, req }) => {
    const changes = settingChanges(settingFields(fields), previousDoc as Record<string, unknown>, doc as Record<string, unknown>);
    if (!changes.length) return doc;
    await req.payload.create({
      collection: "ads-settings-history",
      data: { changedBy: req.user?.id ?? null, changes, summary: changeSummary(changes) } as never,
      overrideAccess: true,
      req,
    });
    return doc;
  };

export const AdsSettingsHistory: CollectionConfig = {
  slug: "ads-settings-history",
  labels: { singular: "Modification des garde-fous", plural: "Historique des garde-fous" },
  admin: {
    useAsTitle: "summary",
    defaultColumns: ["createdAt", "changedBy", "summary"],
    group: "Publicité",
    description: "Chaque changement des garde-fous : qui, quand, avant, après. Écrit par le serveur ; rien ne s'y modifie.",
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-createdAt",
  fields: [
    { name: "changedBy", type: "relationship", relationTo: "users", label: "Par", admin: { readOnly: true, description: "Vide : un script ou une migration." } },
    { name: "summary", type: "text", label: "Ce qui a changé", required: true, admin: { readOnly: true } },
    { name: "changes", type: "json", label: "Détail (avant, après)", admin: { readOnly: true } },
  ],
};
