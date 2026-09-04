import { afterEach, describe, expect, it, vi } from "vitest";

import { checkIngestKey, clientIp, parseAttribution } from "@/modules/forms/lib/ingest";

/**
 * Ce qui entoure une soumission : le droit de l'envoyer, l'adresse du visiteur,
 * et d'où il vient. Trois choses qui, mal traitées, ne cassent rien
 * visiblement — elles laissent seulement passer n'importe qui, protègent
 * l'infrastructure au lieu du service, ou effacent l'attribution.
 */

const req = (headers: Record<string, string> = {}) =>
  new Request("https://support.tim-management.co/api/forms/demo/submissions", {
    method: "POST",
    headers,
  });

describe("secret partagé avec le proxy de la vitrine", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepte le bon secret", () => {
    vi.stubEnv("FORMS_INGEST_SECRET", "secret-de-test");
    expect(checkIngestKey(req({ "x-form-key": "secret-de-test" }))).toEqual({ ok: true });
  });

  it("refuse un secret faux, absent, ou de longueur différente", () => {
    vi.stubEnv("FORMS_INGEST_SECRET", "secret-de-test");
    for (const key of ["secret-de-tesT", "", "secret-de-test-plus-long", "court"]) {
      expect(checkIngestKey(req({ "x-form-key": key })), key).toEqual({
        ok: false,
        reason: "unauthorized",
      });
    }
    expect(checkIngestKey(req())).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("tolère l'absence de secret en développement", () => {
    vi.stubEnv("FORMS_INGEST_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(checkIngestKey(req())).toEqual({ ok: true });
  });

  it("refuse tout si le secret manque en production", () => {
    // Un point d'entrée public non protégé est pire qu'un point d'entrée absent.
    vi.stubEnv("FORMS_INGEST_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(checkIngestKey(req())).toEqual({ ok: false, reason: "misconfigured" });
  });
});

describe("adresse du visiteur", () => {
  it("prend la première entrée de X-Forwarded-For", () => {
    // Les suivantes sont les relais traversés ; la première est le client.
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" }))).toBe(
      "203.0.113.7",
    );
    expect(clientIp(req({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  it("se rabat sur X-Real-IP, puis renonce", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "x-forwarded-for": "", "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req())).toBeUndefined();
  });
});

describe("attribution", () => {
  it("lit les clés du contrat, en tirets bas comme en camelCase", () => {
    const a = parseAttribution({
      placement: "drawer",
      source_page_path: "/produits/pointage",
      utm_source: "google",
      gclid: "abc123",
    });
    expect(a.placement).toBe("drawer");
    expect(a.sourcePagePath).toBe("/produits/pointage");
    expect(a.utmSource).toBe("google");
    expect(a.gclid).toBe("abc123");
    expect(parseAttribution({ sourcePagePath: "/x", utmCampaign: "c" })).toMatchObject({
      sourcePagePath: "/x",
      utmCampaign: "c",
    });
  });

  it("garde la page d'arrivée, distincte de celle du formulaire", () => {
    // Une personne arrivée sur une landing page puis passée au tiroir remplit
    // ailleurs qu'elle n'est entrée : les deux chemins disent des choses différentes.
    const a = parseAttribution({
      landing_path: "/lp/demande-demo-suivi-temps-v2",
      source_page_path: "/produits/pointage",
    });
    expect(a.landingPath).toBe("/lp/demande-demo-suivi-temps-v2");
    expect(a.sourcePagePath).toBe("/produits/pointage");
    expect(parseAttribution({ landingPath: "/x" }).landingPath).toBe("/x");
  });

  it("garde la variante de landing page, sans quoi l'A/B test n'existe pas", () => {
    const a = parseAttribution({ lp_slug: "demande-demo-suivi-temps", lp_variant: "v2" });
    expect(a.lpSlug).toBe("demande-demo-suivi-temps");
    expect(a.lpVariant).toBe("v2");
  });

  it("écarte un emplacement inconnu au lieu de refuser la soumission", () => {
    // Le site doit pouvoir introduire un emplacement sans attendre un
    // déploiement de notre côté : on perd la précision, jamais le lead.
    expect(parseAttribution({ placement: "nouveau-truc" }).placement).toBeUndefined();
    expect(parseAttribution({ placement: "lp-hero" }).placement).toBe("lp-hero");
  });

  it("plafonne les longueurs — ces valeurs viennent d'une URL", () => {
    const a = parseAttribution({
      source_page_url: "https://x/" + "a".repeat(5000),
      utm_campaign: "c".repeat(5000),
      session_id: "s".repeat(5000),
    });
    expect(a.sourcePageUrl!.length).toBe(1500);
    expect(a.utmCampaign!.length).toBe(255);
    expect(a.sessionId!.length).toBe(128);
  });

  it("traite le vide et l'aberrant comme une absence", () => {
    const a = parseAttribution({ utm_source: "   ", referrer: 42, gclid: null });
    expect(a.utmSource).toBeUndefined();
    expect(a.referrer).toBeUndefined();
    expect(a.gclid).toBeUndefined();
    for (const body of [null, undefined, "texte", 7]) {
      expect(Object.values(parseAttribution(body)).every((v) => v === undefined)).toBe(true);
    }
  });
});
