import type { CollectionConfig } from "payload";
import { describe, expect, it } from "vitest";

import { AdAccounts } from "@/modules/ads/collections/AdAccounts";
import { Features } from "@/modules/editorial/collections/Features";
import { PartnerClients } from "@/modules/partner/collections/PartnerClients";

/**
 * Payload n'affiche le menu ⋯ d'une fiche que si l'utilisateur peut CRÉER ou
 * SUPPRIMER dans la collection (DocumentControls, `showDotMenu`). Des actions
 * placées dans `editMenuItems` d'une collection où ces deux droits sont fermés
 * sont donc invisibles — c'est arrivé aux comptes publicitaires, en production,
 * le 29/09/2026 : « Archiver » et « Supprimer définitivement » n'apparaissaient
 * nulle part.
 */
const admin = { req: { user: { roles: ["admin", "super-admin"] } }, id: 1, data: {} } as never;

const allows = async (fn: unknown): Promise<boolean> => {
  if (typeof fn !== "function") return fn !== false;
  const r = await (fn as (a: unknown) => unknown)(admin);
  return r !== false;
};

const COLLECTIONS: CollectionConfig[] = [AdAccounts, Features, PartnerClients];

describe("menu ⋯ des fiches", () => {
  it.each(COLLECTIONS.map((c) => [c.slug, c] as const))("%s : des actions dans le menu ⋯ ont un menu pour les porter", async (_slug, c) => {
    const items = c.admin?.components?.edit?.editMenuItems;
    if (!items?.length) return;
    const visible = (await allows(c.access?.create)) || (await allows(c.access?.delete));
    expect(visible, `${c.slug} : editMenuItems déclarés, mais ni création ni suppression pour un admin — le menu ⋯ ne s'affichera pas`).toBe(true);
  });

  it("les comptes publicitaires portent leurs actions en boutons, pas dans le menu ⋯", () => {
    const edit = AdAccounts.admin?.components?.edit;
    expect(edit?.editMenuItems).toBeUndefined();
    expect(edit?.beforeDocumentControls).toContain("/modules/ads/admin/AdAccountActions#AdAccountActions");
    expect(edit?.beforeDocumentControls).toContain("/modules/ads/admin/PurgeAccountModal#PurgeAccountModal");
  });
});
