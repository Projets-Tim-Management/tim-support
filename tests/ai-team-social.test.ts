import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/lib/spend", async (orig) => ({ ...(await orig<typeof import("@/modules/ads/lib/spend")>()), assertAdsBudget: vi.fn(async () => undefined), recordAdsUsage: vi.fn(async () => ({ id: 1 })) }));
vi.mock("@/modules/ai-team/lib/funnel", async (orig) => ({ ...(await orig<typeof import("@/modules/ai-team/lib/funnel")>()), loadFunnel: vi.fn(async () => null) }));

import { parseSocialReport, runSocial, socialForModel } from "@/modules/ai-team/lib/social";
import { durationSec, matchPeople, normName, readFbPost, readIgMedia, ytRows, type SocialMeasure } from "@/modules/ai-team/lib/social-sources";
import type { WebCall } from "@/modules/ai-team/lib/web-model";

const action = (over: Record<string, unknown>) => ({ reseau: "youtube", type: "contenu", titre: "Tourner « pointage en 2 minutes »", pourquoi: "62 % vus jusqu'au bout.", personne: "", etapes: ["Écrire le script", "Tourner"], minutes: 90, impact: "fort", prompt: "Écris le script…", ...over });
const answer = (actions: unknown[]) => `<synthese>YouTube amène des démos ; Instagram peu.</synthese><actions>${JSON.stringify(actions)}</actions>`;

describe("Le rapport de Cléo, vérifié", () => {
  it("garde les actions avec un prompt : fortes d'abord, et à impact égal les relances ; 8 au plus", () => {
    const out = parseSocialReport(
      answer([
        action({ titre: "Rythme", type: "rythme", impact: "moyen" }),
        action({}),
        action({ titre: "Relancer Paul Martin", type: "relance", personne: "Paul Martin", reseau: "linkedin" }),
        action({ titre: "Sans prompt", prompt: "" }),
        action({ titre: "Inconnu", type: "x", reseau: "tiktok", impact: "?", minutes: 0 }),
      ]),
    )!;
    expect(out.findings.map((a) => [a.title, a.type, a.network])).toEqual([
      ["Relancer Paul Martin", "relance", "linkedin"],
      ["Tourner « pointage en 2 minutes »", "contenu", "youtube"],
      ["Inconnu", "contenu", "tous"],
      ["Rythme", "rythme", "youtube"],
    ]);
    expect(out.findings[0].person).toBe("Paul Martin");
    expect(out.findings[2]).toMatchObject({ impact: "moyen", minutes: 30 });
    expect(parseSocialReport("rien")).toBeNull();
    expect(parseSocialReport("<synthese>x</synthese><actions>pas du json</actions>")).toBeNull();
  });
});

describe("Les lectures des réseaux", () => {
  it("YouTube : les lignes nommées par colonne, et la durée d'une vidéo", () => {
    expect(ytRows({ columnHeaders: [{ name: "video" }, { name: "views" }], rows: [["abc", 120]] })).toEqual([{ video: "abc", views: 120 }]);
    expect(ytRows(null)).toEqual([]);
    expect(durationSec("PT1M30S")).toBe(90);
    expect(durationSec("PT1H2M3S")).toBe(3723);
    expect(durationSec("PT45S")).toBe(45);
    expect(durationSec("")).toBeNull();
    expect(durationSec("n'importe quoi")).toBeNull();
  });

  it("Facebook et Instagram : chiffres de la publication, statistiques quand Meta les donne", () => {
    const fb = readFbPost(
      { id: "1_2", message: "Nouveau : le planning des engins", status_type: "added_video", created_time: "2026-11-02T10:00:00+0000", permalink_url: "https://www.facebook.com/p/1", shares: { count: 3 }, reactions: { summary: { total_count: 14 } }, comments: { summary: { total_count: 2 } } },
      [{ name: "post_media_view", values: [{ value: 900 }] }],
    );
    expect(fb).toMatchObject({ network: "facebook", format: "Vidéo", views: 900, reach: null, likes: 14, comments: 2, shares: 3 });
    expect(readFbPost({ id: "9" }, null)).toMatchObject({ title: "(publication sans texte)", views: null, likes: 0, url: "https://www.facebook.com/9" });
    const ig = readIgMedia({ id: "m1", caption: "Chantier", media_type: "VIDEO", media_product_type: "REELS", like_count: 40, comments_count: 5 }, [
      { name: "views", values: [{ value: 2500 }] },
      { name: "saved", values: [{ value: 7 }] },
    ]);
    expect(ig).toMatchObject({ network: "instagram", format: "Reel", views: 2500, saves: 7, shares: null, likes: 40, comments: 5 });
  });

  it("rapproche du CRM : prénom + nom (dans les deux sens), ou le nom exact de l'entreprise ; jamais un prénom seul", () => {
    const crm = [
      { first: "Paul", last: "Martin", company: "Martin BTP", status: "Démo programmée", clientId: 1 },
      { first: "", last: "", company: "Bâti-Ouest", status: "Gagnée", clientId: 2 },
      { first: "", last: "", company: "SA", status: null, clientId: 3 },
    ];
    const people = [
      { network: "youtube" as const, name: "Paul MARTIN", text: "Ça marche hors réseau ?", url: "", at: null },
      { network: "instagram" as const, name: "@martin paul", text: "Top", url: "", at: null },
      { network: "facebook" as const, name: "Bati Ouest", text: "On l'utilise", url: "", at: null },
      { network: "facebook" as const, name: "Paul", text: "?", url: "", at: null },
      { network: "facebook" as const, name: "SA", text: "trop court", url: "", at: null },
    ];
    const out = matchPeople(people, crm);
    expect(out.map((p) => p.match?.clientId ?? null)).toEqual([1, 1, 2, null, null]);
    expect(out[0].match).toMatchObject({ contact: "Paul Martin", company: "Martin BTP", status: "Démo programmée" });
    expect(normName("  Éloïse D'Arc-Martin ")).toBe("eloise d arc martin");
  });
});

