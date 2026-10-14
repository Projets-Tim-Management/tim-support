import type { Payload } from "payload";

import { loadGenerationContext, weeklyUsed } from "@/modules/ads/lib/copy/generate";
import type { Framing, Rect } from "@/modules/ads/lib/framing";
import { FinalError } from "@/modules/ads/lib/rush-process";
import { isInspiration } from "@/modules/ads/lib/rushes";
import { loadAnimatedLogo } from "@/modules/ads/video/logo-server";
import { renderStyleOf } from "@/modules/ads/video/props";
import { requestVideo } from "@/modules/ads/video/render";

/**
 * La vidéo vue par l'agent (plan Publicité, §9 sexies, D4) : la matière qu'il
 * peut monter (rushes prêts, styles actifs) et le montage lui-même.
 *
 * Le directeur artistique écrit UNE partition et la fait rendre dans 1 à 3
 * styles, ou sur 1 à 3 musiques. La première variante va sur la créa
 * elle-même ; chacune des suivantes sur une copie de la créa (mêmes textes,
 * mêmes visuels), étiquetée « test de style » ou « test de musique » : c'est
 * ainsi qu'on compare sur le même angle. Une copie compte dans le quota de la
 * semaine, comme toute créa.
 */

type Raw = Record<string, unknown>;
type RushDoc = {
  id: number;
  use?: string | null;
  verdict?: string | null;
  why?: string | null;
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
export type StyleForAgent = { id: number; nom: string; quandLEmployer: string; reglages: string };

/**
 * Ce que le moteur fera VRAIMENT de la partition dans ce style, en une ligne :
 * l'ouverture, l'écran, si un zoom demandé sera appliqué, les sous-titres, le
 * rythme. Sans elle, l'agent écrit des zooms ou des sous-titres que le style
 * ignore. Pure.
 */
export function styleSettings(doc: Raw): string {
  const st = renderStyleOf(doc);
  const label: Record<string, string> = {
    "titre-mot-a-mot": "titre qui arrive mot à mot",
    "aplat-probleme": "le problème sur un aplat de couleur",
    "titre-pose": "titre posé",
    maquette: "téléphone en maquette",
    "ecran-seul": "écran seul, plein cadre",
    incline: "téléphone incliné",
    bandeau: "sous-titres en bandeau",
    "mot-a-mot": "sous-titres mot à mot",
    aucun: "aucun sous-titre (la légende d'un plan est ignorée)",
    pose: "rythme posé",
    dynamique: "rythme dynamique",
    rapide: "rythme rapide",
  };
  return [
    `Ouverture : ${label[st.opening]}`,
    `fonds ${st.background}`,
    label[st.phoneFrame],
    st.zoomOnGesture ? "zoom sur le geste appliqué (le « zoom » d'un plan est suivi)" : "PAS de zoom (le « zoom » d'un plan est ignoré)",
    label[st.subtitles],
    label[st.pace],
    `preuve « ${st.proof} »`,
    `titres en ${doc.titleFont === "kit" ? "police du Kit de marque" : st.titleFont}${st.titleUpper ? ", majuscules" : ""}`,
    `logo ${st.logoAnimation === "construction" ? "construit élément par élément" : st.logoAnimation === "fondu" ? "en fondu" : "posé"}`,
  ].join(" ; ");
}
/** Une musique active et analysée : l'agent la choisit d'après « Quand l'employer » et son tempo. */
export type MusicForAgent = { id: number; nom: string; quandLEmployer: string; bpm: number | null; dureeSec: number | null };
/** Une inspiration, telle que l'agent la lit : seulement sa fiche de style validée — jamais ses images. */
export type InspirationForAgent = { id: number; nom: string; verdict: "aimer" | "eviter"; ceQuiPlait: string; ficheDeStyle: string };

/** Une inspiration à fiche validée, ou `null`. Pure. */
export function inspirationForAgent(r: RushDoc): InspirationForAgent | null {
  if (r.ai?.status !== "validee" || !r.ai.proposal) return null;
  return { id: r.id, nom: r.title ?? `Inspiration ${r.id}`, verdict: r.verdict === "eviter" ? "eviter" : "aimer", ceQuiPlait: r.why ?? "", ficheDeStyle: r.ai.proposal };
}

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

/** Les rushes prêts et les styles actifs : ce qu'un montage peut employer ; les inspirations validées : ce qui guide le goût. */
export type VideoMaterial = { rushes: RushForAgent[]; styles: StyleForAgent[]; inspirations: InspirationForAgent[]; musiques: MusicForAgent[]; logo: string };

export async function videoMaterial(payload: Payload): Promise<VideoMaterial> {
  const [rushes, styles, musics, inspirations, kit] = await Promise.all([
    payload.find({ collection: "ad-rushes", where: { "processing.status": { equals: "pret" } }, pagination: false, depth: 0, overrideAccess: true }),
    payload.find({ collection: "ad-styles", where: { active: { equals: true } }, pagination: false, depth: 0, sort: "name", overrideAccess: true }),
    payload.find({
      collection: "ad-media",
      where: { and: [{ kind: { equals: "musique" } }, { active: { not_equals: false } }, { "beat.status": { equals: "pret" } }] },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({ collection: "ad-inspirations", where: { "ai.status": { equals: "validee" } }, pagination: false, depth: 0, sort: "-createdAt", overrideAccess: true }),
    payload.findGlobal({ slug: "ads-brand-kit", depth: 1, overrideAccess: true }) as unknown as Promise<Raw>,
  ]);
  const animated = await loadAnimatedLogo(kit.logoAnimated);
  const docs = rushes.docs as unknown as RushDoc[];
  return {
    // Une ancienne fiche de rush marquée « inspiration » (avant la collection à part) n'est jamais de la matière.
    rushes: docs.filter((r) => !isInspiration(r)).map(rushForAgent),
    logo: animated
      ? `Logo animable : symbole en ${animated.symbol.length} élément(s), nom en ${animated.name.length} lettre(s)${animated.baseline ? ", signature" : ""}. Un plan « logo » le fait arriver selon le style.`
      : "Pas de logo animable : un plan « logo » pose l'image du logo, en fondu.",
    inspirations: (inspirations.docs as unknown as RushDoc[]).map(inspirationForAgent).filter((i): i is InspirationForAgent => i !== null),
    styles: (styles.docs as unknown as Raw[]).map((s) => ({ id: Number(s.id), nom: String(s.name ?? ""), quandLEmployer: String(s.intent ?? ""), reglages: styleSettings(s) })),
    musiques: (musics.docs as unknown as Raw[]).map((m) => {
      const beat = (m.beat ?? {}) as { bpm?: number | null; durationSec?: number | null };
      return { id: Number(m.id), nom: musicName(m), quandLEmployer: String(m.whenToUse ?? ""), bpm: beat.bpm ?? null, dureeSec: beat.durationSec ?? null };
    }),
  };
}

/** Les champs d'une créa qu'une copie ne reprend pas : identité, décision, vidéo, style (ceux de la copie sont les siens). */
const NOT_COPIED = new Set(["id", "createdAt", "updatedAt", "status", "refusalReason", "refusalDetail", "decidedBy", "decidedAt", "video", "style", "performance", "tests", "isTest"]);
/** Les lignes de tableau gardent leur identifiant en base : une copie doit en recevoir de nouveaux. */
const withoutRowIds = (v: unknown): unknown =>
  Array.isArray(v) ? v.map((row) => (row && typeof row === "object" ? Object.fromEntries(Object.entries(row as Raw).filter(([k]) => k !== "id").map(([k, x]) => [k, withoutRowIds(x)])) : row)) : v;

/** La copie d'une créa pour un test (de style, de musique) : une seule dimension testée à la fois. Pure. */
export function variantCopyOf(creative: Raw, dimension: "style" | "musique", value: string): Raw {
  const data: Raw = {};
  for (const [k, v] of Object.entries(creative)) if (!NOT_COPIED.has(k)) data[k] = withoutRowIds(v);
  const tests = (withoutRowIds(creative.tests) as Raw[] | null | undefined) ?? [];
  data.tests = [...tests.filter((t) => t.dimension !== "style" && t.dimension !== "musique"), { dimension, value }];
  data.status = "brouillon";
  // Les textes et les visuels ne sont pas refaits : leur coût reste sur la créa d'origine.
  if (data.generation && typeof data.generation === "object") data.generation = { ...(data.generation as Raw), costEur: 0 };
  return data;
}

/** Au plus trois vidéos par montage, copies de test comprises. */
export const MAX_VARIANTS = 3;

export type MountResult = {
  creas: { crea: number; style: number; styleNom: string; musique: number | null; musiqueNom: string | null; test: boolean }[];
  ecartes: { variante: string; raison: string }[];
};

const ids = (list: unknown[] | undefined): number[] => [...new Set((list ?? []).map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0))];

/**
 * Monte la vidéo d'une créa : dans 1 à 3 styles, OU sur 1 à 3 musiques — un
 * test ne compare qu'une chose à la fois. Tout est vérifié AVANT d'écrire : les
 * styles et les musiques (existants, actifs), la partition (par requestVideo,
 * sur la créa d'origine) ; les copies ne se créent qu'ensuite, dans la limite
 * du quota. Sans musique précisée, c'est celle du Kit de marque.
 */
export async function mountVideo(
  payload: Payload,
  campaign: number | string,
  creativeId: number | string,
  input: { styles: (number | string)[]; musics?: (number | string)[]; score: unknown },
  now: Date,
): Promise<MountResult> {
  const styleIds = ids(input.styles);
  const musicIds = input.musics === undefined ? null : ids(input.musics);
  if (!styleIds.length) throw new FinalError("Choisis au moins un style (voir « lire_rushes »).");
  if (styleIds.length > 1 && musicIds && musicIds.length > 1) {
    throw new FinalError("Un test ne compare qu'une chose à la fois : plusieurs styles sur une musique, ou un style sur plusieurs musiques.");
  }
  const count = Math.max(styleIds.length, musicIds?.length || 1);
  if (count > MAX_VARIANTS) throw new FinalError(`${MAX_VARIANTS} vidéos au plus par montage, tests compris.`);
  if (!input.score) throw new FinalError("Écris la partition du montage.");

  const found = await payload.find({ collection: "ad-styles", where: { id: { in: styleIds } }, pagination: false, depth: 0, overrideAccess: true });
  const styles = new Map((found.docs as unknown as Raw[]).map((s) => [Number(s.id), s]));
  for (const id of styleIds) {
    const st = styles.get(id);
    if (!st) throw new FinalError(`Style ${id} introuvable.`);
    if (st.active === false) throw new FinalError(`Le style « ${String(st.name)} » est désactivé.`);
  }
  const musics = new Map<number, Raw>();
  if (musicIds?.length) {
    const m = await payload.find({ collection: "ad-media", where: { id: { in: musicIds } }, pagination: false, depth: 0, overrideAccess: true });
    for (const d of m.docs as unknown as Raw[]) musics.set(Number(d.id), d);
    for (const id of musicIds) {
      const mu = musics.get(id);
      if (!mu || mu.kind !== "musique") throw new FinalError(`Musique ${id} introuvable.`);
      if (mu.active === false) throw new FinalError(`La musique « ${musicName(mu)} » est désactivée.`);
    }
  }

  const variants = Array.from({ length: count }, (_, i) => ({
    style: styleIds[Math.min(i, styleIds.length - 1)],
    music: musicIds?.length ? musicIds[Math.min(i, musicIds.length - 1)] : undefined,
  }));
  const dimension: "style" | "musique" = styleIds.length > 1 ? "style" : "musique";
  const styleName = (id: number) => String(styles.get(id)!.name ?? "");
  const nameOf = (v: (typeof variants)[number]) => (dimension === "style" ? styleName(v.style) : v.music ? musicName(musics.get(v.music)!) : "musique du kit");

  const creative = (await payload.findByID({ collection: "ad-creatives", id: creativeId, depth: 0, overrideAccess: true })) as unknown as Raw;
  // La partition est vérifiée ici, sur la créa d'origine : refusée, rien d'autre ne s'écrit.
  const first = await requestVideo(payload, creativeId, { styleId: variants[0].style, score: input.score, music: variants[0].music });
  const entry = (crea: number, v: (typeof variants)[number], music: number | null, test: boolean) => ({
    crea,
    style: v.style,
    styleNom: styleName(v.style),
    musique: music,
    musiqueNom: music ? musicName(musics.get(music) ?? { id: music }) : null,
    test,
  });
  const result: MountResult = { creas: [entry(Number(creativeId), variants[0], first.music, false)], ecartes: [] };

  const rest = variants.slice(1);
  if (!rest.length) return result;
  const ctx = await loadGenerationContext(payload, campaign);
  let room = Math.max(0, ctx.weeklyLimit - (await weeklyUsed(payload, campaign, now)));
  for (const v of rest) {
    if (room <= 0) {
      result.ecartes.push({ variante: nameOf(v), raison: "Quota de créas de la semaine atteint : pas de copie pour cette variante." });
      continue;
    }
    const copy = await payload.create({ collection: "ad-creatives", data: variantCopyOf(creative, dimension, nameOf(v)) as never, depth: 0, overrideAccess: true });
    room--;
    const r = await requestVideo(payload, copy.id, { styleId: v.style, score: first.score, music: v.music });
    result.creas.push(entry(Number(copy.id), v, r.music, true));
  }
  return result;
}

/** Le nom d'une musique : sa description, sinon son fichier sans extension. */
export const musicName = (m: Raw): string => String(m.alt || String(m.filename ?? `Musique ${String(m.id)}`).replace(/\.[a-z0-9]+$/i, ""));
