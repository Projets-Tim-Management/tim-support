import type { Payload } from "payload";

import { loadGenerationContext, weeklyUsed } from "@/modules/ads/lib/copy/generate";
import type { Framing, Rect } from "@/modules/ads/lib/framing";
import { FinalError } from "@/modules/ads/lib/rush-process";
import { requestVideo } from "@/modules/ads/video/render";

/**
 * La vidéo vue par l'agent (plan Publicité, §9 sexies, D4) : la matière qu'il
 * peut monter (rushes prêts, styles actifs) et le montage lui-même.
 *
 * Le directeur artistique écrit UNE partition et la fait rendre dans 1 à 3
 * styles. Le premier style va sur la créa elle-même ; chacun des suivants sur
 * une copie de la créa (mêmes textes, mêmes visuels), étiquetée « test de
 * style » : c'est ainsi qu'on compare deux styles sur le même angle. Une copie
 * compte dans le quota de la semaine, comme toute créa.
 */

export const MAX_STYLES = 3;

type Raw = Record<string, unknown>;
type RushDoc = {
  id: number;
  title?: string | null;
  source?: string | null;
  features?: string[] | null;
  description?: string | null;
  mediaType?: string | null;
  framing?: Framing | null;
  processing?: { status?: string | null } | null;
  working?: { meta?: { width?: number; height?: number; durationSec?: number | null } | null } | null;
  ai?: { status?: string | null; proposal?: string | null; timeline?: unknown } | null;
};

export type RushForAgent = {
  id: number;
  nom: string;
  source: string | null;
  type: string | null;
  fonctionnalites: string[];
  ceQuOnVoit: string;
  /** La description détaillée de l'IA, seulement si Charlie l'a validée ; ses plans repérés avec. */
  descriptionValidee: string | null;
  plans: unknown;
  dureeSec: number | null;
  dimensions: string | null;
  /** Ce que le recadrage permet : la zone utile et la zone à ne jamais couper, en fractions de l'image (0 à 1). */
  recadrage: { zoneUtile: Rect | null; zoneProtegee: Rect | null } | null;
};
export type StyleForAgent = { id: number; nom: string; quandLEmployer: string };

/** Un rush prêt, tel que l'agent le lit. Pure. */
export function rushForAgent(r: RushDoc): RushForAgent {
  const m = r.working?.meta;
  const validated = r.ai?.status === "validee" && r.ai.proposal ? r.ai.proposal : null;
  return {
    id: r.id,
    nom: r.title ?? `Rush ${r.id}`,
    source: r.source ?? null,
    type: r.mediaType ?? null,
    fonctionnalites: r.features ?? [],
    ceQuOnVoit: r.description ?? "",
    descriptionValidee: validated,
    plans: validated ? (r.ai?.timeline ?? null) : null,
    dureeSec: m?.durationSec ?? null,
    dimensions: m?.width && m?.height ? `${m.width}×${m.height}` : null,
    recadrage: r.framing ? { zoneUtile: r.framing.crop ?? null, zoneProtegee: r.framing.protect ?? null } : null,
  };
}

/** Les rushes prêts et les styles actifs : ce qu'un montage peut employer. */
export async function videoMaterial(payload: Payload): Promise<{ rushes: RushForAgent[]; styles: StyleForAgent[] }> {
  const [rushes, styles] = await Promise.all([
    payload.find({ collection: "ad-rushes", where: { "processing.status": { equals: "pret" } }, pagination: false, depth: 0, overrideAccess: true }),
    payload.find({ collection: "ad-styles", where: { active: { equals: true } }, pagination: false, depth: 0, sort: "name", overrideAccess: true }),
  ]);
  return {
    rushes: (rushes.docs as unknown as RushDoc[]).map(rushForAgent),
    styles: (styles.docs as unknown as Raw[]).map((s) => ({ id: Number(s.id), nom: String(s.name ?? ""), quandLEmployer: String(s.intent ?? "") })),
  };
}

