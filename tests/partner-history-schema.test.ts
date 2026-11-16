import type { Field } from "payload";
import { describe, expect, it } from "vitest";

import { PartnerClients } from "@/modules/partner/collections/PartnerClients";
import type { HistoryEntry } from "@/modules/partner/lib/history";

/**
 * Tout ce que le hook et la validation écrivent dans une ligne d'historique
 * doit exister dans le schéma : Payload écarte en silence un champ inconnu.
 * Le tampon `pennylane` a été perdu ainsi jusqu'au 05/11/2026 — le début de
 * facturation retombait sur la date de contrat, et aucun constat passé ne
 * s'affichait.
 */
describe("schéma de l'historique d'une fiche client", () => {
  it("garde chaque champ d'une ligne d'historique, tampon Pennylane compris", () => {
    const history = PartnerClients.fields.find((f): f is Extract<Field, { name: string; type: "array" }> => "name" in f && f.name === "history" && f.type === "array");
    const names = new Set((history?.fields ?? []).map((f) => ("name" in f ? f.name : "")));
    const written: (keyof HistoryEntry)[] = ["at", "totalLicences", "caHT", "commission", "commissionRate", "detail", "pennylane", "validatedAt", "validatedBy", "invoiceDate"];
    expect(written.filter((k) => !names.has(k))).toEqual([]);
  });
});
