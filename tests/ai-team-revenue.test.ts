import { describe, expect, it } from "vitest";

import { briefBlock, briefText, verifiedQuotes } from "@/modules/ai-team/lib/brief";
import { conversionTable, pageType, parseConversion } from "@/modules/ai-team/lib/conversion";
import { analyzePipeline, businessHours, historyOf, parsePipeline, type ActivityInput, type DealInput } from "@/modules/ai-team/lib/pipeline-agent";

/**
 * La fiche produit commune, Nathan (pipeline & relances) et Lou (conversion) :
 * les chiffres sont calculés par le code, jamais devinés ; une citation n'entre
 * que si elle existe mot pour mot dans le CRM ; pas de test A/B à faible trafic.
 */

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-16T10:00:00Z"); // un lundi

describe("la fiche produit", () => {
  it("se lit rubrique par rubrique, avec les mots des clients, et rien si elle est vide", () => {
    expect(briefText(null)).toBe("");
    expect(briefBlock("")).toBe("");
    const t = briefText({ promesse: "Fini les situations refaites le soir.", cible: "  ", quotes: [{ quote: "Je passe mes dimanches sur les devis", tag: "douleur", who: "gérant" }] });
    expect(t).toContain("## La promesse, en une phrase\nFini les situations refaites le soir.");
    expect(t).not.toContain("Les clients idéaux");
    expect(t).toContain("« Je passe mes dimanches sur les devis » [douleur] — gérant");
    expect(briefBlock(t)).toMatch(/<fiche>[\s\S]*<\/fiche>/);
  });

  it("ne garde une citation que si elle existe mot pour mot dans le CRM, sans doublon", () => {
    const corpus = "[E-mail reçu — Dupont BTP — 2026-10-02] Relance : Franchement je passe mes dimanches sur les devis, c'est plus possible.";
    const q = verifiedQuotes(
      [
        { citation: "je passe mes dimanches sur les devis", nature: "douleur", qui: "gérant", source: "Dupont BTP" },
        { citation: "TIM a changé ma vie", nature: "resultat" },
        { citation: "Je passe mes dimanches sur les devis" },
        { citation: "court" },
      ],
      corpus,
    );
    expect(q).toEqual([{ quote: "je passe mes dimanches sur les devis", tag: "douleur", who: "gérant", source: "Dupont BTP" }]);
  });
});

describe("Nathan : l'état du pipeline", () => {
  const deal = (id: string, status: string, createdDaysAgo: number, amount = 300): DealInput => ({ id, name: `Client ${id}`, status, createdAt: NOW - createdDaysAgo * DAY, amount, source: null });
  const step = (client: string, daysAgo: number, from: string, to: string): ActivityInput => ({ client, at: NOW - daysAgo * DAY, type: "systeme", title: `Étape : ${from} → ${to}` });

  it("compte les heures ouvrées (lundi–vendredi, 9 h–18 h, Paris)", () => {
    expect(businessHours(Date.parse("2026-11-14T10:00:00Z"), Date.parse("2026-11-16T10:00:00Z"))).toBe(2); // samedi → lundi 11 h
    expect(businessHours(NOW, NOW - 1)).toBe(0);
  });

  it("repère ce qui stagne, ce qui n'a pas de prochaine étape, et les leads sans réponse", () => {
    const m = analyzePipeline(
      [deal("1", "en-test", 30, 500), deal("2", "en-signature", 3, 400), deal("3", "actif", 100)],
      [],
      [step("1", 20, "Démo programmée", "En phase de test"), { client: "2", at: NOW - 1 * DAY, type: "tache", title: "Appeler pour signer", done: false, dueAt: NOW + 2 * DAY }, { client: "2", at: NOW - 2 * DAY, type: "email", title: "Proposition envoyée" }],
      [{ id: "s1", at: Date.parse("2026-11-16T07:00:00Z"), client: null, name: "Martin TP" }],
      NOW,
    );
    expect(m.deals.map((d) => d.id)).toEqual(["1", "2"]);
    const d1 = m.deals.find((d) => d.id === "1")!;
    expect(d1).toMatchObject({ stalled: true, threshold: 14, nextStep: null, priority: "A" });
    expect(d1.flags.join(" ")).toMatch(/depuis 20 j/);
    expect(m.deals.find((d) => d.id === "2")).toMatchObject({ stalled: false, nextStep: { title: "Appeler pour signer", dueDays: 2 }, lastContactDays: 2 });
    expect(m.leads[0]).toMatchObject({ answered: false, hoursWaiting: 2 });
    expect(m.thresholds["en-test"]).toMatchObject({ basis: "depart", days: 14 });
  });

  it("tire ses seuils des affaires gagnées dès qu'il y en a trois", () => {
    const won = ["a", "b", "c"].map((id) => deal(id, "actif", 60));
    const acts = won.flatMap((w, i) => [step(w.id, 50, "Démo programmée", "En phase de test"), step(w.id, 50 - (6 + i * 2), "En phase de test", "En signature")]);
    const m = analyzePipeline([deal("9", "en-test", 20)], won, [...acts, step("9", 12, "Démo programmée", "En phase de test")], [], NOW);
    expect(m.thresholds["en-test"]).toMatchObject({ basis: "historique", samples: 3, days: 12 });
    expect(m.deals[0].stalled).toBe(false);
  });

  it("ne garde que des actions sur une affaire connue, cinq au plus", () => {
    const text = `<synthese>ok</synthese><actions>[${Array.from({ length: 7 }, (_, i) => `{"affaire":"${i}","titre":"Appeler","etapes":["x"],"message":"Bonjour"}`).join(",")},{"affaire":"inconnue","titre":"x","etapes":["y"]}]</actions>`;
    const r = parsePipeline(text, new Set(["0", "1", "2", "3", "4", "5", "6"]))!;
    expect(r.findings).toHaveLength(5);
    expect(r.findings[0]).toMatchObject({ client: "0", priority: "B", message: "Bonjour" });
  });
});

