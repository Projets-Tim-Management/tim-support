import type { Payload } from "payload";

import { overlaps, topicTokens } from "@/modules/editorial/lib/articles/cannibal";

/**
 * LES NOUVELLES FICHES MÉTIER, DÉCIDÉES PAR L'ÉQUIPE (étape 9, 18/11/2026 :
 * 4 par mois, sans relecture). Chaque lundi, Paige choisit UN métier du BTP pas
 * encore couvert (balise <metiers> de son plan), avec son code ROME. Le code
 * vérifie : code ROME bien formé, ni déjà couvert (même code ou métier proche),
 * ni arrêté ; une fiche par semaine, et pas plus de 2 qui attendent leur rédaction.
 */

export const MAX_JOBS_PER_WEEK = 1;
export const MAX_JOBS_WAITING = 2;
const ROME_RE = /^[A-N]\d{4}$/;

export type JobProposal = { title: string; rome: string; why: string };
type Sheet = { id?: unknown; title?: string | null; rome?: string | null; status?: string | null };

const tagOf = (text: string, tag: string) => text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? null;
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** Les métiers proposés dans la réponse de Paige. Pure (testée). */
export function parseJobProposals(text: string): JobProposal[] {
  let raw: unknown;
  try {
    raw = JSON.parse(tagOf(text, "metiers") ?? "[]");
  } catch {
    return [];
  }
  return Array.isArray(raw) ? raw.map((r) => ({ title: clip(r?.metier, 120), rome: clip(r?.codeRome, 10).toUpperCase(), why: clip(r?.pourquoi, 1000) })).filter((p) => p.title) : [];
}

/** Ce qu'on garde des métiers proposés. Pure (testée). */
export function planJobProposals(proposals: JobProposal[], sheets: Sheet[]): { keep: JobProposal[]; skipped: { title: string; motive: string }[] } {
  const keep: JobProposal[] = [];
  const skipped: { title: string; motive: string }[] = [];
  const waiting = sheets.filter((s) => s.status === "a-rediger" || s.status === "redaction").length;
  let room = Math.max(0, Math.min(MAX_JOBS_PER_WEEK, MAX_JOBS_WAITING - waiting));
  for (const p of proposals) {
    if (!ROME_RE.test(p.rome)) {
      skipped.push({ title: p.title, motive: `Code ROME invalide (« ${p.rome} »).` });
      continue;
    }
    const t = topicTokens(p.title, true);
    const same = [...sheets, ...keep].find((s) => (s.rome ?? "").toUpperCase() === p.rome || overlaps(t, topicTokens(String(s.title ?? ""), true)));
    if (same) {
      skipped.push({ title: p.title, motive: (same as Sheet).status === "arretee" ? "Métier déjà arrêté par Charlie." : `Déjà couvert : « ${same.title} ».` });
      continue;
    }
    if (room <= 0) {
      skipped.push({ title: p.title, motive: "Une fiche par semaine au plus (ou 2 déjà en attente de rédaction)." });
      continue;
    }
    room--;
    keep.push(p);
  }
  return { keep, skipped };
}

/** Les fiches existantes, pour le plan de Paige. */
export async function loadJobsForPlan(payload: Payload) {
  const docs = (await payload.find({ collection: "job-sheets" as never, pagination: false, depth: 0, overrideAccess: true, select: { title: true, rome: true, status: true, gscClicks: true, gscPosition: true, scoreSeo: true, scoreGeo: true, scoreCoverage: true, coverageTarget: true } as never })).docs as unknown as Record<string, unknown>[];
  // Note SEO / GEO de conformité aux règles (19/11/2026).
  return docs.map((d) => ({ metier: d.title, codeRome: d.rome, statut: d.status, clicsGoogle: d.gscClicks ?? null, position: d.gscPosition ?? null, noteSeo: d.scoreSeo ?? null, noteGeo: d.scoreGeo ?? null, couvertureConcurrents: d.scoreCoverage ?? null, cibleCouverture: d.coverageTarget ?? null }));
}

export async function applyJobProposals(payload: Payload, proposals: JobProposal[], o: { proposedBy: string; now?: Date }) {
  if (!proposals.length) return { created: 0, skipped: [] as { title: string; motive: string }[] };
  const sheets = (await payload.find({ collection: "job-sheets" as never, pagination: false, depth: 0, overrideAccess: true, select: { title: true, rome: true, status: true } as never })).docs as unknown as Sheet[];
  const { keep, skipped } = planJobProposals(proposals, sheets);
  const at = (o.now ?? new Date()).toISOString();
  for (const p of keep) {
    await payload.create({ collection: "job-sheets" as never, overrideAccess: true, data: { title: p.title, rome: p.rome, why: p.why, status: "a-rediger", proposedBy: o.proposedBy, proposedAt: at } as never });
  }
  return { created: keep.length, skipped };
}
