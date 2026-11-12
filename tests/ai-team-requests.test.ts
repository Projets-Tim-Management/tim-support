import { describe, expect, it } from "vitest";

import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import { buildInbox, closeRequest } from "@/modules/ai-team/lib/inbox";
import { safeRequestUrl, validateRequest } from "@/modules/ai-team/lib/requests";

/**
 * Les demandes des chefs à la direction : deux formes (à faire / question),
 * des liens sûrs seulement, et « À valider » rangé au même endroit.
 */

describe("un lien de demande ne mène qu'au back-office ou à une console connue", () => {
  it("accepte une page du back-office et une console en https", () => {
    expect(safeRequestUrl("/admin/publicite/a-valider?campagne=7")).toBe("/admin/publicite/a-valider?campagne=7");
    expect(safeRequestUrl("https://business.facebook.com/settings")).toBe("https://business.facebook.com/settings");
    expect(safeRequestUrl("https://ads.google.com/aw/overview")).toBe("https://ads.google.com/aw/overview");
  });

  it("refuse tout le reste : autre site, http, faux sous-domaine, identifiants, chemin détourné", () => {
    expect(safeRequestUrl("https://evil.example.com/admin")).toBeNull();
    expect(safeRequestUrl("http://business.facebook.com")).toBeNull();
    expect(safeRequestUrl("https://facebook.com.evil.io")).toBeNull();
    expect(safeRequestUrl("https://user:pw@ads.google.com")).toBeNull();
    expect(safeRequestUrl("/admin//evil.example.com")).toBeNull();
    expect(safeRequestUrl("javascript:alert(1)")).toBeNull();
    expect(safeRequestUrl("/autre-page")).toBeNull();
  });
});

describe("une demande telle qu'un chef la formule", () => {
  it("« à faire » : des étapes obligatoires, un lien sûr ou aucun", () => {
    const ok = validateRequest({ type: "a-faire", titre: "Connecter le compte Meta", pourquoi: "Le jeton expire", lien: "/admin/collections/ad-accounts", etapes: ["Ouvrez le compte", "  Cliquez « Reconnecter »  ", ""] });
    expect(ok).toEqual({ ok: true, value: { kind: "a-faire", title: "Connecter le compte Meta", why: "Le jeton expire", url: "/admin/collections/ad-accounts", steps: ["Ouvrez le compte", "Cliquez « Reconnecter »"], question: null } });
    expect(validateRequest({ type: "a-faire", titre: "x", pourquoi: "y", etapes: [] })).toMatchObject({ ok: false });
    expect(validateRequest({ type: "a-faire", titre: "x", pourquoi: "y", etapes: ["a"], lien: "https://evil.example.com" })).toMatchObject({ ok: false, reason: expect.stringMatching(/lien refusé/) });
  });

  it("« question » : une question, pas de lien", () => {
    expect(validateRequest({ type: "question", titre: "Budget de décembre", pourquoi: "Les fêtes", question: "Quel plafond Meta pour décembre ?" })).toMatchObject({ ok: true, value: { kind: "question", url: null } });
    expect(validateRequest({ type: "question", titre: "x", pourquoi: "y" })).toMatchObject({ ok: false });
    expect(validateRequest({ type: "autre", titre: "x", pourquoi: "y" })).toMatchObject({ ok: false });
  });
});

describe("clore une demande", () => {
  const todo = { kind: "a-faire", status: "ouverte" };
  const ask = { kind: "question", status: "ouverte" };
  it("« C'est fait » pour un à-faire, une réponse pour une question, retirer pour les deux", () => {
    expect(closeRequest(todo, "fait", "")).toEqual({ ok: true, status: "faite", answer: null });
    expect(closeRequest(todo, "fait", "Fait ce matin")).toEqual({ ok: true, status: "faite", answer: "Fait ce matin" });
    expect(closeRequest(ask, "repondre", "200 €")).toEqual({ ok: true, status: "repondue", answer: "200 €" });
    expect(closeRequest(ask, "retirer", "")).toMatchObject({ ok: true, status: "retiree" });
  });
  it("refuse ce qui ne colle pas à la forme, une réponse vide, une demande déjà close", () => {
    expect(closeRequest(ask, "fait", "")).toMatchObject({ ok: false });
    expect(closeRequest(todo, "repondre", "x")).toMatchObject({ ok: false });
    expect(closeRequest(ask, "repondre", "  ")).toMatchObject({ ok: false });
    expect(closeRequest({ kind: "a-faire", status: "faite" }, "fait", "")).toMatchObject({ ok: false });
  });
});

describe("« Vos demandes » rassemble tout ce qui attend la direction", () => {
  const members = [{ id: 1, key: "chef-sea", engineRoles: ["orchestrateur", "analyste"] }];
  const inbox = buildInbox({
    members,
    campaigns: [{ id: 7, name: "Campagne test" }],
    requests: [
      { id: 10, member: 1, kind: "question", status: "ouverte", title: "Budget de décembre", why: "Les fêtes", question: "Quel plafond ?", createdAt: "2026-11-11T08:00:00Z" },
      { id: 11, member: 1, kind: "a-faire", status: "faite", title: "Reconnecter Meta", why: "Jeton", answer: "OK", closedAt: "2026-11-10T08:00:00Z", createdAt: "2026-11-09T08:00:00Z" },
    ],
    pendingCreatives: [
      { campaign: 7, createdAt: "2026-11-02T08:00:00Z" },
      { campaign: 7, createdAt: "2026-11-02T08:00:00Z" },
    ],
    proposedActions: [{ id: 5, kind: "budget", campaign: 7, rationale: "CPC en baisse", after: {}, createdAt: "2026-11-12T07:00:00Z" }],
  });

  it("les demandes ouvertes des chefs, les créas par campagne, les actions proposées — les plus récentes d'abord", () => {
    expect(inbox.open.map((i) => [i.source, i.kind])).toEqual([
      ["a-valider", "a-faire"],
      ["chef", "question"],
      ["a-valider", "a-faire"],
    ]);
    const creas = inbox.open.find((i) => i.id === "creas-7")!;
    expect(creas).toMatchObject({ title: "Décider de 2 créas — Campagne test", url: "/admin/publicite/a-valider?campagne=7", memberKey: "chef-sea" });
    expect(creas.steps.length).toBeGreaterThan(0);
  });

  it("garde les demandes traitées à part, avec la réponse", () => {
    expect(inbox.closed).toEqual([{ id: "r-11", memberKey: "chef-sea", kind: "a-faire", title: "Reconnecter Meta", status: "faite", answer: "OK", at: "2026-11-10T08:00:00Z" }]);
  });
});

describe("les outils pour parler à la direction", () => {
  it("sont donnés aux chefs (orchestratrice, analyste), pas aux sous-agents", () => {
    for (const role of ["orchestrateur", "analyste"] as const) {
      expect(ROLE_TOOLS[role]).toContain("demander_a_la_direction");
      expect(ROLE_TOOLS[role]).toContain("lire_reponses_direction");
    }
    for (const role of ["stratege", "redacteur", "directeur-artistique", "controleur"] as const) expect(ROLE_TOOLS[role]).not.toContain("demander_a_la_direction");
  });
});
