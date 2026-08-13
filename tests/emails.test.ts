import { describe, expect, it } from "vitest";
import { JOURNEY_EMAILS } from "@/modules/marketing/lib/emails";
import { PHASE_DE_TEST_EMAILS } from "@/modules/marketing/lib/journey";

const ctx = {
  clientName: "PIANCATELLI TOITURES",
  contactFirstName: "Charlie",
  partnerName: "Tim Management",
  startDate: "2026-08-31T00:00:00.000Z",
  endDate: "2026-09-28T00:00:00.000Z",
  sessionAt: "2026-08-28T14:00:00.000Z",
  sessionModality: "en visio",
  credentialCount: 12,
  code: "094220",
  dossierDeadline: "2026-08-26T00:00:00.000Z",
};

describe("gabarits d'e-mails du parcours", () => {
  it("chaque gabarit produit un objet, un texte et un HTML complet", () => {
    for (const [key, build] of Object.entries(JOURNEY_EMAILS)) {
      const mail = build(ctx);
      expect(mail.subject, key).toBeTruthy();
      expect(mail.text.length, key).toBeGreaterThan(60);
      expect(mail.html, key).toContain("<!doctype html>");
      // Charte : logo en tête et pied de page signé.
      expect(mail.html, key).toContain("TIM Management");
    }
  });

  it("ne laisse aucun trou de variable dans le rendu", () => {
    for (const [key, build] of Object.entries(JOURNEY_EMAILS)) {
      const mail = build(ctx);
      expect(mail.html, key).not.toMatch(/undefined|\[object Object\]|\{\{/);
      expect(mail.text, key).not.toMatch(/undefined|\[object Object\]|\{\{/);
    }
  });

  it("reste lisible même sans aucune donnée de contexte", () => {
    for (const [key, build] of Object.entries(JOURNEY_EMAILS)) {
      const mail = build({});
      expect(mail.subject, key).toBeTruthy();
      expect(mail.html, key).not.toMatch(/undefined|null/);
      expect(mail.text, key).not.toMatch(/undefined|null/);
    }
  });

  it("échappe le HTML des données client", () => {
    const mail = JOURNEY_EMAILS["invitation-espace-client"]({
      clientName: "<script>alert(1)</script>",
      contactFirstName: "A<b>",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("couvre tous les envois client et partenaire déclarés", () => {
    const interne = new Set(["demande-recue", "devis-a-rediger", "dossier-a-verifier", "demande-contrat-tim"]);
    const attendus = PHASE_DE_TEST_EMAILS.filter((e) => !interne.has(e.key)).map((e) => e.key);
    for (const key of attendus) expect(JOURNEY_EMAILS, key).toHaveProperty(key);
  });

  it("un seul bouton d'action par message", () => {
    for (const [key, build] of Object.entries(JOURNEY_EMAILS)) {
      const buttons = (build(ctx).html.match(/padding:13px 26px/g) ?? []).length;
      expect(buttons, key).toBeLessThanOrEqual(1);
    }
  });
});

describe("échéance du dossier de démarrage", () => {
  const build = JOURNEY_EMAILS["invitation-espace-client"];

  it("annonce la date limite quand elle est connue", () => {
    const mail = build(ctx);
    expect(mail.html).toContain("À compléter avant le");
    expect(mail.html).toContain("mercredi 26 août");
    expect(mail.text).toContain("MERCREDI 26 AOÛT");
  });

  it("explique pourquoi ce délai, en citant le démarrage", () => {
    expect(build(ctx).html).toContain("avant le démarrage, le lundi 31 août");
  });

  it("n'invente aucune date quand l'échéance est inconnue", () => {
    const mail = build({ clientName: "X", startDate: ctx.startDate });
    expect(mail.html).not.toContain("À compléter avant le");
    // Le message reste utile : il dit la conséquence, sans fabriquer de délai.
    expect(mail.html).toContain("nous ne pouvons pas préparer vos accès");
  });
});

describe("signature des e-mails", () => {
  it("signe au nom de l'équipe, jamais d'une personne", () => {
    for (const [key, build] of Object.entries(JOURNEY_EMAILS)) {
      const mail = build(ctx);
      // Le nom du partenaire ne doit apparaître dans AUCUN message au client.
      expect(mail.html, key).not.toContain("Tim Management —");
      expect(mail.text, key).not.toContain("votre interlocuteur TIM");
    }
  });

  it("emploie « on » et jamais « je » : personne ne signe en son nom", () => {
    for (const [key, build] of Object.entries(JOURNEY_EMAILS)) {
      const text = build(ctx).text;
      expect(text, key).not.toMatch(/\bje (lis|voulais|vous propose)\b/i);
      expect(text, key).not.toMatch(/dites-le-moi/i);
    }
  });
});
