import type { Payload } from "payload";


/**
 * LES INDICATEURS DE LA FEUILLE DE ROUTE (14/11/2026) — ce qu'un objectif à
 * 3, 6 ou 12 mois peut viser, et ce que la courbe montre sous les actions.
 *
 * Chacun se lit dans la PHOTO DU LUNDI (une par semaine) : les leads et leurs
 * coûts dans la fiche des canaux (3 mois glissants : avec quelques leads par
 * mois, c'est la seule mesure qui ne saute pas d'une semaine à l'autre), le
 * reste dans `metrics`, ajouté à la photo de la semaine. Les mêmes chiffres
 * pour la courbe, la valeur du jour, l'avant / après des actions et les
 * objectifs : une seule source, lisible semaine après semaine.
 */

export * from "@/modules/ai-team/lib/roadmap-calc";

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Les indicateurs à ajouter à la photo de la semaine (ceux qui ne sont pas dans la fiche des canaux). Chaque source
 * est déjà en cache ou en base ; une source muette donne null. Ne lève pas.
 */
export async function snapshotMetrics(payload: Payload, now: Date): Promise<Record<string, number | null>> {
  const safe = <T>(p: Promise<T>) => p.catch(() => null);
  const ratio = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : null);
  const [gsc, funnel, tech, visibility, authority, social] = await Promise.all([
    safe(import("@/modules/analytics/lib/seo-gsc").then((m) => m.loadGsc(3, now))),
    safe(import("@/modules/ai-team/lib/funnel").then((m) => m.loadFunnel(payload, now))),
    safe(import("@/modules/ai-team/lib/site-health").then((m) => m.latestTech(payload, now))),
    safe(import("@/modules/ai-team/lib/ai-visibility").then((m) => m.visibilityState(payload, now))),
    safe(import("@/modules/ai-team/lib/authority").then((m) => m.latestAuthority(payload, now))),
    safe(import("@/modules/ai-team/lib/social").then((m) => m.latestSocial(payload, now))),
  ]);
  const h = tech?.health ?? null;
  const nets = social?.measure?.networks ?? [];
  const sum = (f: (n: (typeof nets)[number]) => number | null | undefined) => nets.reduce((t, n) => t + (f(n) ?? 0), 0);
  const targets = authority?.findings ?? [];
  return {
    "seo-clics-hors-marque": gsc && gsc.status === "ok" ? gsc.data.brand.nonBrandedClicks : null,
    "seo-conversion": funnel && funnel.totals.sessions ? funnel.totals.leadRate : null,
    "ia-mentions": visibility?.measure.answers ? visibility.measure.overall.mentionPct : null,
    "pages-indexees": h && h.indexed != null && h.inspected ? ratio(h.indexed, h.inspected) : null,
    "autorite-presence": targets.length ? ratio(targets.filter((t) => t.state === "present").length, targets.length) : null,
    "reseaux-interactions": nets.length ? ratio(sum((n) => n.interactions), sum((n) => n.views)) : null,
  };
}

/** Ajoute les indicateurs à la photo de la semaine si elle ne les a pas encore. Rend « ajoutes » s'il l'a fait. */
/** La semaine déjà complétée, dans la mémoire du serveur : le réveil de la minute ne relit pas la photo toute la semaine. */
let doneWeek: string | null = null;

export async function ensureSnapshotMetrics(payload: Payload, now = new Date()): Promise<"ajoutes" | "deja" | "pas-de-photo"> {
  // Import tardif : cette liste est lue par la collection des objectifs (configuration), qui doit rester légère.
  const { parisNow, periodKey } = await import("@/modules/ads/agent/followup");
  const week = periodKey("hebdomadaire", parisNow(now));
  if (doneWeek === week) return "deja";
  const found = await payload.find({ collection: "ai-team-snapshots", where: { week: { equals: week } }, limit: 1, depth: 0, overrideAccess: true, select: { metrics: true } as never });
  const doc = found.docs[0] as unknown as { id: number | string; metrics?: unknown } | undefined;
  if (!doc) return "pas-de-photo";
  // Une photo dont toutes les sources avaient échoué (que des null) se refait.
  if (doc.metrics && typeof doc.metrics === "object" && Object.values(doc.metrics).some((v) => v != null)) {
    doneWeek = week;
    return "deja";
  }
  const metrics = await snapshotMetrics(payload, now);
  await payload.update({ collection: "ai-team-snapshots", id: doc.id, data: { metrics } as never, overrideAccess: true });
  if (Object.values(metrics).some((v) => v != null)) doneWeek = week;
  return "ajoutes";
}

/** Le lundi (« AAAA-MM-JJ ») de la dernière semaine d'un mois : la date d'un point reconstitué. Pure (testée). */
export function monthEndMonday(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0, 12));
  const back = (last.getUTCDay() + 6) % 7;
  return new Date(last.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

/**
 * L'HISTORIQUE RECONSTITUÉ (feuille de route, 14/11/2026) : pour que les courbes aient un passé dès le premier
 * jour, un point par mois sur `months` mois — les clics Google hors marque (Search Console garde 16 mois). Pas la
 * fiche des canaux : relue à une date passée, elle rendait les mêmes leads chaque mois (constaté au premier essai) ;
 * les leads et le MRR des OBJECTIFS ont leur propre passé, calculé dans la base (lib/indicators). Une photo déjà présente n'est pas réécrite. Lectures seules à
 * l'extérieur. Rend le nombre de points ajoutés.
 */
export async function backfillHistory(payload: Payload, months = 12, now = new Date()): Promise<number> {
  const { loadGsc } = await import("@/modules/analytics/lib/seo-gsc");
  let added = 0;
  for (let i = months; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const week = monthEndMonday(d.getUTCFullYear(), d.getUTCMonth());
    const at = new Date(`${week}T12:00:00Z`);
    const have = await payload.count({ collection: "ai-team-snapshots", where: { week: { equals: week } }, overrideAccess: true });
    if (have.totalDocs) continue;
    const gsc = await loadGsc(3, at).catch(() => null);
    await payload.create({
      collection: "ai-team-snapshots",
      data: {
        week,
        reconstituted: true,
        channels: [],
        google: null,
        chatgpt: null,
        tracking: null,
        mastery: null,
        metrics: { "seo-clics-hors-marque": gsc && gsc.status === "ok" ? gsc.data.brand.nonBrandedClicks : null },
      } as never,
      overrideAccess: true,
    });
    added += 1;
  }
  return added;
}
