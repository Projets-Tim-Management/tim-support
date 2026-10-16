"use client";

import { useEffect, useState } from "react";

import { paletteOf, type Palette } from "@/modules/ads/lib/style";
import { parseLogoDocument, type LogoParts } from "@/modules/ads/video/logo";

/**
 * Ce que l'atelier des éléments doit connaître pour montrer un élément tel
 * qu'il sera rendu : le Kit de marque (couleurs, logos), le premier style
 * actif, un rush prêt (fond de l'aperçu), un fait sourcé (pour le compteur),
 * les visages et le logo animable. Lu une fois, dans le navigateur.
 */
export type AtelierContext = {
  kit: Record<string, unknown>;
  appearance: Record<string, unknown> | null;
  style: Record<string, unknown>;
  palette: Palette;
  rush: { id: number; url: string; width: number; height: number } | null;
  fact: { id: number; statement: string; source: string } | null;
  faces: string[];
  logo: LogoParts | null;
};

const get = async <T>(url: string): Promise<T | null> => {
  const r = await fetch(url, { credentials: "include" }).catch(() => null);
  return r?.ok ? ((await r.json()) as T) : null;
};

/** Lit tout le contexte (requêtes en parallèle, puis le logo animable). */
async function loadAtelierContext(): Promise<AtelierContext> {
  const [kit, appearance, styles, rushes, facts, faces] = await Promise.all([
    get<Record<string, unknown>>("/payload-api/globals/ads-brand-kit?depth=1"),
    get<Record<string, unknown>>("/payload-api/globals/appearance?depth=0"),
    get<{ docs: Record<string, unknown>[] }>("/payload-api/ad-styles?where[active][equals]=true&sort=name&limit=1&depth=0"),
    get<{ docs: { id: number; working?: { url?: string; meta?: { width?: number; height?: number } } }[] }>("/payload-api/ad-rushes?where[processing.status][equals]=pret&sort=createdAt&limit=1&depth=0"),
    get<{ docs: { id: number; statement?: string; source?: string }[] }>("/payload-api/ad-facts?sort=createdAt&limit=1&depth=0"),
    get<{ docs: { url?: string }[] }>("/payload-api/ad-media?where[kind][equals]=visage&sort=-createdAt&limit=12&depth=0"),
  ]);
  const k = kit ?? {};
  let logo: LogoParts | null = null;
  const media = k.logoAnimated as { url?: string } | null | undefined;
  if (media?.url) {
    const text = await fetch(media.url).then((r) => (r.ok ? r.text() : "")).catch(() => "");
    const parsed = text ? parseLogoDocument(new DOMParser().parseFromString(text, "image/svg+xml")) : null;
    logo = parsed?.ok ? parsed.logo : null;
  }
  const r = rushes?.docs[0];
  const f = facts?.docs[0];
  return {
    kit: k,
    appearance,
    style: styles?.docs[0] ?? {},
    palette: paletteOf(k, appearance),
    rush: r?.working?.url ? { id: r.id, url: r.working.url, width: r.working.meta?.width ?? 1080, height: r.working.meta?.height ?? 1920 } : null,
    fact: f ? { id: f.id, statement: String(f.statement ?? ""), source: String(f.source ?? "") } : null,
    faces: (faces?.docs ?? []).map((m) => m.url ?? "").filter(Boolean),
    logo,
  };
}

/**
 * L'aperçu et l'éditeur de réglages d'une même fiche lisent le même contexte :
 * une seule lecture, partagée. Gardée une minute seulement, pour qu'une fiche
 * rouverte après un changement du Kit de marque ne montre pas l'ancien.
 */
const TTL_MS = 60_000;
let cached: { at: number; promise: Promise<AtelierContext> } | null = null;

function atelierContext(): Promise<AtelierContext> {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const promise = loadAtelierContext();
    const entry = { at: Date.now(), promise };
    cached = entry;
    // Une lecture ratée ne reste pas en mémoire : la suivante réessaie.
    promise.catch(() => {
      if (cached === entry) cached = null;
    });
  }
  return cached.promise;
}

export function useAtelierContext(): AtelierContext | null {
  const [ctx, setCtx] = useState<AtelierContext | null>(null);
  useEffect(() => {
    let live = true;
    atelierContext()
      .then((c) => {
        if (live) setCtx(c);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return ctx;
}
