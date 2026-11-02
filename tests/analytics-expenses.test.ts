import { describe, expect, it } from "vitest";

import { classify, classifyExpenses, cleanLabel, expensesByMonth, UNCLASSIFIED, type BankTransaction } from "@/modules/analytics/lib/expenses";
import { analyzeHistory, breakEven, buildRevenueHistory } from "@/modules/analytics/lib/revenue-history";

const tx = (id: string, date: string, amount: number, label: string, categories: string[] = []): BankTransaction => ({ id, date, amount, label, categories });

describe("classement des dépenses", () => {
  it("range les libellés bancaires réels dans leur poste", () => {
    expect(classify("X1946 GOOGLE ADS3358483794 23/0", [], [])).toEqual({ poste: "Google Ads", kind: "depense" });
    expect(classify("X1946 LINKUMA.COM 74330 PO 25/", [], []).poste).toBe("SEO");
    expect(classify("PRELEVEMENT GOCARDLESS NINETY DIGITAL - CONTRAT DE PRESTATION", [], []).poste).toBe("Autres");
    expect(classify("GOCARDLESS - LUIS AFONSO", [], []).poste).toBe("Autres");
    expect(classify("X1946 OPENAI SAN FRANCISCO 15/0", [], []).poste).toBe("ChatGPT Ads");
    expect(classify("VIR INST VERS HORIZONTE REVIGO", [], []).poste).toBe("Développement sous-traité");
    expect(classify("SAS AVIZEO", [], []).poste).toBe("Comptable");
    expect(classify("X1946 GOOGLE WORKSPACE TIM", [], []).poste).toBe("IT");
    expect(classify("X1946 CLAUDE.AI SUBSCRIPTI 16/", [], []).poste).toBe("IT");
    expect(classify("DIGITALOCEAN.COM", [], []).poste).toBe("IT");
    expect(classify("X1946 FIGMA", ["Logiciels"], []).poste).toBe("IT");
    expect(classify("UNE APPLI INCONNUE", ["Hébergements web"], []).poste).toBe("IT");
  });

  it("écarte les transferts entre nos comptes et la TVA, met les impôts à part", () => {
    expect(classify("TIMLCDEV-ECF6W4V4X", [], []).kind).toBe("ignore");
    expect(classify("VIR INST VERS LC DEV - PENNYLAN", [], []).kind).toBe("ignore");
    expect(classify("B2B DGFIP - TVA-012026-3310CA3", [], []).kind).toBe("ignore");
    expect(classify("B2B DGFIP", [], [])).toEqual({ poste: "Impôts", kind: "impot" });
    expect(classify("PM01XWB3 LC DEV - SOUVET VMB (F202610042) MD01KR gocardless_fee TIMLCDEV-SA8ZHM3EG", [], []).poste).toBe("Banque & frais");
    expect(classify("00004916505 15/01/26 CAPITAL", [], []).kind).toBe("ignore");
    expect(classify("00004916505 15/01/26 INTERETS", [], []).poste).toBe("Banque & frais");
  });

  it("donne la priorité aux règles de TIM, puis à la catégorie Pennylane, sinon « À classer »", () => {
    expect(classify("X1946 GOOGLE ADS", [], [{ match: "google ads", poste: "Acquisition", kind: "depense" }]).poste).toBe("Acquisition");
    expect(classify("X1946 L ENTREPOT", ["Repas / Réception"], []).poste).toBe("Repas / Réception");
    expect(classify("X1946 VISTAPRINT VENLO", [], []).poste).toBe(UNCLASSIFIED);
  });

  it("ne lit que les sorties, nettoie le libellé et cumule par mois", () => {
    const ex = classifyExpenses([
      tx("1", "2026-09-02", -6120, "VIR INST VERS HORIZONTE REVIGOR\n(REF: 49F4B50F)"),
      tx("2", "2026-09-21", -2782.8, "TIMLCDEV-B75YQDGEZ"),
      tx("3", "2026-09-10", -500, "X1946 GOOGLE ADS3358483794"),
      tx("4", "2026-09-15", -14, "CFE"),
      tx("5", "2026-09-05", 3000, "VIR SEPA CLIENT"),
    ]);
    expect(ex.map((e) => e.id)).toEqual(["2", "4", "3", "1"]);
    expect(ex.find((e) => e.id === "1")!.label).toBe("VIR INST VERS HORIZONTE REVIGOR");
    expect(expensesByMonth(ex).get("2026-09")).toEqual({ expenses: 6620, taxes: 14, byPoste: { "Développement sous-traité": 6120, "Google Ads": 500 } });
  });
  it("cleanLabel garde la première ligne sans la référence", () => {
    expect(cleanLabel("GOCARDLESS (REF: 328542725   EUSEPADR) - LCC: NINETY")).toBe("GOCARDLESS");
  });
});

