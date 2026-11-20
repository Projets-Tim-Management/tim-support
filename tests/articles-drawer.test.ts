import { describe, expect, it } from "vitest";

import { cleanEditorHtml } from "@/modules/editorial/admin/HtmlEditor";
import { wpPostToArticle } from "@/modules/editorial/lib/articles/writer/refresh";
import { DEFAULT_CRITERIA } from "@/modules/editorial/lib/score/criteria";
import { scoreContent } from "@/modules/editorial/lib/score/measure";
import { articleScoreInput } from "@/modules/editorial/lib/score/run";
import { blockingErrors } from "@/modules/editorial/lib/score/save";

const NOW = new Date("2026-11-19T10:00:00Z");

describe("éditeur HTML du tiroir", () => {
  it("retire les styles et les span du navigateur, garde la structure WordPress", () => {
    expect(cleanEditorHtml('<p style="color:red"><span style="x">Texte</span> <b>capsule</b> <i>it</i></p>')).toBe("<p>Texte <strong>capsule</strong> <em>it</em></p>");
  });
  it("transforme les div en paragraphes et supprime les paragraphes vides", () => {
    expect(cleanEditorHtml("<div>Un</div><p><br></p><div>Deux&nbsp;mots</div>")).toBe("<p>Un</p><p>Deux mots</p>");
  });
  it("un <div style> ajouté par le navigateur devient un paragraphe", () => {
    expect(cleanEditorHtml('<div style="color:red">Texte</div>')).toBe("<p>Texte</p>");
  });
  it("garde l'encadré « Points clés » (div à classe) et sa fermeture", () => {
    const tldr = '<div class="tldr-box"><p>Points clés :</p><ul><li>a</li></ul></div><p>Suite</p>';
    expect(cleanEditorHtml(tldr)).toBe(tldr);
    expect(cleanEditorHtml('<div class="tldr-box"><ul><li>a</li></ul><div>tapé</div></div>')).toBe('<div class="tldr-box"><ul><li>a</li></ul><p>tapé</p></div>');
  });
  it("laisse intacts titres, listes, liens et tableaux", () => {
    const html = '<h2>Titre ?</h2><ul><li>a</li></ul><a href="/pointage">lien</a><table><tr><td>1</td></tr></table>';
    expect(cleanEditorHtml(html)).toBe(html);
  });
});

describe("enregistrement depuis le tiroir", () => {
  it("refuse la marque mal écrite", () => {
    const errors = blockingErrors({ title: "T", introduction: "<p>Tim Management simplifie le pointage.</p>", contenu: [], conclusion: "", faq: [], sources: [] });
    expect(errors.length).toBeGreaterThan(0);
  });
  it("accepte « TIM Management »", () => {
    expect(blockingErrors({ title: "T", introduction: "<p>TIM Management simplifie le pointage.</p>", contenu: [], conclusion: "", faq: [], sources: [] })).toEqual([]);
  });
});

describe("note recalculée dans le navigateur", () => {
  it("la conversion locale donne la même note que la conversion WordPress du rédacteur", () => {
    const acf = { introduction: "<p>Intro TIM Management.</p>", contenu: [{ acf_fc_layout: "texte", texte: "<h2>Quoi ?</h2><p><strong>Capsule.</strong></p>" }], conclusion: "<p>Fin.</p>", faq: [{ titre: "Q ?", text: "<p>R</p>" }], sources: [], date_mise_a_jour: "20261101" };
    const local = articleScoreInput({ title: "Titre", keyword: "pointage", acf }, NOW);
    expect(local.article).toMatchObject(wpPostToArticle(acf as never, "Titre"));
    expect(scoreContent(local, DEFAULT_CRITERIA)).toEqual(scoreContent({ ...local, article: { ...wpPostToArticle(acf as never, "Titre"), methode: local.article.methode } }, DEFAULT_CRITERIA));
  });
});
