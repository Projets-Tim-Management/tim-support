/**
 * Reprise des articles publiés (writer/refresh.ts) : portage des tests purs de
 * tim-management/tests/test_refresh_queue.py et de la partie « refresh » de tests/test_modules.py.
 * Les tests qui appelaient Claude (mocké) passent ici par parseRefreshResponse + checkRefreshParts,
 * qui reproduisent la vérification de regenerate_refresh_parts.
 */
import { describe, expect, it } from "vitest";

import { buildTldr, checkTldrNoNewFacts } from "@/modules/editorial/lib/articles/check";
import {
  acfDate,
  applyRefresh,
  bodyViolations,
  checkRefreshParts,
  extractRefreshParts,
  factIndices,
  factsFingerprint,
  hasRealChange,
  hasTldr,
  insertTldr,
  monthsAgo,
  needsRefresh,
  parseRefreshResponse,
  REFRESH_SYSTEM,
  refreshPrompt,
  refreshTexts,
  wpPostToArticle,
} from "@/modules/editorial/lib/articles/writer/refresh";

import { capsule, FAIT_LEGAL, FAITS_FFB, makeArticle, words } from "./articles-check-fixtures";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

// ── test_modules.py : refresh ─────────────────────────────────────────────────

describe("refresh (test_modules.py)", () => {
  it("months_ago", () => {
    expect(monthsAgo(d(2026, 9, 25), 6)).toEqual(d(2026, 3, 25));
    expect(monthsAgo(d(2026, 8, 31), 6)).toEqual(d(2026, 2, 28));
    expect(monthsAgo(d(2026, 3, 15), 6)).toEqual(d(2025, 9, 15));
  });

  it("needs_refresh", () => {
    const fp = factsFingerprint(FAITS_FFB, "");
    expect(needsRefresh(fp, fp, [])).toBe(false);
    expect(needsRefresh(fp, null, [])).toBe(true);
    expect(needsRefresh(fp, fp, ["erreur"])).toBe(true);
    expect(fp).not.toBe(factsFingerprint(FAITS_FFB, "cas"));
  });

  it("extract / apply : aller-retour", () => {
    const article = makeArticle();
    const parts = extractRefreshParts(article);
    expect(parts.tldr_points).toEqual(["Un", "Deux", "Trois"]);
    expect(parts.capsules).toHaveLength(5);
    expect(hasRealChange(article, applyRefresh(article, parts))).toBe(false);

    parts.capsules[0] = words(52);
    const next = applyRefresh(article, parts);
    expect(hasRealChange(article, next)).toBe(true);
    expect(next.contenu.slice(1)).toEqual(article.contenu.slice(1));
    expect(next.conclusion).toBe(article.conclusion);
  });

  it("ne touche pas aux <strong> décoratifs", () => {
    const article = makeArticle();
    article.contenu[0].texte += "<ul><li><strong>Important</strong> : pointer chaque jour.</li></ul>";
    const parts = extractRefreshParts(article);
    parts.capsules = Array(5).fill(words(50));
    const next = applyRefresh(article, parts);
    expect(next.contenu[0].texte).toContain("<strong>Important</strong>");
  });

  it("regenerate_refresh_parts : réponse valide", () => {
    const article = makeArticle();
    const reply = JSON.stringify({
      tldr_points: ["A", "B", "C"],
      capsules: Array(5).fill(words(48)),
      faq: [0, 1, 2, 3].map((i) => ({ titre: `Q${i} ?`, text: capsule(45) })),
      faits_utilises: [],
    });
    const res = checkRefreshParts(article, parseRefreshResponse(reply), [], "");
    expect(res.errors).toEqual([]);
    expect(res.article).not.toBeNull();
    expect(extractRefreshParts(res.article!).tldr_points).toEqual(["A", "B", "C"]);
    expect(res.article!.faq).toHaveLength(4);
  });

  it("regenerate_refresh_parts : mauvais nombre de capsules", () => {
    const article = makeArticle();
    const reply = JSON.stringify({
      tldr_points: ["A", "B", "C"],
      capsules: [words(48)],
      faq: Array(4).fill({ titre: "Q ?", text: capsule(45) }),
    });
    const res = checkRefreshParts(article, parseRefreshResponse(reply), [], "");
    expect(res.article).toBeNull();
    expect(res.errors).toEqual(["capsules : 1 reçues, 5 attendues"]);
  });

  it("body_violations : seulement hors des parties régénérées", () => {
    const article = makeArticle();
    article.contenu[2].texte += "<p>Selon l'INSEE, 18 % des salariés sont concernés.</p>";
    const errors = bodyViolations(article, [], "");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("INSEE");
  });
});

