import { describe, expect, it } from "vitest";

import {
  CHANNEL_REGISTRY,
  CHANNELS,
  PROVENANCE_OPTIONS,
  SOURCE_BY_CHANNEL,
  channelLabel,
  isPaidChannel,
  provenanceLabel,
} from "@/core/lib/channels";
import { PartnerClients } from "@/modules/partner/collections/PartnerClients";

/**
 * Le registre remplace quatre listes écrites à la main. Ces copies FIGÉES sont
 * celles d'avant le registre : il doit les reproduire à l'identique, ORDRE
 * compris — l'ordre des options est l'ordre des enums Postgres, et le changer
 * ferait générer une migration.
 */
const HISTORIC_CHANNELS = [
  { label: "Site vitrine — SEO", value: "seo", paid: false },
  { label: "Google Ads — SEA", value: "sea", paid: true },
  { label: "ChatGPT Ads — SEA", value: "chatgpt", paid: true },
];

const HISTORIC_PROVENANCE = [
  { label: "Saisie manuelle", value: "manuelle" },
  { label: "Site vitrine — SEO", value: "site-vitrine-seo" },
  { label: "Google Ads — SEA", value: "google-ads-sea" },
  { label: "ChatGPT Ads — SEA", value: "chatgpt-ads-sea" },
  { label: "Site vitrine (import Brevo)", value: "site-vitrine" },
];

/** Ajoutés depuis (29/09/2026) : même valeur des deux côtés. */
const META = [
  { label: "Meta Ads — Facebook", value: "meta-facebook" },
  { label: "Meta Ads — Instagram", value: "meta-instagram" },
];

describe("registre des canaux", () => {
  it("garde les canaux de soumission historiques, et ajoute Meta EN FIN (ordre de l'enum)", () => {
    expect(CHANNELS).toEqual([...HISTORIC_CHANNELS, ...META.map((m) => ({ ...m, paid: true }))]);
  });

  it("garde la Provenance historique, Meta avant l'import Brevo — et c'est bien elle que l'opportunité déclare", () => {
    const expected = [...HISTORIC_PROVENANCE.slice(0, 4), ...META, HISTORIC_PROVENANCE[4]];
    expect(PROVENANCE_OPTIONS).toEqual(expected);
    const field = PartnerClients.fields.find((f) => "name" in f && f.name === "source");
    expect(field && "options" in field ? field.options : null).toEqual(expected);
  });

  it("garde la correspondance canal → provenance sans rien renommer", () => {
    expect(SOURCE_BY_CHANNEL).toEqual({
      seo: "site-vitrine-seo",
      sea: "google-ads-sea",
      chatgpt: "chatgpt-ads-sea",
      "meta-facebook": "meta-facebook",
      "meta-instagram": "meta-instagram",
    });
  });

  it("compte Meta comme payant, sans l'étiqueter SEA", () => {
    expect(isPaidChannel("meta-facebook")).toBe(true);
    expect(isPaidChannel("meta-instagram")).toBe(true);
    expect(channelLabel("meta-facebook")).not.toMatch(/SEA/);
  });

  it("donne le même libellé à un canal et à sa provenance", () => {
    for (const e of CHANNEL_REGISTRY) {
      expect(provenanceLabel(e.source)).toBe(e.label);
      if (e.channel) expect(channelLabel(e.channel)).toBe(e.label);
    }
  });

  it("n'a aucune valeur en double, d'un côté comme de l'autre", () => {
    const sources = CHANNEL_REGISTRY.map((e) => e.source);
    const channels = CHANNELS.map((c) => c.value);
    expect(new Set(sources).size).toBe(sources.length);
    expect(new Set(channels).size).toBe(channels.length);
  });

  it("ne connaît pas les valeurs hors registre", () => {
    expect(channelLabel("google-ads-sea")).toBeUndefined();
    expect(provenanceLabel("sea")).toBeUndefined();
    expect(isPaidChannel("inconnu")).toBe(false);
  });
});
