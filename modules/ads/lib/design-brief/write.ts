import type { Payload } from "payload";

import { checkForbidden, checkTestimonial } from "@/modules/ads/lib/copy/guardrails";
import { ctaLabel } from "@/modules/ads/lib/cta";
import { loadDesignKit, loadRushes } from "@/modules/ads/lib/design-brief/load";
import { buildDesignPrompt, expectedFileNames, type DesignIntent } from "@/modules/ads/lib/design-brief/prompt";
import { FORMAT_KEYS, VIDEO_SECONDS, type FormatKey } from "@/modules/ads/lib/meta-specs";

/**
 * Écrire le brief Claude Design d'une créa (outil ecrire_brief_design de
 * l'agent). Les règles décident ICI, pas dans le prompt de l'agent : une
 * intention incomplète, un rush inconnu, un mot interdit ou un faux
 * témoignage refusent le brief, avec la raison.
 */

export class BriefError extends Error {}

const KINDS = ["video", "image", "les-deux"] as const;
const WRITABLE = ["brouillon", "a-valider"];

/** L'intention de l'agent, vérifiée ; lève `BriefError` avec la raison. Pure. */
export function checkIntent(raw: Partial<DesignIntent> & { rushes?: unknown }, forbidden: string[]): DesignIntent & { rushes: number[] } {
  const kind = KINDS.find((k) => k === raw.kind);
  if (!kind) throw new BriefError("Nature attendue : video, image ou les-deux.");
  const formats = [...new Set((raw.formats ?? []).filter((f): f is FormatKey => (FORMAT_KEYS as string[]).includes(f)))];
  if (!formats.length) throw new BriefError("Au moins un format : 1x1, 4x5 ou 9x16.");
  const durationSec = kind === "image" ? null : Number(raw.durationSec ?? VIDEO_SECONDS.target[1]);
  if (durationSec != null && !(durationSec >= 6 && durationSec <= VIDEO_SECONDS.max)) throw new BriefError(`Durée d'une vidéo : entre 6 et ${VIDEO_SECONDS.max} s (la Base V1 vise 15 à 20 s).`);
  const rationale = String(raw.rationale ?? "").trim();
  const scenario = String(raw.scenario ?? "").trim();
  if (rationale.length < 30) throw new BriefError("Dites pourquoi cette pub, face à ce que font les concurrents (quelques phrases).");
  if (scenario.length < 80) throw new BriefError("La direction créative est trop courte : décrivez chaque temps (vidéo) ou la composition (visuel fixe).");
  if (scenario.length > 6000 || rationale.length > 1500) throw new BriefError("Brief trop long : allez à l'essentiel.");
  for (const text of [rationale, scenario]) {
    const reason = checkForbidden(text, forbidden) ?? checkTestimonial(text);
    if (reason) throw new BriefError(reason);
  }
  const rushes = [...new Set((Array.isArray(raw.rushes) ? raw.rushes : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  return { kind, formats, durationSec, rationale, scenario, rushes };
}

type RawCreative = {
  id: number;
  angle: string;
  status?: string | null;
  hook?: string | null;
  cta?: string | null;
  campaign?: number | { id: number } | null;
  copy?: { kind: string; text: string; status: string }[] | null;
  files?: unknown[] | null;
};

export async function writeDesignBrief(
  payload: Payload,
  campaign: number | string,
  creativeId: number | string,
  raw: Partial<DesignIntent> & { rushes?: unknown },
  now = new Date(),
): Promise<{ prompt: string; files: string[] }> {
  const c = (await payload.findByID({ collection: "ad-creatives", id: creativeId, depth: 0, overrideAccess: true }).catch(() => null)) as RawCreative | null;
  const campaignOf = c && (typeof c.campaign === "object" && c.campaign ? c.campaign.id : c.campaign);
  if (!c || String(campaignOf) !== String(campaign)) throw new BriefError("Créa introuvable dans cette campagne.");
  if (!WRITABLE.includes(c.status ?? "")) throw new BriefError(`Créa « ${c.status} » : son brief ne se réécrit plus.`);
  if ((c.files ?? []).length) throw new BriefError("Des fichiers sont déjà importés pour cette créa : son brief ne change plus.");

  const kit = await loadDesignKit(payload);
  const intent = checkIntent(raw, kit.forbidden);
  const rushes = intent.rushes.length ? await loadRushes(payload, intent.rushes) : [];
  const unknown = intent.rushes.filter((id) => !rushes.some((r) => Number(r.id) === id));
  if (unknown.length) throw new BriefError(`Rush inconnu : ${unknown.join(", ")}. Lisez d'abord les rushes (lire_rushes).`);

  const texts = (c.copy ?? []).filter((t) => t.status === "ok").map((t) => ({ kind: t.kind, text: t.text }));
  const prompt = buildDesignPrompt({ id: c.id, angle: c.angle, hook: c.hook, cta: c.cta ? ctaLabel(c.cta) : null, texts }, intent, kit, rushes);
  await payload.update({
    collection: "ad-creatives",
    id: c.id,
    data: {
      brief: {
        kind: intent.kind,
        formats: intent.formats,
        durationSec: intent.durationSec,
        rationale: intent.rationale,
        prompt,
        rushes: intent.rushes,
        writtenAt: now.toISOString(),
      },
    } as never,
    overrideAccess: true,
  });
  return { prompt, files: expectedFileNames(c.id, intent) };
}