// ── test_refresh_queue.py ─────────────────────────────────────────────────────

describe("dates ACF Y-m-d (test_refresh_queue.py)", () => {
  it.each<[Date | string | null, string]>([
    [d(2026, 9, 27), "2026-09-27"],
    ["20260927", "2026-09-27"],
    ["2026-09-27", "2026-09-27"],
    ["", ""],
    [null, ""],
  ])("acf_date(%s)", (value, expected) => {
    expect(acfDate(value)).toBe(expected);
  });

  it("acf_date invalide", () => {
    expect(() => acfDate("27/09/2026")).toThrow();
  });
});

function legacyArticle() {
  const a = makeArticle({ introduction: "<p style='color:red'>Introduction existante sur le pointage.</p>" });
  a.contenu[0].texte += "<p>72 % des PME pointent encore sur papier.</p>";
  return a;
}

describe("TL;DR depuis le contenu existant (test_refresh_queue.py)", () => {
  it("has_tldr : ancien format", () => {
    expect(hasTldr("<div class='tldr-box' style='x'><ul><li>a</li></ul></div>")).toBe(true);
    expect(hasTldr("<p>Intro</p>")).toBe(false);
  });

  it("insert_tldr ne touche pas au reste", () => {
    const intro = "<p style='color:red'>Intro</p>";
    expect(insertTldr(intro, '<div class="tldr-box">T</div>')).toBe('<div class="tldr-box">T</div>' + intro);
  });

  it("refuse un chiffre du contenu non sourcé", () => {
    const tldr = buildTldr(["72 % des PME pointent encore sur papier", "Deux", "Trois"]);
    const errors = checkTldrNoNewFacts(tldr, legacyArticle(), []);
    expect(errors.some((e) => e.includes("72"))).toBe(true);
  });

  it("refuse un nombre absent du contenu", () => {
    const tldr = buildTldr(["Le déploiement prend 17 jours", "Deux", "Trois"]);
    const errors = checkTldrNoNewFacts(tldr, legacyArticle(), []);
    expect(errors.some((e) => e.includes("absent") && e.includes("17"))).toBe(true);
  });
});

describe("reprise complète : réinjection dans l'article actuel (test_refresh_queue.py, partie pure)", () => {
  // test_queue_sources_avec_fichier_compagnon_puis_apply_date_y_m_d, sans fichiers ni WordPress
  it("réponse sourcée -> parties valides, faits utilisés, corps conforme, changement réel", () => {
    const fait = {
      fait: "Les conducteurs de travaux perdent 12 h par semaine en consolidation papier",
      source: "FFB",
      url: "https://www.ffbatiment.fr/barometre",
      annee: "2024",
    };
    const current = wpPostToArticle(
      { introduction: makeArticle().introduction, contenu: makeArticle().contenu, conclusion: makeArticle().conclusion, faq: makeArticle().faq },
      { raw: makeArticle().title },
    );
    const reply = JSON.stringify({
      tldr_points: ["Selon la FFB, 12 h par semaine sont perdues (2024)", "B", "C"],
      capsules: Array(5).fill(words(48)),
      faq: [0, 1, 2, 3].map((i) => ({ titre: `Q${i} ?`, text: capsule(45) })),
      faits_utilises: [1],
    });
    const res = checkRefreshParts(current, parseRefreshResponse(reply), [fait], "");
    expect(res.errors).toEqual([]);
    expect([...res.faits_utilises]).toEqual([0]);
    expect(bodyViolations(res.article!, [fait], "")).toEqual([]);
    expect(hasRealChange(current, res.article!)).toBe(true);
    expect(acfDate(d(2026, 9, 27))).toBe("2026-09-27");
  });
});

// ── Compléments (portage) ─────────────────────────────────────────────────────