describe("dépenses dans l'historique", () => {
  const legacy = [
    { month: "2025-12", client: 1, clientName: "A", recurringHT: 1000, servicesHT: 0 },
    { month: "2026-01", client: 1, clientName: "A", recurringHT: 1000, servicesHT: 0 },
    { month: "2026-02", client: 1, clientName: "A", recurringHT: 1000, servicesHT: 200 },
  ];
  const ex = classifyExpenses([tx("1", "2026-01-10", -300, "X1946 GOOGLE ADS"), tx("2", "2026-02-10", -1500, "VIR INST VERS HORIZONTE"), tx("3", "2026-02-12", -100, "CFE")]);
  const h = buildRevenueHistory(legacy, [], new Date("2026-02-20T00:00:00Z"), ex);

  it("met null avant les relevés, jamais zéro", () => {
    const [dec, jan, feb] = h.months.slice(-3);
    expect(dec).toMatchObject({ key: "2025-12", expenses: null, profit: null });
    expect(jan).toMatchObject({ expenses: 300, taxes: 0, profit: 700, byPoste: { "Google Ads": 300 } });
    expect(feb).toMatchObject({ expenses: 1500, taxes: 100, profit: -300 });
    expect(h.expensesFrom).toBe("2026-01");
    expect(h.postes).toEqual(["Développement sous-traité", "Google Ads"]);
  });

  it("résume une période sur les seuls mois connus, et la mesure « bénéfice » n'invente rien", () => {
    const an = analyzeHistory(h, { hv: "mois", hd: "2025-12", hf: "2026-02", hm: "benefice", hc: "prec" });
    expect(an.a).toMatchObject({ covered: 3, expenseMonths: 2, expenses: 1800, taxes: 100, profit: 400 });
    expect(an.buckets.map((x) => x.value)).toEqual([null, 700, -300]);
    // Janvier face à décembre (dépenses inconnues) : rien ; février face à janvier : 700 → −300.
    expect(an.buckets.map((x) => x.pct)).toEqual([null, null, -142.86]);
    const year = analyzeHistory(h, { hv: "annee", hm: "depenses" });
    expect(year.yearLines!.rows[0]).toMatchObject({ y2025: null, y2026: 300 });
    expect(year.buckets.find((x) => x.id === "2025-01")!.value).toBeNull();
  });
});

describe("seuil d'équilibre", () => {
  it("moyenne les rentrées et les dépenses sur les mois connus (12 au plus), et compte les clients qui manquent", () => {
    const legacy = ["2026-01", "2026-02", "2026-03"].flatMap((month) => [
      { month, client: 1, clientName: "A", recurringHT: 200, servicesHT: 0 },
      { month, client: 2, clientName: "B", recurringHT: 100, servicesHT: 0 },
    ]);
    const ex = classifyExpenses([
      tx("1", "2026-01-10", -300, "X1946 GOOGLE ADS"),
      tx("2", "2026-02-10", -300, "X1946 GOOGLE ADS"),
      tx("3", "2026-03-10", -300, "X1946 GOOGLE ADS"),
      tx("4", "2026-03-12", -900, "VIR INST VERS HORIZONTE"),
    ]);
    const h = buildRevenueHistory(legacy, [], new Date("2026-03-20T00:00:00Z"), ex);
    const be = breakEven(h, "2026-03", ["Développement sous-traité"])!;
    expect(be).toMatchObject({ window: 3, from: "2026-01", revenue: 300, expenses: 600, expensesCore: 300, gap: -300, gapCore: 0, basket: 150, clientsNeeded: 2, clientsNeededCore: 0 });
    expect(be.rolling.map((r) => [r.window, r.expenses])).toEqual([
      [1, 300],
      [2, 300],
      [3, 600],
    ]);
  });
});