describe("Lou : la conversion page par page", () => {
  it("classe les pages par type", () => {
    expect(["/", "/demo", "/contact", "/tarifs", "/blog/calcul-temps-de-travail", "/logiciel-devis-btp", "/a-propos"].map(pageType)).toEqual(["accueil", "demo", "demo", "tarifs", "blog", "produit", "autre"]);
  });

  it("croise les visites (GA4) et les leads (CRM) par page, puis par type", () => {
    const m = conversionTable(
      [
        { page: "/demo", sessions: 200 },
        { page: "/blog/x?utm=1", sessions: 1000 },
      ],
      [
        { path: "/demo", qualified: true },
        { path: "/demo", qualified: false },
        { path: "", qualified: false },
      ],
      "2026-09-17",
    );
    expect(m.pages.find((p) => p.path === "/demo")).toMatchObject({ sessions: 200, leads: 2, qualified: 1, rate: 1 });
    expect(m.byType.find((t) => t.type === "blog")).toMatchObject({ sessions: 1000, leads: 0, rate: 0 });
    expect(m.leadsWithoutPage).toBe(1);
  });

  it("refuse les hypothèses sans changement concret, et la couleur d'un bouton", () => {
    const text = `<synthese>ok</synthese><hypotheses>[{"page":"/demo","changement":"Ajouter la prise de rendez-vous après le formulaire","etapes":["x"],"impact":"fort"},{"changement":"Changer la couleur du bouton","etapes":["x"]},{"changement":"","etapes":["x"]}]</hypotheses>`;
    const r = parseConversion(text)!;
    expect(r.findings.map((f) => f.change)).toEqual(["Ajouter la prise de rendez-vous après le formulaire"]);
    expect(r.findings[0].impact).toBe("fort");
  });
});

describe("Nathan lit ce qui s'est dit sur la fiche", () => {
  it("les tâches prévues d'abord, puis les derniers échanges, texte nettoyé et coupé, sans les lignes système", () => {
    const h = historyOf(
      [
        { client: "1", at: NOW - 10 * DAY, type: "email", title: "Re: démo", content: "<p>Rappelez-moi <b>en janvier</b>, on attend le budget.</p>", direction: "recu" },
        { client: "1", at: NOW - 12 * DAY, type: "email", title: "Votre démo", content: "x".repeat(800), direction: "envoye" },
        { client: "1", at: NOW - 2 * DAY, type: "tache", title: "Rappeler", done: false, dueAt: NOW + 50 * DAY },
        { client: "1", at: NOW - 11 * DAY, type: "systeme", title: "Étape : Démo programmée → En test" },
        { client: "1", at: NOW - 20 * DAY, type: "note", title: "Appel", content: "Gérant, 12 salariés, Excel aujourd'hui." },
      ],
      NOW,
    );
    expect(h.map((x) => x.quoi)).toEqual(["tâche prévue", "e-mail reçu", "e-mail envoyé", "note"]);
    expect(h[0].echeance).toBe(new Date(NOW + 50 * DAY).toISOString().slice(0, 10));
    expect(h[1].texte).toBe("Rappelez-moi en janvier, on attend le budget.");
    expect(h[2].texte!.length).toBe(501);
  });
});
