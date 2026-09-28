import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { renderContractPdf } from "@/modules/partner/lib/contract-pdf";
import { renderContract } from "@/modules/partner/lib/contract-render";
import { DEFAULT_CONTRACT_SECTIONS, DEFAULT_CONTRACT_TITLE } from "@/modules/partner/lib/contract-template.default";
import { buildSignedPdf, sha256 } from "@/modules/partner/lib/e-signature";
import { extractSlots, readLayout } from "@/modules/partner/lib/signature-layout";

/**
 * Contrat généré → plan des zones de signature rangé dans le PDF → la
 * signature en ligne remplit le bloc « Le Client » et les paraphes.
 */
async function generated() {
  const contract = renderContract({ title: DEFAULT_CONTRACT_TITLE, sections: DEFAULT_CONTRACT_SECTIONS }, {});
  return renderContractPdf({
    contract,
    priceRows: [],
    reference: "CTR-231220-v1",
    clientName: "SOUVET VMB",
    providerName: "LC DEV",
    signatories: {
      provider: { company: "LC DEV" },
      client: { company: "SOUVET VMB" },
    },
  });
}

describe("plan de signature du contrat généré", () => {
  it("relève les zones des deux blocs de signature et retire leurs liens", async () => {
    const doc = await PDFDocument.load(await generated());
    const layout = readLayout(doc);
    expect(layout).not.toBeNull();
    const client = layout!.slots.filter((s) => s.role === "client");
    // Deux blocs (fin de l'article 15, fin de l'Annexe 5) × 4 zones.
    expect(client).toHaveLength(8);
    expect(new Set(client.map((s) => s.field))).toEqual(new Set(["name", "role", "date", "signature"]));
    for (const s of layout!.slots) expect(s.w).toBeGreaterThan(0);
    // Plus aucun lien tim-sig:// dans le document envoyé : une nouvelle lecture
    // ne trouve plus rien à relever.
    expect(extractSlots(doc)).toHaveLength(0);
  }, 20000);

  it("un document sans plan se signe comme avant", async () => {
    const plain = await PDFDocument.create();
    plain.addPage();
    expect(readLayout(plain)).toBeNull();
  });

  it("la signature garde toutes les pages et ajoute le certificat", async () => {
    const sent = new Uint8Array(await generated());
    const pages = (await PDFDocument.load(sent)).getPageCount();
    const now = new Date().toISOString();
    const signed = await buildSignedPdf({
      original: sent,
      mime: "application/pdf",
      kind: "contrat",
      reference: "SIG-000001",
      company: "SOUVET VMB",
      signer: { firstName: "Marie", lastName: "Durand", role: "Gérante", email: "m@souvet.fr" },
      consent: "ok",
      originalHash: sha256(sent),
      codeSentAt: now,
      signedAt: now,
    });
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(pages + 1);
  }, 20000);
});

import { checkConfirmations, pagePlanOf } from "@/modules/partner/lib/e-signature-server";

describe("parapher chaque page avant de signer", () => {
  it("le plan d'un contrat généré : toutes les pages, et celles à signer", async () => {
    const plan = await pagePlanOf(new Uint8Array(await generated()), "application/pdf");
    expect(plan.count).toBeGreaterThan(10);
    expect(plan.signaturePages).toHaveLength(2);
  }, 20000);

  it("refuse tant qu'une page manque, ou qu'une page de signature n'est pas signée", () => {
    const plan = { count: 3, signaturePages: [3] };
    const at = "2026-09-28T10:00:00.000Z";
    expect(checkConfirmations(plan, [{ page: 1, at }, { page: 3, at, signed: true }])).toEqual({ ok: false, missing: [2] });
    expect(checkConfirmations(plan, [{ page: 1, at }, { page: 2, at }, { page: 3, at }])).toEqual({ ok: false, missing: [3] });
    const ok = checkConfirmations(plan, [{ page: 3, at, signed: true }, { page: 1, at }, { page: 2, at }, { page: 9, at }]);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.list.map((c) => c.page)).toEqual([1, 2, 3]);
  });

  it("une image se paraphe en une page", async () => {
    const plan = await pagePlanOf(new Uint8Array(), "image/png");
    expect(plan.count).toBe(1);
    expect(plan.signaturePages).toEqual([]);
    expect(plan.fields.map((f) => f.kind)).toEqual(["paraphe"]);
  });
});

