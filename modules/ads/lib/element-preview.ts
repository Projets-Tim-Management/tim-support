import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";
import { FinalError, storeOnBlob, type Store } from "@/modules/ads/lib/rush-process";
import { isElementType } from "@/modules/ads/video/elements";
import { loadAnimatedLogo } from "@/modules/ads/video/logo-server";
import { buildRenderProps, type RenderProps } from "@/modules/ads/video/props";
import { facesOf, renderInSandbox, type RenderOne } from "@/modules/ads/video/render";
import { previewScore } from "@/modules/ads/video/preview-score";

/**
 * L'aperçu d'un élément de l'atelier (plan Publicité) : une courte vidéo 9:16
 * — l'élément, avec ses réglages, sur le fond du premier style actif, puis sur
 * un rush flouté et voilé — rendue dans la Sandbox comme les vidéos des créas.
 * Refait après chaque changement de réglages (l'élément repasse « en attente »).
 */

export const LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;

type Raw = Record<string, unknown>;

/** Prend l'aperçu à rendre le plus RÉCENT : celui qu'on vient de changer passe avant ceux qui attendent depuis longtemps. Atomique. */
export async function claimNextPreview(payload: Payload, now: Date): Promise<{ id: number; attempts: number } | null> {
  const until = new Date(now.getTime() + LEASE_MS).toISOString();
  const rows = rowsOf(
    await execSql(
      payload,
      sql`UPDATE "ad_elements" SET "preview_status" = 'en-cours', "preview_lease_until" = ${until}::timestamptz, "preview_attempts" = COALESCE("preview_attempts", 0) + 1
          WHERE "id" = (
            SELECT "id" FROM "ad_elements"
            WHERE "preview_status" = 'en-attente' OR ("preview_status" = 'en-cours' AND ("preview_lease_until" IS NULL OR "preview_lease_until" < ${now.toISOString()}::timestamptz))
            ORDER BY "updated_at" DESC LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING "id", "preview_attempts"`,
    ),
  ) as Raw[];
  const r = rows[0];
  return r ? { id: Number(r.id), attempts: Number(r.preview_attempts ?? 1) } : null;
}

export type PreviewDeps = { now?: () => Date; render?: RenderOne; store?: Store };

/** Rend le prochain aperçu en attente. Ne lève pas : l'échec s'écrit sur l'élément. */
export async function processNextPreview(payload: Payload, deps: PreviewDeps = {}): Promise<{ id: number; outcome: "pret" | "reessai" | "echec"; error?: string } | null> {
  const now = deps.now ?? (() => new Date());
  const claimed = await claimNextPreview(payload, now());
  if (!claimed) return null;
  const write = (preview: Raw) => payload.update({ collection: "ad-elements", id: claimed.id, data: { preview } as never, depth: 0, overrideAccess: true, context: { previewOnly: true } });
  try {
    const el = (await payload.findByID({ collection: "ad-elements", id: claimed.id, depth: 0, overrideAccess: true })) as unknown as { id: number; base: string; params?: Raw | null };
    if (!isElementType(el.base)) throw new FinalError(`Élément de base « ${el.base} » inconnu.`);
    const [styles, kit, appearance, rushes, facts] = await Promise.all([
      payload.find({ collection: "ad-styles", where: { active: { equals: true } }, sort: "name", limit: 1, depth: 0, overrideAccess: true }),
      payload.findGlobal({ slug: "ads-brand-kit", depth: 1, overrideAccess: true }) as unknown as Promise<Raw>,
      payload.findGlobal({ slug: "appearance", depth: 0, overrideAccess: true }).catch(() => null) as unknown as Promise<Raw | null>,
      payload.find({ collection: "ad-rushes", where: { "processing.status": { equals: "pret" } }, sort: "createdAt", limit: 1, depth: 0, overrideAccess: true }),
      payload.find({ collection: "ad-facts", sort: "createdAt", limit: 1, depth: 0, overrideAccess: true }).catch(() => ({ docs: [] })),
    ]);
    const style = (styles.docs[0] as unknown as Raw) ?? {};
    const rush = rushes.docs[0] as unknown as { id: number; working?: { url?: string; meta?: { width?: number; height?: number } } } | undefined;
    const fact = facts.docs[0] as unknown as { id: number; statement?: string; source?: string } | undefined;
    const score = previewScore(el.base, el.id, rush?.working?.url ? rush.id : null, fact ? Number(fact.id) : null);
    const props: RenderProps = buildRenderProps(score, {
      format: "9x16",
      style,
      kit,
      appearance,
      cta: "En savoir plus",
      rushes: rush?.working?.url ? new Map([[rush.id, { url: rush.working.url, width: rush.working.meta?.width ?? 1080, height: rush.working.meta?.height ?? 1920, framing: null }]]) : new Map(),
      facts: fact ? new Map([[Number(fact.id), { statement: String(fact.statement ?? ""), source: String(fact.source ?? "") }]]) : new Map(),
      logoAnimated: await loadAnimatedLogo(kit.logoAnimated),
      variants: new Map([[el.id, { type: el.base, params: el.params ?? {} }]]),
      faces: await facesOf(payload),
    });
    const [file] = await (deps.render ?? renderInSandbox)([props]);
    const url = await (deps.store ?? storeOnBlob)(`ads/elements/${el.id}/apercu.mp4`, file.data, "video/mp4");
    await write({ status: "pret", videoUrl: url, error: null, attempts: claimed.attempts, leaseUntil: null });
    return { id: claimed.id, outcome: "pret" };
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    const final = e instanceof FinalError || claimed.attempts >= MAX_ATTEMPTS;
    await write({ status: final ? "echec" : "en-attente", error: message, attempts: claimed.attempts, leaseUntil: null }).catch((err) =>
      payload.logger.error(`[publicité] aperçu de l'élément ${claimed.id} : état d'échec non écrit (${(err as Error).message})`),
    );
    return { id: claimed.id, outcome: final ? "echec" : "reessai", error: message };
  }
}
