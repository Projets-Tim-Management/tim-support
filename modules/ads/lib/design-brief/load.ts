import type { Payload } from "payload";

import type { DesignKit, DesignRush } from "@/modules/ads/lib/design-brief/prompt";
import { fontFamily, paletteOf } from "@/modules/ads/lib/style";

/**
 * Ce que le brief Claude Design lit en base : le kit de marque résolu (couleurs
 * avec repli sur Système › Apparence, noms des polices, fichiers de logo) et
 * les rushes que l'agent peut désigner.
 */

type Media = { filename?: string | null } | number | string | null | undefined;
type RawKit = Record<string, unknown> & {
  titleFont?: string | null;
  bodyFont?: string | null;
  titleCase?: string | null;
  fonts?: { role?: string | null; file?: Media }[] | null;
  logoOnLight?: Media;
  logoOnDark?: Media;
  logoSymbol?: Media;
  endCard?: { url?: string | null } | null;
  voice?: string | null;
  forbidden?: { term?: string | null }[] | null;
};

const fileName = (m: Media): string | null => (m && typeof m === "object" && m.filename ? m.filename : null);

export async function loadDesignKit(payload: Payload): Promise<DesignKit> {
  const [kit, appearance] = await Promise.all([
    payload.findGlobal({ slug: "ads-brand-kit", depth: 1, overrideAccess: true }) as unknown as Promise<RawKit>,
    payload.findGlobal({ slug: "appearance", depth: 0, overrideAccess: true }).catch(() => null) as unknown as Promise<Record<string, unknown> | null>,
  ]);
  // Une police déposée passe avant celle de la liste : c'est son fichier qu'on joint.
  const dropped = (role: string) => fileName((kit.fonts ?? []).find((f) => f.role === role)?.file);
  return {
    palette: paletteOf(kit as never, appearance),
    titleFont: dropped("titre") ?? fontFamily(kit.titleFont ?? "montserrat"),
    bodyFont: dropped("texte") ?? fontFamily(kit.bodyFont ?? "inter"),
    titleCase: kit.titleCase ?? null,
    logos: [kit.logoOnLight, kit.logoOnDark, kit.logoSymbol].map(fileName).filter((n): n is string => Boolean(n)),
    endUrl: kit.endCard?.url ?? null,
    voice: kit.voice ?? null,
    forbidden: (kit.forbidden ?? []).map((f) => f.term ?? "").filter(Boolean),
  };
}

export type RushForAgent = DesignRush & { source: string | null; features: string[] };

/** Les rushes que l'agent peut joindre à un brief : nom, source, fonctionnalités, ce qu'on y voit. */
export async function loadRushes(payload: Payload, ids?: (number | string)[]): Promise<RushForAgent[]> {
  const r = await payload.find({
    collection: "ad-rushes",
    ...(ids ? { where: { id: { in: ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) } } } : {}),
    pagination: false,
    depth: 0,
    overrideAccess: true,
    sort: "-createdAt",
  });
  return (r.docs as unknown as { id: number; title: string; source?: string | null; features?: string[] | null; description?: string | null; mediaType?: string | null; original?: { filename?: string | null } | null }[]).map((d) => ({
    id: d.id,
    title: d.title,
    filename: d.original?.filename ?? null,
    description: d.description ?? null,
    mediaType: d.mediaType ?? null,
    source: d.source ?? null,
    features: d.features ?? [],
  }));
}
