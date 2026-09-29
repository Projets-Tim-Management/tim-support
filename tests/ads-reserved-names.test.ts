import type { CollectionConfig, Field, GlobalConfig } from "payload";
import { describe, expect, it } from "vitest";

import { AdAccounts } from "@/modules/ads/collections/AdAccounts";
import { AdAiUsage } from "@/modules/ads/collections/AdAiUsage";
import { AdCampaigns } from "@/modules/ads/collections/AdCampaigns";
import { AdCreatives } from "@/modules/ads/collections/AdCreatives";
import { AdFacts } from "@/modules/ads/collections/AdFacts";
import { AdMedia } from "@/modules/ads/collections/AdMedia";
import { AdMetricsDaily } from "@/modules/ads/collections/AdMetricsDaily";
import { AdsBrandKit } from "@/modules/ads/globals/AdsBrandKit";
import { AdsSettings } from "@/modules/ads/globals/AdsSettings";

/**
 * Payload range certains champs dans des tables suffixées `_texts`, `_numbers`,
 * `_rels`, `_locales`. Un champ qui porte l'un de ces noms prend la table d'un
 * autre, et Drizzle ne trouve plus ses relations : toute lecture complète de la
 * collection échoue (« reading 'referencedTable' »). C'est arrivé au tableau de
 * textes des créas, nommé `texts`, le 29/09/2026 — invisible aux tests qui ne
 * lisent pas la base.
 */
const RESERVED = new Set(["texts", "numbers", "rels", "locales"]);

function names(fields: Field[], path = ""): string[] {
  const out: string[] = [];
  for (const f of fields) {
    const name = "name" in f && f.name ? f.name : null;
    if (name) out.push(path + name);
    if ("fields" in f && Array.isArray(f.fields)) out.push(...names(f.fields, name ? `${path}${name}.` : path));
    if ("tabs" in f && Array.isArray(f.tabs)) for (const t of f.tabs) out.push(...names(t.fields, path));
  }
  return out;
}

const ALL: (CollectionConfig | GlobalConfig)[] = [AdAccounts, AdAiUsage, AdCampaigns, AdCreatives, AdFacts, AdMedia, AdMetricsDaily, AdsBrandKit, AdsSettings];

describe("noms de champs réservés par Payload", () => {
  it.each(ALL.map((c) => [c.slug, c] as const))("%s n'en utilise aucun, à aucun niveau", (_slug, c) => {
    const bad = names(c.fields as Field[]).filter((n) => RESERVED.has(n.split(".").pop()!));
    expect(bad).toEqual([]);
  });
});
