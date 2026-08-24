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
    // Les alertes à destination de TIM sont construites dans notify.ts, pas ici :
    // elles se reconnaissent à leur PUBLIC, ce qui évite d'entretenir une liste
    // de clés qu'on oublie d'allonger — c'est déjà arrivé.
    const attendus = PHASE_DE_TEST_EMAILS.filter((e) => e.audience !== "tim").map((e) => e.key);
    for (const key of attendus) expect(JOURNEY_EMAILS, key).toHaveProperty(key);
  });

  it("chaque alerte interne a bien un expéditeur, même sans gabarit ici", () => {
    // Le pendant du test précédent : une alerte TIM déclarée dans le modèle mais
    // qu'aucun code n'envoie affiche une enveloppe sur l'étape et ne part jamais.
    // C'est arrivé deux fois ; la liste ci-dessous est vérifiée à la main.
    const envoyees = new Set([
      "demande-recue",
      "devis-a-rediger",
      "dossier-a-verifier",
      "demande-contrat-tim",
      "creneau-reserve-tim",
    ]);
    for (const e of PHASE_DE_TEST_EMAILS.filter((m) => m.audience === "tim")) {
      expect(envoyees, e.key).toContain(e.key);
    }
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

describe("confirmation du créneau au client", () => {
  const base = {
    clientName: "SOUVET VMB",
    contactFirstName: "Charlie",
    sessionAt: "2026-08-27T11:00:00.000Z",
    sessionModality: "en visio (lien fourni)",
  };

  it("annonce l'horaire et la durée", () => {
    const mail = JOURNEY_EMAILS["creneau-confirme"](base);
    expect(mail.subject).toContain("réservée");
    expect(mail.text).toContain("45 minutes");
    expect(mail.text).toMatch(/27 août/);
  });

  it("écrit le lien de visio EN TOUTES LETTRES quand il existe", () => {
    const url = "https://meet.google.com/abc-defg-hij";
    const mail = JOURNEY_EMAILS["creneau-confirme"]({ ...base, sessionLink: url });
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url);
  });

  it("sans lien, aucun bouton vide ni ligne « Lien : »", () => {
    const mail = JOURNEY_EMAILS["creneau-confirme"](base);
    expect(mail.text).not.toContain("Lien  :");
    expect(mail.html).not.toContain("Rejoindre la visio");
  });

  it("ne parle jamais de conducteurs ni de chefs de chantier", () => {
    // La confirmation ne rappelle plus qui doit être formé : elle LISTE qui le
    // sera, puisque le client vient de le déclarer. Le rappel reste dans
    // l'invitation et la relance, où il sert encore à quelque chose.
    const mail = JOURNEY_EMAILS["creneau-confirme"](base);
    expect(`${mail.text}${mail.html}`).not.toMatch(/conducteur|chef de chantier/i);
  });

  it("le rappel « c'est l'administrateur qu'on forme » reste dans l'invitation", () => {
    for (const key of ["prise-en-main", "relance-creneau"]) {
      const mail = JOURNEY_EMAILS[key](base);
      expect(mail.text, key).toContain("administrateur de votre compte");
    }
  });
});

describe("participants annoncés dans les e-mails de créneau", () => {
  const ctx = {
    clientName: "SOUVET VMB",
    contactFirstName: "Charlie",
    sessionAt: "2026-08-27T11:00:00.000Z",
    sessionModality: "en visio (lien fourni)",
    sessionAttendee: {
      firstName: "Louise",
      lastName: "Martin",
      role: "Responsable d'exploitation",
      email: "louise@souvet.fr",
    },
    sessionGuests: [{ email: "paul@souvet.fr", name: "Paul Souvet" }, { email: "compta@souvet.fr" }],
  };

  it("le partenaire reçoit la liste complète des présents", () => {
    const mail = JOURNEY_EMAILS["creneau-reserve"](ctx);
    for (const attendu of ["Louise Martin", "Responsable d'exploitation", "louise@souvet.fr", "Paul Souvet", "compta@souvet.fr"]) {
      expect(mail.text, attendu).toContain(attendu);
      expect(mail.html, attendu).toContain(attendu);
    }
  });

  it("le client retrouve la même liste, pour vérifier qui est convié", () => {
    const mail = JOURNEY_EMAILS["creneau-confirme"](ctx);
    expect(mail.text).toContain("Louise Martin");
    expect(mail.text).toContain("compta@souvet.fr");
  });

  it("un invité sans nom est listé par son adresse, sans ligne vide", () => {
    const mail = JOURNEY_EMAILS["creneau-reserve"](ctx);
    expect(mail.text).not.toMatch(/•\s*$/m);
    expect(mail.text).toContain("• compta@souvet.fr");
  });

  it("sans participant déclaré, aucune section « Seront présents » vide", () => {
    const mail = JOURNEY_EMAILS["creneau-reserve"]({ ...ctx, sessionAttendee: null, sessionGuests: null });
    expect(mail.text).not.toContain("Seront présents");
    expect(mail.html).not.toContain("Seront présents");
  });
});
