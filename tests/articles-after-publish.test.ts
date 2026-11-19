import { describe, expect, it } from "vitest";

import { applyBacklink, dueForDeadline, pickBacklinkSources, reviewSnapshots } from "@/modules/editorial/lib/articles/after-publish";

const NOW = new Date("2026-11-24T08:00:00Z");
const URL = "https://tim-management.co/actualite/heures-sup-btp";

describe("maillage retour : quels articles reçoivent un lien", () => {
  const target = { id: 1, theme: 2, wpLink: URL };
  const art = (id: number, over: Record<string, unknown> = {}) => ({ id, theme: 2, status: "publie", wpId: 100 + id, gscClicks: id * 10, acf: { contenu: [{ texte: "<p>Texte.</p>" }] }, ...over });
  it("même thématique, en ligne, les plus cliqués d'abord, 3 au plus", () => {
    const out = pickBacklinkSources(target, [art(2), art(3), art(4), art(5), art(6, { theme: 3 }), art(7, { status: "a-verifier" }), art(1)]);
    expect(out.map((a) => a.id)).toEqual([5, 4, 3]);
  });
  it("pas un article qui pointe déjà vers lui, ni un article qui a déjà 5 liens internes", () => {
    const links = Array.from({ length: 5 }, (_, i) => `<a href="/p${i}">page ${i}</a>`).join(" ");
    const out = pickBacklinkSources(target, [art(2, { acf: { contenu: [{ texte: `<p><a href="${URL}">déjà</a></p>` }] } }), art(3, { acf: { contenu: [{ texte: `<p>${links}</p>` }] } }), art(4)]);
    expect(out.map((a) => a.id)).toEqual([4]);
  });
});

describe("maillage retour : l'ajout d'un lien est vérifié", () => {
  const block = "<h2>Comment compter ?</h2><p><strong>Les heures supplémentaires se comptent à la semaine civile.</strong></p><p>Au-delà de 35 heures, chaque heure supplémentaire ouvre droit à une majoration.</p>";
  const original = "Au-delà de 35 heures, chaque heure supplémentaire ouvre droit à une majoration.";
  it("seul le lien s'ajoute : accepté", () => {
    const withLink = `Au-delà de 35 heures, chaque <a href="${URL}">heure supplémentaire ouvre droit à une majoration</a>.`;
    const out = applyBacklink(block, original, withLink, URL);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.html).toContain(`<a href="${URL}">`);
  });
  it("un mot changé, une capsule, une ancre faible, un autre lien : refusé", () => {
    expect(applyBacklink(block, original, `Au-delà de 35 h, chaque <a href="${URL}">heure supplémentaire majorée</a>.`, URL)).toMatchObject({ ok: false, reason: "le texte de la phrase a changé" });
    expect(applyBacklink(block, "Les heures supplémentaires se comptent à la semaine civile.", `Les <a href="${URL}">heures supplémentaires</a> se comptent à la semaine civile.`, URL)).toMatchObject({ ok: false, reason: "phrase dans une capsule" });
    expect(applyBacklink(block, original, `Au-delà de 35 heures, chaque heure supplémentaire ouvre droit à une majoration <a href="${URL}">ici</a>.`, URL)).toMatchObject({ ok: false });
    expect(applyBacklink(block, original, `Au-delà de 35 heures, chaque <a href="https://autre.fr/x">heure supplémentaire ouvre droit</a> à une majoration.`, URL)).toMatchObject({ ok: false, reason: "le lien ne pointe pas vers le nouvel article" });
    expect(applyBacklink(block, "Phrase absente.", "Phrase <a>absente</a>.", URL)).toMatchObject({ ok: false, reason: "phrase introuvable telle quelle dans le bloc" });
  });
});

describe("échéances et bilans", () => {
  it("une échéance dans les 7 jours, pas encore traitée, déclenche une mise à jour", () => {
    const out = dueForDeadline(
      [
        { id: 1, status: "publie", deadlines: [{ date: "2026-11-28", reason: "CGI abrogé" }] },
        { id: 2, status: "publie", deadlines: [{ date: "2027-03-01", reason: "loin" }] },
        { id: 3, status: "publie", lastUpdateAt: "2026-11-20T00:00:00Z", deadlines: [{ date: "2026-11-28", reason: "déjà fait" }] },
        { id: 4, status: "a-rafraichir", deadlines: [{ date: "2026-11-28", reason: "en cours" }] },
      ],
      NOW,
    );
    expect(out).toEqual([{ id: 1, reason: "CGI abrogé" }]);
  });
  it("bilans à 30 et 90 jours, pris une fois", () => {
    const stats = { gscClicks: 120, gscImpressions: 4000, gscPosition: 7.2, ga4Sessions: 80, ga4AiSessions: 3 };
    expect(reviewSnapshots({ publishedAt: "2026-10-20T08:00:00Z" }, stats, NOW)).toEqual({ review30: { le: "2026-11-24", clicsGoogle: 120, impressions: 4000, position: 7.2, visites: 80, visitesIa: 3 } });
    expect(reviewSnapshots({ publishedAt: "2026-08-01T08:00:00Z", review30: {} }, stats, NOW)).toHaveProperty("review90");
    expect(reviewSnapshots({ publishedAt: "2026-11-10T08:00:00Z" }, stats, NOW)).toEqual({});
  });
});
