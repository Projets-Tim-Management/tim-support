import { describe, expect, it } from "vitest";

import { buildVitrinePrompt, parseVitrineRequests, VITRINE_RULE } from "@/modules/ai-team/lib/vitrine-requests";

const ok = { titre: "Convertisseur heures et minutes en centièmes", besoin: "Saisir 7 h 45, obtenir 7,75.", pourquoi: "Google classe des convertisseurs en tête.", preuve: "« convertir heures en centièmes » : 11 des 15 premiers résultats sont des outils.", page: "https://tim-management.co/outils-gratuits", details: "Champ heures, champ minutes, résultat, tableau 0 à 59 minutes." };

describe("demandes pour le site vitrine", () => {
  it("lit 0 à 2 demandes complètes, ignore les autres", () => {
    const text = `<synthese>…</synthese>\n<demandesVitrine>${JSON.stringify([ok, { ...ok, titre: "B" }, { ...ok, titre: "C" }, { titre: "sans preuve", besoin: "x", pourquoi: "y" }])}</demandesVitrine>`;
    const r = parseVitrineRequests(text);
    expect(r).toHaveLength(2);
    expect(r[0].titre).toBe(ok.titre);
    expect(parseVitrineRequests("<demandesVitrine>pas du json</demandesVitrine>")).toEqual([]);
    expect(parseVitrineRequests("rien")).toEqual([]);
    expect(parseVitrineRequests(`<demandesVitrine>${JSON.stringify([{ titre: "x", besoin: "y", pourquoi: "z" }])}</demandesVitrine>`)).toEqual([]);
  });
  it("le prompt est complet : contexte, besoin, preuve, règles du site, livraison sans fusion", () => {
    const p = buildVitrinePrompt(ok, { agent: "Paige", job: "Stratège de contenu", chief: "Sergey", date: "19/11/2026" });
    expect(p).toContain("tim-front");
    expect(p).toContain("Demande de Paige (Stratège de contenu");
    expect(p).toContain("transmise par Sergey");
    expect(p).toContain(ok.preuve);
    expect(p).toContain("outils-gratuits");
    expect(p).toContain("« TIM Management », jamais « Tim »");
    expect(p).toContain("Ne la fusionne pas");
  });
  it("la consigne des agents : seulement une amélioration hors de leur périmètre, appuyée sur leurs données", () => {
    expect(VITRINE_RULE).toContain("<demandesVitrine>");
    expect(VITRINE_RULE).toContain("calculette");
    expect(VITRINE_RULE).toContain("jamais pour ce que tu peux faire toi-même");
  });
});
