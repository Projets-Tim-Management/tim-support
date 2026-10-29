import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildEvent, fbcOf, hashEmail, hashPhone, type SubmissionIn } from "@/modules/ads/lib/conversions";
import { prospectsPlan, withoutIds } from "@/modules/ads/lib/prospects";
import { readPlan } from "@/modules/ads/lib/media-plan";
import { parseAttribution } from "@/modules/forms/lib/ingest";

const sendEvents = vi.fn(async (_a: unknown, _p: string, events: unknown[]) => ({ received: events.length }));
vi.mock("@/modules/ads/lib/account-access", () => ({ accountContext: async () => ({ ctx: { externalId: "act_1", token: "T" }, platform: { sendEvents: (...a: unknown[]) => sendEvents(...(a as [unknown, string, unknown[]])) } }) }));
const { sendConversions } = await import("@/modules/ads/lib/conversions-run");

const NOW = new Date("2026-11-05T10:00:00Z");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const sub = (over: Partial<SubmissionIn> = {}): SubmissionIn => ({ id: 1, submissionId: "uuid-1", createdAt: "2026-11-04T09:00:00Z", adsConsent: true, email: " Jean@Exemple.FR ", phone: "06 12 34 56 78", fbclid: "IwAR2abc", ...over });

describe("les leads renvoyés à Meta", () => {
  it("rien sans l'accord « Publicité » (décision du 29/10/2026)", () => {
    expect(buildEvent("Lead", sub({ adsConsent: false }), new Date(sub().createdAt), NOW)).toEqual({ skip: "pas d'accord « Publicité » du visiteur" });
    expect(buildEvent("Lead", sub({ adsConsent: null }), new Date(sub().createdAt), NOW)).toHaveProperty("skip");
  });

  it("e-mail et téléphone hachés comme Meta l'attend ; fbc reconstruit depuis fbclid", () => {
    expect(hashEmail(" Jean@Exemple.FR ")).toBe(sha("jean@exemple.fr"));
    expect(hashPhone("06 12 34 56 78")).toBe(sha("33612345678"));
    expect(hashPhone("+33 6 12 34 56 78")).toBe(sha("33612345678"));
    expect(hashEmail("pas-un-mail")).toBeNull();
    expect(fbcOf({ fbclid: "IwAR2abc" }, new Date(1_700_000_000_000))).toBe("fb.1.1700000000000.IwAR2abc");
    expect(fbcOf({ fbc: "fb.1.1.XYZ", fbclid: "IwAR2abc" }, new Date())).toBe("fb.1.1.XYZ");
  });

  it("un Lead porte l'identifiant de la soumission (dédoublonné avec le pixel), les étapes suivantes viennent du support", () => {
    const lead = buildEvent("Lead", sub({ ip: "1.2.3.4", userAgent: "UA", sourcePageUrl: "https://tim-management.co/lp" }), new Date(sub().createdAt), NOW);
    expect(lead).toMatchObject({ event_name: "Lead", event_id: "uuid-1", action_source: "website", event_source_url: "https://tim-management.co/lp", user_data: { client_ip_address: "1.2.3.4" } });
    const q = buildEvent("QualifiedLead", sub({ ip: "1.2.3.4" }), NOW, NOW);
    expect(q).toMatchObject({ event_name: "QualifiedLead", event_id: "QualifiedLead-uuid-1", action_source: "system_generated" });
    expect((q as { user_data: Record<string, unknown> }).user_data.client_ip_address).toBeUndefined();
  });

  it("plus de 7 jours : Meta le refuserait, on ne l'envoie pas", () => {
    expect(buildEvent("Lead", sub({ createdAt: "2026-10-20T09:00:00Z" }), new Date("2026-10-20T09:00:00Z"), NOW)).toEqual({ skip: "plus de 7 jours : Meta le refuserait" });
  });

  it("le support lit l'accord et les cookies Meta envoyés par la vitrine, et rien d'autre", () => {
    expect(parseAttribution({ ads_consent: true, fbp: "fb.1.1700000000000.123456789", fbc: "fb.1.1700000000000.IwAR2abc" })).toMatchObject({ adsConsent: true, fbp: "fb.1.1700000000000.123456789", fbc: "fb.1.1700000000000.IwAR2abc" });
    const bad = parseAttribution({ ads_consent: "oui", fbp: "<script>", fbc: "x" });
    expect(bad.adsConsent).toBeUndefined();
    expect(bad.fbp).toBeUndefined();
    expect(bad.fbc).toBeUndefined();
  });
});