const measure: SocialMeasure = {
  from: "2026-10-16T00:00:00Z",
  to: "2026-11-13T00:00:00Z",
  networks: [{ network: "youtube", account: "TIM Management", followers: 320, posts: 1, views: 1500, previousViews: 900, interactions: 60 }],
  posts: [{ network: "youtube", id: "v1", title: "Le pointage", url: "https://www.youtube.com/watch?v=v1", at: "2026-11-01T00:00:00Z", format: "Vidéo", views: 1500, reach: null, likes: 50, comments: 4, shares: 6, saves: null, watchMinutes: 900, avgViewPct: 48, subscribers: 12 }],
  people: [
    { network: "youtube", name: "Paul Martin", text: "Et la paie ?", url: "", at: "2026-11-05T00:00:00Z", match: { contact: "Paul Martin", company: "Martin BTP", status: "Démo programmée", clientId: 1 } },
    { network: "youtube", name: "Inconnu", text: "Bravo", url: "", at: "2026-11-04T00:00:00Z", match: null },
  ],
  youtubeSources: [{ source: "Recherche YouTube", views: 800, minutes: 500 }],
  youtubeSearches: [{ term: "logiciel pointage chantier", views: 120 }],
  errors: [],
};

describe("Le déroulé du rapport de Cléo", () => {
  let audits: Record<string, unknown>[];
  let asked: string;
  const payload = () => ({
    find: vi.fn(async ({ collection }: { collection: string }) => (collection === "ai-team-members" ? { docs: [{ id: 90, name: "Cléo", active: true }] } : { docs: [] })),
    count: vi.fn(async () => ({ totalDocs: 0 })),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (audits.push(data), { id: audits.length, ...data })),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (Object.assign(audits.at(-1)!, data), data)),
    logger: { warn: vi.fn() },
  });
  const call: WebCall = async (req) => {
    asked = JSON.stringify(req);
    return { content: [{ type: "text", text: answer([action({ type: "relance", titre: "Relancer Paul Martin", personne: "Paul Martin" })]), citations: null }] as never, usage: { input: 15_000, output: 2_000, cacheRead: 0, cacheWrite: 0 }, searches: 3, stopReason: "end_turn" };
  };
  beforeEach(() => {
    audits = [];
    asked = "";
  });

  it("chaque semaine, le premier jour ouvré dès 5 h ; garde la mesure avec le rapport ; les personnes connues du CRM partent au modèle", async () => {
    const monday4h = new Date("2026-11-16T03:00:00Z"); // 4 h à Paris
    const monday6h = new Date("2026-11-16T05:00:00Z");
    expect((await runSocial(payload() as never, { now: monday4h, call, measure: async () => measure })).status).toBe("pas-encore");
    expect((await runSocial(payload() as never, { now: monday6h, call, measure: async () => measure })).status).toBe("fait");
    expect(audits[0]).toMatchObject({ kind: "reseaux", period: "2026-11-16", status: "fait", measure: { networks: [{ network: "youtube" }] } });
    expect(asked).toContain("Martin BTP");
    expect((await runSocial(payload() as never, { now: new Date("2026-11-15T09:00:00Z"), call, measure: async () => measure })).status).toBe("pas-encore");
  });

  it("ce que le modèle lit : compact, les personnes du CRM à part", () => {
    const m = socialForModel(measure);
    expect(m.personnesConnuesDuCrm).toEqual([{ reseau: "YouTube", nom: "Paul Martin", contact: "Paul Martin", entreprise: "Martin BTP", statut: "Démo programmée", aEcrit: "Et la paie ?", date: "2026-11-05" }]);
    expect(m.autresCommentaires).toEqual([{ reseau: "YouTube", nom: "Inconnu", aEcrit: "Bravo" }]);
    expect(m.publications[0]).toMatchObject({ minutesRegardees: 900, partVuePct: 48, abonnesGagnes: 12 });
  });
});