/** Les champs d'une créa qu'une copie ne reprend pas : identité, décision, vidéo, style (ceux de la copie sont les siens). */
const NOT_COPIED = new Set(["id", "createdAt", "updatedAt", "status", "refusalReason", "refusalDetail", "decidedBy", "decidedAt", "video", "style", "performance", "tests", "isTest"]);
/** Les lignes de tableau gardent leur identifiant en base : une copie doit en recevoir de nouveaux. */
const withoutRowIds = (v: unknown): unknown =>
  Array.isArray(v) ? v.map((row) => (row && typeof row === "object" ? Object.fromEntries(Object.entries(row as Raw).filter(([k]) => k !== "id").map(([k, x]) => [k, withoutRowIds(x)])) : row)) : v;

/** La copie d'une créa pour un test de style. Pure. */
export function styleCopyOf(creative: Raw, styleName: string): Raw {
  const data: Raw = {};
  for (const [k, v] of Object.entries(creative)) if (!NOT_COPIED.has(k)) data[k] = withoutRowIds(v);
  const tests = (withoutRowIds(creative.tests) as Raw[] | null | undefined) ?? [];
  data.tests = [...tests.filter((t) => t.dimension !== "style"), { dimension: "style", value: styleName }];
  data.status = "brouillon";
  // Les textes et les visuels ne sont pas refaits : leur coût reste sur la créa d'origine.
  if (data.generation && typeof data.generation === "object") data.generation = { ...(data.generation as Raw), costEur: 0 };
  return data;
}

export type MountResult = { creas: { crea: number; style: number; styleNom: string; test: boolean }[]; ecartes: { style: number; raison: string }[] };

/**
 * Monte la vidéo d'une créa dans 1 à 3 styles. Tout est vérifié AVANT d'écrire :
 * les styles (existants, actifs), la partition (par requestVideo, sur la créa
 * d'origine) ; les copies ne se créent qu'ensuite, dans la limite du quota.
 */
export async function mountVideo(payload: Payload, campaign: number | string, creativeId: number | string, input: { styles: (number | string)[]; score: unknown }, now: Date): Promise<MountResult> {
  const ids = [...new Set(input.styles.map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length) throw new FinalError("Choisis au moins un style (voir « lire_rushes »).");
  if (ids.length > MAX_STYLES) throw new FinalError(`${MAX_STYLES} styles au plus par montage.`);
  if (!input.score) throw new FinalError("Écris la partition du montage.");
  const found = await payload.find({ collection: "ad-styles", where: { id: { in: ids } }, pagination: false, depth: 0, overrideAccess: true });
  const styles = new Map((found.docs as unknown as Raw[]).map((s) => [Number(s.id), s]));
  for (const id of ids) {
    const s = styles.get(id);
    if (!s) throw new FinalError(`Style ${id} introuvable.`);
    if (s.active === false) throw new FinalError(`Le style « ${String(s.name)} » est désactivé.`);
  }

  const creative = (await payload.findByID({ collection: "ad-creatives", id: creativeId, depth: 0, overrideAccess: true })) as unknown as Raw;
  // La partition est vérifiée ici, sur la créa d'origine : refusée, rien d'autre ne s'écrit.
  const { score } = await requestVideo(payload, creativeId, { styleId: ids[0], score: input.score });
  const name = (id: number) => String(styles.get(id)!.name ?? "");
  const result: MountResult = { creas: [{ crea: Number(creativeId), style: ids[0], styleNom: name(ids[0]), test: false }], ecartes: [] };

  const rest = ids.slice(1);
  if (!rest.length) return result;
  const ctx = await loadGenerationContext(payload, campaign);
  let room = Math.max(0, ctx.weeklyLimit - (await weeklyUsed(payload, campaign, now)));
  for (const id of rest) {
    if (room <= 0) {
      result.ecartes.push({ style: id, raison: "Quota de créas de la semaine atteint : pas de copie pour ce style." });
      continue;
    }
    const copy = await payload.create({ collection: "ad-creatives", data: styleCopyOf(creative, name(id)) as never, depth: 0, overrideAccess: true });
    room--;
    await requestVideo(payload, copy.id, { styleId: id, score });
    result.creas.push({ crea: Number(copy.id), style: id, styleNom: name(id), test: true });
  }
  return result;
}
