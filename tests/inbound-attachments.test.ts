import { describe, expect, it } from "vitest";

import { cleanInlineImageRefs, selectInboundAttachments } from "@/modules/support/lib/inbound-attachments";

/** Les pièces jointes des réponses par e-mail : ce qu'on récupère, et le texte nettoyé des références brutes. */
const capture = { Name: "image001.png", ContentType: "image/png", ContentLength: 47815, ContentID: "image001.png@01DD6AE2.4254F4C0", DownloadToken: "tok1" };

describe("pièces jointes entrantes", () => {
  it("garde la capture collée et le PDF, écarte le logo de signature, l'exécutable et ce qui n'a pas de jeton", () => {
    const picked = selectInboundAttachments([
      capture,
      { Name: "devis.pdf", ContentType: "application/pdf", ContentLength: 120_000, DownloadToken: "tok2" },
      { Name: "logo.png", ContentType: "image/png", ContentLength: 2_000, ContentID: "logo@x", DownloadToken: "tok3" },
      { Name: "virus.exe", ContentType: "application/x-msdownload", ContentLength: 1_000, DownloadToken: "tok4" },
      { Name: "sans-jeton.png", ContentType: "image/png", ContentLength: 50_000 },
    ]);
    expect(picked.map((a) => a.Name)).toEqual(["image001.png", "devis.pdf"]);
  });
  it("une image jointe (pas collée) est gardée même petite", () => {
    expect(selectInboundAttachments([{ Name: "a.png", ContentType: "image/png", ContentLength: 1_000, DownloadToken: "t" }])).toHaveLength(1);
  });
  it("rien d'exploitable : liste vide", () => {
    expect(selectInboundAttachments(undefined)).toEqual([]);
  });
  it("remplace la référence brute de l'image collée par son nom", () => {
    const text = "il me manque la possibilité d'ajouter :\n\n[image001.png@01DD6AE2.4254F4C0](image001.png@01DD6AE2.4254F4C0)";
    expect(cleanInlineImageRefs(text, [capture])).toBe("il me manque la possibilité d'ajouter :\n\n[image : image001.png]");
  });
  it("laisse les vrais liens intacts", () => {
    const text = "voir [la doc](https://exemple.fr/doc)";
    expect(cleanInlineImageRefs(text, [capture])).toBe(text);
  });
});