import { buildCountersignedPdf, countersignConsent } from "@/modules/partner/lib/e-signature";

describe("contresignature TIM", () => {
  it("ajoute le certificat de contresignature après celui du client, sans perdre le plan", async () => {
    const sent = new Uint8Array(await generated());
    const now = new Date().toISOString();
    const signed = await buildSignedPdf({
      original: sent,
      mime: "application/pdf",
      kind: "contrat",
      reference: "SIG-000001",
      company: "SOUVET VMB",
      signer: { firstName: "Marie", lastName: "Durand", role: "Gérante", email: "m@souvet.fr" },
      consent: "ok",
      originalHash: sha256(sent),
      codeSentAt: now,
      signedAt: now,
    });
    // Le plan a suivi le PDF signé : TIM peut contresigner aux bons endroits.
    expect(readLayout(await PDFDocument.load(signed))?.pages).toBe((await PDFDocument.load(sent)).getPageCount());
    const final = await buildCountersignedPdf({
      signedPdf: signed,
      reference: "CTR-231220-v1",
      company: "SOUVET VMB",
      signer: { firstName: "Charlie", lastName: "Piancatelli", role: "Directeur Général", email: "c@tim.fr" },
      consent: countersignConsent("SOUVET VMB"),
      signedHash: sha256(signed),
      codeSentAt: now,
      signedAt: now,
    });
    expect((await PDFDocument.load(final)).getPageCount()).toBe((await PDFDocument.load(signed)).getPageCount() + 1);
  }, 30000);
});

import { confirmationsFrom, planFor } from "@/modules/partner/lib/sign-fields";

describe("champs façon DocuSign", () => {
  it("contrat généré : un paraphe par page du contrat et la signature du bon signataire", async () => {
    const sent = new Uint8Array(await generated());
    const client = await pagePlanOf(sent, "application/pdf", "client");
    const paraphes = client.fields.filter((f) => f.kind === "paraphe");
    expect(paraphes).toHaveLength(client.count);
    expect(client.fields.filter((f) => f.kind === "signature")).toHaveLength(2);
    // TIM : les mêmes pages, à DROITE de la case (le client est à gauche).
    const tim = await pagePlanOf(sent, "application/pdf", "provider");
    const [c1, t1] = [paraphes[0], tim.fields.find((f) => f.kind === "paraphe")!];
    expect(t1.x).toBeGreaterThan(c1.x + c1.w);
  }, 20000);

  it("document sans plan : un paraphe en bas à droite de chaque page, aucune signature", () => {
    const plan = planFor("client", [{ w: 595, h: 842 }, { w: 595, h: 842 }], null);
    expect(plan.fields.map((f) => f.kind)).toEqual(["paraphe", "paraphe"]);
    expect(plan.signaturePages).toEqual([]);
  });

  it("une page n'est confirmée que quand tous ses champs sont remplis", () => {
    const plan = planFor("client", [{ w: 595, h: 842 }, { w: 595, h: 842 }], {
      paraphe: { x: 400, y: 12, w: 124, h: 24 },
      pages: 2,
      slots: [{ role: "client", field: "signature", page: 1, x: 300, y: 300, w: 200, h: 40 }],
    });
    const t = "2026-09-28T10:00:00.000Z";
    // Page 2 : paraphe seul, pas encore la signature.
    expect(confirmationsFrom(plan, { "paraphe-1": t, "paraphe-2": t })).toEqual([{ page: 1, at: t }]);
    const sig = plan.fields.find((f) => f.kind === "signature")!.id;
    expect(confirmationsFrom(plan, { "paraphe-1": t, "paraphe-2": t, [sig]: t })).toEqual([
      { page: 1, at: t },
      { page: 2, at: t, signed: true },
    ]);
  });
});
