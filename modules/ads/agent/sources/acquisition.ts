import { channelLabel, provenanceLabel } from "@/core/lib/channels";

/**
 * Ce que le stratège sait des leads et des clients signés (plan Publicité,
 * §9 quater ; décision 5 du 29/09/2026) : des CHIFFRES ANONYMES seulement —
 * canal, effectif, région, délai de signature. Jamais un nom d'entreprise ni de
 * personne, ni SIREN, ni adresse, ni ville.
 *
 * Et même anonyme, un groupe trop petit désigne quelqu'un (« le seul client de
 * Corse, 250 salariés ») : tout groupe de moins de `MIN_GROUP` fiches est fondu
 * dans « autres ».
 *
 * Le métier n'existe sur aucune fiche aujourd'hui : il manque, et c'est dit
 * (voir le plan, chantier NAF).
 */

export const MIN_GROUP = 3;
export const WON_STATUSES = ["actif", "resilie", "archive"];

export type LeadIn = { id: number | string; channel?: string | null; createdAt?: string | null };
export type ClientIn = {
  formSubmission?: number | string | null;
  clientStatus?: string | null;
  source?: string | null;
  collaborateurs?: string | null;
  postcode?: string | null;
  createdAt?: string | null;
  quoteSignedAt?: string | null;
};

export type Bucket = { valeur: string; n: number };
export type AcquisitionSummary = {
  periodeMois: number;
  canaux: { canal: string; leads: number; opportunites: number; gagnees: number; conversionPct: number | null }[];
  signes: { total: number; parCanal: Bucket[]; parEffectif: Bucket[]; parRegion: Bucket[]; delaiMedianJours: number | null };
  manque: string[];
};

/** Le département d'un code postal français (Corse : 2A/2B ; outre-mer : 3 chiffres). */
export function departement(postcode?: string | null): string | null {
  const p = (postcode ?? "").trim();
  if (!/^\d{5}$/.test(p)) return null;
  if (p.startsWith("20")) return Number(p) < 20200 ? "2A" : "2B";
  if (p.startsWith("97") || p.startsWith("98")) return p.slice(0, 3);
  return p.slice(0, 2);
}

const REGIONS: [string, string[]][] = [
  ["Auvergne-Rhône-Alpes", ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"]],
  ["Bourgogne-Franche-Comté", ["21", "25", "39", "58", "70", "71", "89", "90"]],
  ["Bretagne", ["22", "29", "35", "56"]],
  ["Centre-Val de Loire", ["18", "28", "36", "37", "41", "45"]],
  ["Corse", ["2A", "2B"]],
  ["Grand Est", ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"]],
  ["Hauts-de-France", ["02", "59", "60", "62", "80"]],
  ["Île-de-France", ["75", "77", "78", "91", "92", "93", "94", "95"]],
  ["Normandie", ["14", "27", "50", "61", "76"]],
  ["Nouvelle-Aquitaine", ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"]],
  ["Occitanie", ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"]],
  ["Pays de la Loire", ["44", "49", "53", "72", "85"]],
  ["Provence-Alpes-Côte d'Azur", ["04", "05", "06", "13", "83", "84"]],
  ["Outre-mer", ["971", "972", "973", "974", "975", "976", "977", "978", "984", "986", "987", "988"]],
];
const REGION_OF = new Map(REGIONS.flatMap(([name, deps]) => deps.map((d) => [d, name] as const)));

export const regionOf = (postcode?: string | null): string | null => {
  const d = departement(postcode);
  return d ? (REGION_OF.get(d) ?? null) : null;
};

/** Compte par valeur ; les groupes de moins de MIN_GROUP sont fondus dans « autres ». Du plus grand au plus petit. */
export function buckets(values: (string | null | undefined)[]): Bucket[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = v?.trim() || "non renseigné";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const kept: Bucket[] = [];
  let others = 0;
  for (const [valeur, n] of counts) {
    if (n >= MIN_GROUP) kept.push({ valeur, n });
    else others += n;
  }
  kept.sort((a, b) => b.n - a.n || a.valeur.localeCompare(b.valeur));
  return others ? [...kept, { valeur: `autres (groupes de moins de ${MIN_GROUP})`, n: others }] : kept;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Pure : ce que le stratège reçoit, calculé sur les `months` derniers mois. */
export function anonymousSummary(leads: LeadIn[], clients: ClientIn[], months: number, now: Date): AcquisitionSummary {
  const from = now.getTime() - months * 30.44 * 86_400_000;
  const recent = leads.filter((l) => l.createdAt && Date.parse(l.createdAt) >= from);
  const channelOf = new Map(leads.map((l) => [String(l.id), l.channel ?? ""]));

  const byChannel = new Map<string, { leads: number; opportunites: number; gagnees: number }>();
  const row = (k: string) => byChannel.get(k) ?? (byChannel.set(k, { leads: 0, opportunites: 0, gagnees: 0 }), byChannel.get(k)!);
  for (const l of recent) row(l.channel ?? "").leads++;
  const recentIds = new Set(recent.map((l) => String(l.id)));
  for (const c of clients) {
    const sid = c.formSubmission == null ? null : String(c.formSubmission);
    if (!sid || !recentIds.has(sid)) continue;
    const r = row(channelOf.get(sid) ?? "");
    r.opportunites++;
    if (WON_STATUSES.includes(c.clientStatus ?? "")) r.gagnees++;
  }
  const canaux = [...byChannel]
    .map(([k, r]) => ({ canal: channelLabel(k) ?? (k || "canal inconnu"), ...r, conversionPct: r.leads ? Math.round((r.gagnees / r.leads) * 1000) / 10 : null }))
    .sort((a, b) => b.leads - a.leads);

  const won = clients.filter((c) => WON_STATUSES.includes(c.clientStatus ?? ""));
  const delays = won
    .filter((c) => c.createdAt && c.quoteSignedAt)
    .map((c) => Math.round((Date.parse(c.quoteSignedAt!) - Date.parse(c.createdAt!)) / 86_400_000))
    .filter((d) => d >= 0);

  return {
    periodeMois: months,
    canaux,
    signes: {
      total: won.length,
      parCanal: buckets(won.map((c) => provenanceLabel(c.source) ?? c.source)),
      parEffectif: buckets(won.map((c) => c.collaborateurs)),
      parRegion: buckets(won.map((c) => regionOf(c.postcode))),
      delaiMedianJours: median(delays),
    },
    manque: ["le métier des clients (code NAF) : absent des fiches aujourd'hui"],
  };
}
