import { readFileSync } from "node:fs";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import {
  SIGNABLE,
  buildSignedPdf,
  SIGNATURE_STYLES,
  consentText,
  initialsOf,
  isSignableKind,
  isSignatureStyle,
  maskEmail,
  sha256,
} from "@/modules/partner/lib/e-signature";

/**
 * Signature électronique simple par code e-mail : ce qui fait foi, c'est le
 * texte accepté, l'empreinte du document, et le PDF signé avec son certificat.
 */

const BASE = {
  kind: "devis" as const,
  reference: "SIG-000042",
  company: "SOUVET VMB",
  signer: { firstName: "Marie", lastName: "Durand", role: "Gérante", email: "marie@souvet.fr" },
  consent: consentText("devis", "SOUVET VMB"),
  originalHash: "a".repeat(64),
  codeSentAt: "2026-10-05T08:00:00.000Z",
  signedAt: "2026-10-05T08:03:12.000Z",
  ip: "81.250.1.2",
  userAgent: "Mozilla/5.0",
  documentName: "devis-souvet.pdf",
};

async function samplePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]);
  return doc.save();
}

// 1×1 PNG transparent.
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
);

describe("ce que le signataire accepte", () => {
  it("nomme le document et l'entreprise, et dit que le code vaut signature", () => {
    const t = consentText("contrat", "SOUVET VMB");
    expect(t).toContain("le contrat établi pour SOUVET VMB");
    expect(t).toContain("vaut signature électronique");
  });

  it("ne connaît que le devis et le contrat", () => {
    expect(isSignableKind("devis")).toBe(true);
    expect(isSignableKind("facture")).toBe(false);
    expect(SIGNABLE.contrat.signed).toBe("contractDocument");
  });
});

describe("empreinte et adresse", () => {
  it("l'empreinte change dès qu'un octet change", () => {
    expect(sha256(Uint8Array.from([1, 2, 3]))).not.toBe(sha256(Uint8Array.from([1, 2, 4])));
    expect(sha256(Uint8Array.from([1, 2, 3]))).toHaveLength(64);
  });

  it("masque l'adresse sans la rendre méconnaissable", () => {
    expect(maskEmail("charlie@gmail.com")).toMatch(/^c•+@gmail\.com$/);
    expect(maskEmail(null)).toBe("votre adresse e-mail");
  });
});

describe("le PDF signé", () => {
  it("garde toutes les pages du document et ajoute le certificat", async () => {
    const out = await buildSignedPdf({ ...BASE, original: await samplePdf(3), mime: "application/pdf" });
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getTitle()).toContain("SOUVET VMB");
  });

  it("accepte une image (devis scanné) : une page, puis le certificat", async () => {
    const out = await buildSignedPdf({ ...BASE, original: PNG, mime: "image/png" });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("ne casse pas sur un caractère hors des polices standard", async () => {
    const out = await buildSignedPdf({
      ...BASE,
      original: await samplePdf(1),
      mime: "application/pdf",
      company: "L’Atelier « Toitures » → Nord 🏗️",
      signer: { ...BASE.signer, lastName: "Nguyễn" },
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("un certificat trop long continue sur une page de plus, sans déborder", async () => {
    const long = "Mozilla/5.0 (compatible; navigateur très bavard) ".repeat(120);
    const out = await buildSignedPdf({ ...BASE, original: await samplePdf(1), mime: "application/pdf", userAgent: long });
    expect((await PDFDocument.load(out)).getPageCount()).toBeGreaterThanOrEqual(3);
  });
});

describe("la signature visible", () => {
  it("propose trois rendus, et en refuse tout autre", () => {
    expect(SIGNATURE_STYLES.map((s) => s.key)).toEqual(["elegante", "fluide", "manuscrite"]);
    expect(isSignatureStyle("fluide")).toBe(true);
    expect(isSignatureStyle("gothique")).toBe(false);
  });

  it("paraphe = initiales du prénom et du nom", () => {
    expect(initialsOf("charlie", " Piancatelli")).toBe("CP");
    expect(initialsOf("", "Durand")).toBe("D");
  });

  it("embarque chacune des trois polices dans le PDF signé", async () => {
    for (const style of SIGNATURE_STYLES) {
      const out = await buildSignedPdf({
        ...BASE,
        original: await samplePdf(1),
        mime: "application/pdf",
        signatureFont: new Uint8Array(readFileSync(`assets/fonts/signature/${style.file}`)),
      });
      expect((await PDFDocument.load(out)).getPageCount(), style.key).toBe(2);
    }
  });
});

describe("les e-mails de la signature", () => {
  it("le code nomme le document signé", () => {
    const mail = JOURNEY_EMAILS["code-signature"]({ code: "123456", clientName: "SOUVET VMB", documentNoun: "devis" });
    expect(mail.subject).toBe("123456 — votre code de signature TIM");
    expect(mail.html).toContain("Signature de votre devis");
  });

  it("le devis déposé : le client est invité à signer, lien direct vers sa page", () => {
    const mail = JOURNEY_EMAILS["document-disponible"]({ documentNoun: "devis", clientName: "SOUVET VMB" });
    expect(mail.html).toContain("Signer mon devis");
    expect(mail.html).toContain("next=%2Fespace-client%2Fsignature");
    expect(mail.text).toContain("Votre devis est disponible");
  });

  it("la copie signée mène au document", () => {
    const mail = JOURNEY_EMAILS["document-signe"]({ documentNoun: "contrat", documentUrl: "https://cdn/x.pdf" });
    expect(mail.html).toContain("https://cdn/x.pdf");
    expect(mail.html).toContain("Télécharger votre contrat signé");
  });
});