type Doc = Record<string, unknown> & { id: number };
function memory(seed: Record<string, Doc[]>) {
  const tables: Record<string, Doc[]> = { "ad-accounts": [], "form-submissions": [], "ad-conversions": [], "partner-clients": [], ...seed };
  let next = 900;
  const ok = (d: Doc, w: Record<string, unknown>): boolean =>
    Object.entries(w).every(([k, c]) => {
      if (k === "and") return (c as Record<string, unknown>[]).every((x) => ok(d, x));
      const cond = c as Record<string, unknown>;
      const v = k.includes(".") ? k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], d) : d[k];
      if ("equals" in cond) return String(v) === String(cond.equals);
      if ("in" in cond) return (cond.in as unknown[]).map(String).includes(String(v));
      if ("exists" in cond) return cond.exists ? v != null : v == null;
      if ("greater_than_equal" in cond) return String(v) >= String(cond.greater_than_equal);
      return true;
    });
  const payload = {
    findGlobal: async () => ({ enabled: true }),
    find: async ({ collection, where }: { collection: string; where?: Record<string, unknown> }) => ({ docs: tables[collection].filter((d) => ok(d, where ?? {})) }),
    create: async ({ collection, data }: { collection: string; data: Doc }) => {
      const d = { ...data, id: next++ };
      tables[collection].push(d);
      return d;
    },
    logger: { warn() {}, error() {} },
  };
  return { payload: payload as never, tables };
}

describe("l'envoi, après chaque synchro", () => {
  beforeEach(() => {
    sendEvents.mockClear();
  });
  const seed = () => ({
    "ad-accounts": [{ id: 2, status: "connecte", diffusion: { pixelId: "695680415425351" } } as Doc],
    "form-submissions": [
      { id: 1, submissionId: "uuid-1", createdAt: "2026-11-04T09:00:00Z", adsConsent: true, answers: { email: "a@b.fr", telephone: "0612345678" } } as Doc,
      { id: 2, submissionId: "uuid-2", createdAt: "2026-11-04T09:00:00Z", adsConsent: false, answers: { email: "c@d.fr" } } as Doc,
    ],
  });

  it("envoie le Lead d'un visiteur qui a accepté, une seule fois ; puis l'étape qualifiée quand la fiche y passe", async () => {
    const { payload, tables } = memory(seed());
    expect(await sendConversions(payload, NOW)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(sendEvents).toHaveBeenCalledWith(expect.anything(), "695680415425351", [expect.objectContaining({ event_name: "Lead", event_id: "uuid-1" })]);
    expect(await sendConversions(payload, NOW)).toEqual({ sent: 0, skipped: 0, failed: 0 });

    tables["partner-clients"].push({ id: 50, formSubmission: 1, clientStatus: "demo-programmee" });
    expect(await sendConversions(payload, NOW)).toMatchObject({ sent: 1 });
    expect(tables["ad-conversions"].map((c) => c.event)).toEqual(["Lead", "QualifiedLead"]);
  });

  it("un échec chez Meta n'est pas noté comme fait : il sera retenté", async () => {
    sendEvents.mockRejectedValueOnce(new Error("Meta 100"));
    const { payload, tables } = memory(seed());
    expect(await sendConversions(payload, NOW)).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(tables["ad-conversions"]).toEqual([]);
  });

  it("sans pixel choisi sur le compte, rien ne part", async () => {
    const { payload } = memory({ ...seed(), "ad-accounts": [{ id: 2, status: "connecte", diffusion: {} } as Doc] });
    expect(await sendConversions(payload, NOW)).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(sendEvents).not.toHaveBeenCalled();
  });
});

describe("la campagne Prospects préparée à partir d'une campagne Trafic", () => {
  it("garde le ciblage, change l'objectif et l'optimisation — et le plan se relit tel quel", () => {
    const plan = readPlan({ objectif: "trafic", optimisation: "vues-page", ensembles: [{ nom: "BTP terrain", part: 100, age_min: 25, metiers: [{ id: "4730", name: "Conducteur de travaux" }] }] });
    const again = readPlan(prospectsPlan(plan));
    expect(again).toMatchObject({ objectif: "prospects", optimisation: "conversions", ensembles: [{ nom: "BTP terrain", part: 100, ageMin: 25, metiers: [{ id: "4730", name: "Conducteur de travaux" }] }] });
  });

  it("une créa recopiée ne garde aucun identifiant de l'originale", () => {
    expect(withoutIds({ id: 19, angle: "A", copy: [{ id: "row1", text: "T" }], brief: { formats: [{ id: "f1", format: "4x5" }] }, createdAt: "x" })).toEqual({ angle: "A", copy: [{ text: "T" }], brief: { formats: [{ format: "4x5" }] } });
  });
});
