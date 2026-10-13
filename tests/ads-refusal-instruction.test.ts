import { describe, expect, it, vi } from "vitest";

import type { AgentModelCall } from "@/modules/ads/agent/types";
import { instructionGesture, learningGesture, parseInstructionGesture } from "@/modules/ads/lib/notebook-actions";
import { fallbackInstruction, proposeFromRefusal, refusalTeaches } from "@/modules/ads/lib/refusal-instruction";

/**
 * Refus → consigne proposée, et les gestes qui la confirment (plan Publicité,
 * §9 quinquies, commit 4 ter).
 */

const NOW = new Date("2026-10-13T08:00:00Z");
const creative = { id: 9, angle: "Zéro papier", hook: "Fini les bons papier", campaign: 77, copy: [{ kind: "principal", text: "Un chantier de nuit, sans papier.", status: "ok" }] };

/** Une base minimale : garde-fous ouverts, rien dépensé, chaque création renvoyée. */
function fakePayload(settings: Record<string, unknown> = { enabled: true }) {
  const created: { collection: string; data: Record<string, unknown> }[] = [];
  const payload = {
    findGlobal: vi.fn(async () => settings),
    find: vi.fn(async () => ({ docs: [] })),
    create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      created.push({ collection, data });
      return { id: created.length, ...data };
    }),
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
  return { payload: payload as never, created };
}

const haiku = (text: string): AgentModelCall => vi.fn(async () => ({ content: [{ type: "text", text, citations: null }] as never, stopReason: "end_turn", usage: { input: 400, output: 30, cacheRead: 0, cacheWrite: 0 } }));

describe("un refus propose une consigne", () => {
  it("Haiku généralise le motif ; la consigne naît « proposée », propre à la campagne, et la dépense est inscrite", async () => {
    const { payload, created } = fakePayload();
    const out = await proposeFromRefusal(payload, creative, { reason: "visuel", detail: "pas de chantier de nuit" }, { model: haiku("« Ne montrez jamais de chantier de nuit. »"), now: NOW });
    expect(out).toMatchObject({ text: "Ne montrez jamais de chantier de nuit.", ai: true });
    const usage = created.find((c) => c.collection === "ad-ai-usage");
    expect(usage?.data).toMatchObject({ kind: "texte", campaign: 77 });
    const consigne = created.find((c) => c.collection === "ad-instructions");
    expect(consigne?.data).toMatchObject({ status: "proposee", origin: "refus", scope: "campagne", campaign: 77, sourceCreative: 9, refusalReason: "Visuel à reprendre : pas de chantier de nuit" });
  });

  it("sans IA (interrupteur coupé, erreur), le motif et la précision tels quels", async () => {
    const { payload, created } = fakePayload({ enabled: false });
    const model = haiku("jamais appelé");
    const out = await proposeFromRefusal(payload, creative, { reason: "hors-marque", detail: " trop familier " }, { model, now: NOW });
    expect(model).not.toHaveBeenCalled();
    expect(out).toMatchObject({ text: "Hors marque (ton, style) : trop familier", ai: false });
    expect(created.map((c) => c.collection)).toEqual(["ad-instructions"]);
  });

  it("un modèle qui échoue ne fait pas échouer le refus", async () => {
    const { payload } = fakePayload();
    const model: AgentModelCall = vi.fn(async () => {
      throw new Error("timeout");
    });
    expect(await proposeFromRefusal(payload, creative, { reason: "faux" }, { model, now: NOW })).toMatchObject({ text: "Faux ou invérifiable", ai: false });
  });

  it("un doublon n'apprend rien sur la façon d'écrire : pas de consigne", async () => {
    const { payload, created } = fakePayload();
    expect(refusalTeaches("doublon")).toBe(false);
    expect(await proposeFromRefusal(payload, creative, { reason: "doublon" }, { model: haiku("x"), now: NOW })).toBeNull();
    expect(created).toHaveLength(0);
  });

  it("le repli dit le motif lisible, sans précision vide", () => {
    expect(fallbackInstruction("mal-ecrit", "   ")).toBe("Mal écrit");
  });
});

describe("confirmer ce que l'agent lira", () => {
  it("« En faire une consigne » active le texte du champ, à la portée choisie", () => {
    const g = parseInstructionGesture({ action: "activer", text: "  Pas de  chantier de nuit. ", scope: "global" })!;
    expect(instructionGesture({ status: "proposee", campaign: 77 }, g)).toEqual({ data: { status: "active", text: "Pas de chantier de nuit.", scope: "global" } });
  });

  it("« Non » l'écarte ; une consigne déjà décidée ne se redécide pas ici", () => {
    expect(instructionGesture({ status: "proposee" }, { action: "ecarter" })).toEqual({ data: { status: "ecartee" } });
    expect(instructionGesture({ status: "active" }, { action: "ecarter" })).toHaveProperty("error");
  });

  it("refuse un texte vide, ou une portée « campagne » sans campagne", () => {
    expect(instructionGesture({ status: "proposee", campaign: 77 }, { action: "activer", text: " ", scope: "campagne" })).toHaveProperty("error");
    expect(instructionGesture({ status: "proposee", campaign: null }, { action: "activer", text: "T", scope: "campagne" })).toHaveProperty("error");
  });

  it("un apprentissage proposé en global devient global, ou reste à sa campagne", () => {
    expect(learningGesture({ status: "global-propose", campaign: 77 }, { action: "promouvoir" })).toEqual({ data: { status: "actif", scope: "global" } });
    expect(learningGesture({ status: "global-propose", campaign: 77 }, { action: "garder" })).toEqual({ data: { status: "actif", scope: "campagne" } });
    expect(learningGesture({ status: "actif", campaign: 77 }, { action: "promouvoir" })).toHaveProperty("error");
  });
});