describe("compléments du portage", () => {
  it("empreinte identique à Python (json sort_keys, ensure_ascii=False, sha256[:16])", () => {
    expect(factsFingerprint(FAITS_FFB, "")).toBe("de90e9cdc0f73755");
    expect(factsFingerprint(FAITS_FFB, "cas")).toBe("55df36a24f263ee1");
    const tricky = [
      FAIT_LEGAL,
      { source: 'Ünïcode « test » "q"\n\t\\ é\u{1D518} €', fait: "12 % d’heures", annee: "2025", url: "" },
    ];
    expect(factsFingerprint(tricky, "  Entreprise Dupont, 3 chantiers \n")).toBe("9507d87749b3bc5f");
  });

  it("apply_refresh : TL;DR ajoutée en tête si absente, remplacée sinon, ancien format normalisé", () => {
    const parts = { tldr_points: ["Un <b>point</b>", "Deux & trois", "Quatre"], capsules: [], faq: [] };
    const without = applyRefresh(makeArticle({ introduction: "<p>Intro</p>" }), parts);
    expect(without.introduction).toBe(
      '<div class="tldr-box"><p>Points clés :</p><ul><li>Un  point</li><li>Deux &amp; trois</li><li>Quatre</li></ul></div><p>Intro</p>',
    );
    const legacy = applyRefresh(makeArticle({ introduction: "<div class='tldr-box' style='x'><ul><li>a</li></ul></div><p>Intro</p>" }), parts);
    expect(legacy.introduction.match(/tldr-box/g)).toHaveLength(1);
    expect(legacy.introduction.endsWith("<p>Intro</p>")).toBe(true);
  });

  it("apply_refresh : capsules échappées, FAQ nettoyée, l'article d'origine intact", () => {
    const article = makeArticle();
    const before = structuredClone(article);
    const next = applyRefresh(article, {
      tldr_points: ["A", "B", "C"],
      capsules: ["<em>Texte</em> R&D <script>", words(48)],
      faq: [{ titre: "Q ?", text: '<p style="color:red"><strong>R</strong></p>' }],
    });
    expect(next.contenu[0].texte).toContain("<strong>Texte  R&amp;D</strong>");
    expect(next.contenu[2].texte).toBe(article.contenu[2].texte);
    expect(next.faq).toEqual([{ titre: "Q ?", text: "<p><strong>R</strong></p>" }]);
    expect(article).toEqual(before);
  });

  it("refresh_texts : TL;DR, capsules du corps, FAQ question/réponse", () => {
    const where = refreshTexts(makeArticle()).map(([w]) => w);
    expect(where.slice(0, 3)).toEqual(["TL;DR", "bloc 1", "bloc 2"]);
    expect(where).toHaveLength(1 + 5 + 8);
    expect(where.at(-1)).toBe("FAQ 4 réponse");
  });

  it("check : JSON illisible, faits_utilises déclarés", () => {
    expect(parseRefreshResponse("pas de JSON")).toBeNull();
    expect(checkRefreshParts(makeArticle(), null, []).errors[0]).toMatch(/^JSON invalide/);
    expect([...factIndices([1, "2", " 3 ", "x", true, 2.5])]).toEqual([0, 1, 2]);
  });

  it("parse : fences markdown et texte parasite tolérés", () => {
    const parsed = parseRefreshResponse('Voici :\n```json\n{"tldr_points": ["a"], "capsules": ["b"], "faq": [{"titre": "Q ?", "text": "t"}, "x"]}\n```');
    expect(parsed).toEqual({ tldr_points: ["a"], capsules: ["b"], faq: [{ titre: "Q ?", text: "t" }], faits_utilises: [] });
  });

  it("prompt : parties actuelles, nombre de capsules, bornes, system de génération", () => {
    const prompt = refreshPrompt(makeArticle(), "pointage", FAITS_FFB, "");
    expect(prompt.startsWith('Actualise un article publié sur "pointage" : régénère UNIQUEMENT la TL;DR, les capsules et la FAQ.')).toBe(true);
    expect(prompt).toContain("TL;DR ACTUELLE :\nPoints clés :   Un  Deux  Trois");
    expect(prompt).toContain("EXACTEMENT 5 textes");
    expect(prompt).toContain("chacun de 40 à 60 mots");
    expect(prompt).toContain('"faq" : 4 à 6 questions');
    expect(prompt).toContain('[\n {\n  "section": "Comment organiser le pointage sur plusieurs chantiers ?",');
    expect(prompt).toContain("CAS CLIENT :\n(vide)");
    expect(prompt).not.toMatch(/Tim Management/);
    expect(refreshPrompt(makeArticle({ introduction: "<p>x</p>" }), "k", [], "").includes("TL;DR ACTUELLE :\n(absente)")).toBe(true);
    expect(REFRESH_SYSTEM).toContain("Tu réponds UNIQUEMENT avec un objet JSON valide");
  });

  it("post_to_article", () => {
    expect(wpPostToArticle([], { raw: "", rendered: "Titre rendu" })).toEqual({
      title: "Titre rendu",
      introduction: "",
      contenu: [],
      conclusion: "",
      faq: [],
      sources: [],
    });
    const a = wpPostToArticle({ introduction: "<p>i</p>", contenu: false, faq: null }, { raw: "Brut", rendered: "Rendu" });
    expect(a.title).toBe("Brut");
    expect(a.introduction).toBe("<p>i</p>");
    expect(a.contenu).toEqual([]);
    expect(wpPostToArticle(null, null).title).toBe("");
    expect(wpPostToArticle(undefined, "Texte").title).toBe("Texte");
  });
});
