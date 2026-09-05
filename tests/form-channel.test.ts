import { describe, expect, it } from "vitest";

import { hasPaidClick, isLandingPage, isPaidMedium, resolveChannel } from "@/modules/forms/lib/channel";
import { parseAttribution } from "@/modules/forms/lib/ingest";

/**
 * Le canal remplit la « Provenance » d'une opportunité : s'y tromper fausse
 * durablement la lecture du coût d'acquisition, sans que rien ne le signale.
 */

const a = (raw: Record<string, unknown>) => parseAttribution(raw);
const channelOf = (att: ReturnType<typeof a>, def?: "seo" | "sea") =>
  resolveChannel(att, def).channel;

describe("ChatGPT Ads", () => {
  it("l'emporte sur la règle générale du clic payant", () => {
    /**
     * LE test de ce canal. ChatGPT Ads envoie `utm_medium=cpc`, donc la règle
     * générale répond déjà « clic payant ». Placée après elle, la règle ChatGPT
     * ne serait jamais atteinte et TOUS ces leads s'afficheraient « Google
     * Ads » — sans erreur, sans alerte, juste un intitulé faux dans les
     * tableaux de bord.
     */
    const chatgpt = a({ utm_source: "chatgpt", utm_medium: "cpc", oaiclid: "oai-123" });
    expect(hasPaidClick(chatgpt), "la règle générale répond bien oui").toBe(true);
    expect(channelOf(chatgpt)).toBe("chatgpt");
    expect(resolveChannel(chatgpt).source).toBe("clic-payant");
  });

  it("se reconnaît à la référence de clic seule", () => {
    // `oaiclid` vient de la macro {oppref} : elle n'existe que sur un clic
    // d'annonce, elle se suffit donc à elle-même.
    expect(channelOf(a({ oaiclid: "oai-123" }))).toBe("chatgpt");
  });

  it("accepte la source, à condition qu'un medium payant l'accompagne", () => {
    expect(channelOf(a({ utm_source: "ChatGPT", utm_medium: "cpc" }))).toBe("chatgpt");
  });

  it("REFUSE la source seule : ChatGPT cite aussi des sites hors publicité", () => {
    /**
     * L'étiquette `utm_source=chatgpt` se met à la main dans n'importe quel
     * lien partagé. Compter ce trafic comme un clic acheté gonflerait le coût
     * d'acquisition d'un canal qui n'a rien coûté — et personne ne penserait à
     * vérifier un chiffre qui monte.
     */
    expect(channelOf(a({ utm_source: "chatgpt" }))).toBe("seo");
    expect(channelOf(a({ utm_source: "chatgpt", utm_medium: "referral" }))).toBe("seo");
  });

  it("ne détourne pas un lead Google", () => {
    expect(channelOf(a({ utm_source: "google", utm_medium: "cpc", gclid: "Cj0" }))).toBe("sea");
  });
});

describe("trace d'un clic payant", () => {
  it("reconnaît les identifiants de clic des deux régies", () => {
    expect(hasPaidClick(a({ gclid: "Cj0KCQ" }))).toBe(true);
    expect(hasPaidClick(a({ msclkid: "abc" }))).toBe(true);
  });

  it("reconnaît un utm_medium payant, quelle que soit sa graphie", () => {
    for (const m of ["cpc", "CPC", " ppc ", "paid", "paidsearch", "paid-search", "paid_social"]) {
      expect(isPaidMedium(m), m).toBe(true);
    }
  });

  it("ne prend pas un trafic gratuit pour du payant", () => {
    for (const m of ["organic", "referral", "email", "social", "none", "", null, undefined]) {
      expect(isPaidMedium(m), String(m)).toBe(false);
    }
    expect(hasPaidClick(a({ utm_source: "google", utm_medium: "organic" }))).toBe(false);
  });
});

describe("provenance d'une landing page", () => {
  it("se déduit de l'emplacement ou du slug", () => {
    expect(isLandingPage(a({ placement: "lp-hero" }))).toBe(true);
    expect(isLandingPage(a({ placement: "lp-section" }))).toBe(true);
    expect(isLandingPage(a({ lp_slug: "demande-demo-suivi-temps" }))).toBe(true);
  });

  it("ne confond pas le tiroir global et la page contact avec une landing page", () => {
    expect(isLandingPage(a({ placement: "drawer" }))).toBe(false);
    expect(isLandingPage(a({ placement: "page-contact" }))).toBe(false);
    expect(isLandingPage(a({}))).toBe(false);
  });
});

describe("canal retenu", () => {
  it("classe en SEO une visite ordinaire du site", () => {
    expect(channelOf(a({ placement: "drawer", source_page_path: "/produits/pointage" }))).toBe("seo");
    expect(channelOf(a({ placement: "page-contact" }))).toBe("seo");
    expect(channelOf(a({ utm_source: "linkedin", utm_medium: "social" }))).toBe("seo");
  });

  it("classe en SEA une landing page, même sans aucun paramètre", () => {
    // Les deux LP ne sont pas indexées : on n'y arrive que par une annonce. Un
    // visiteur qui y revient en direct a bien été acquis par la campagne.
    expect(channelOf(a({ placement: "lp-hero" }))).toBe("sea");
  });

  it("fait primer le clic payant sur la page, y compris sur le tiroir global", () => {
    // Quelqu'un arrive par une annonce, navigue, puis ouvre le tiroir : c'est la
    // campagne qui l'a amené, pas le référencement naturel.
    expect(channelOf(a({ placement: "drawer", gclid: "Cj0KCQ" }))).toBe("sea");
    expect(channelOf(a({ placement: "page-contact", utm_medium: "cpc" }))).toBe("sea");
    expect(channelOf(a({ placement: "drawer", msclkid: "x" }))).toBe("sea");
  });

  it("retombe sur le canal déclaré du formulaire quand aucun signal ne parle", () => {
    expect(channelOf(a({}), "seo")).toBe("seo");
    expect(channelOf(a({}), "sea")).toBe("sea");
    expect(channelOf(a({ placement: "drawer" }))).toBe("seo");
  });
});

describe("traçabilité de la décision", () => {
  it("distingue un fait d'une présomption", () => {
    // « clic-payant » est constaté ; « landing-page » est déduit du fait que ces
    // deux pages ne sont atteignables que par une annonce.
    expect(resolveChannel(a({ gclid: "x" })).source).toBe("clic-payant");
    expect(resolveChannel(a({ utm_medium: "cpc" })).source).toBe("clic-payant");
    expect(resolveChannel(a({ placement: "lp-hero" })).source).toBe("landing-page");
    expect(resolveChannel(a({ placement: "drawer" })).source).toBe("defaut");
  });

  it("fait primer le fait sur la présomption, même sur une landing page", () => {
    // Sans cet ordre, un clic payant sur une LP serait compté comme présomption
    // et gonflerait la part de repli — l'indicateur qui doit alerter.
    const r = resolveChannel(a({ placement: "lp-hero", gclid: "x" }));
    expect(r).toEqual({ channel: "sea", source: "clic-payant" });
  });
});
