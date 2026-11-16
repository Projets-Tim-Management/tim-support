import type { Payload } from "payload";

import { PROVENANCE_OPTIONS } from "@/core/lib/channels";
import { locationMeta } from "@/modules/booking/lib/constants";
import { HEARD_FROM } from "@/modules/booking/lib/heard-from";

/**
 * CE QUE LES AGENTS LISENT DES RENDEZ-VOUS ET DE « COMMENT NOUS AVEZ-VOUS CONNUS ? » (16/11/2026 : « tout ce qu'on fait
 * sur le support ou la vitrine doit être analysé par les agents concernés »). Un bloc, calculé une fois, joint à
 * l'entonnoir d'Ana (que lisent Serge, Paige, Cléo, l'audit et les veilles), au point d'Élise, au pipeline de Nathan,
 * à la revue de Margaux et à la conversion de Lou :
 *  - les rendez-vous pris en ligne : combien, visio (démo) ou téléphone (découverte), annulés, déplacés, venus, absents,
 *    avec problème ; la part des demandes du formulaire qui réservent ; le délai entre la demande et le rendez-vous ;
 *  - les sources DÉCLARÉES par les prospects, et leur croisement avec la source calculée (UTM, clics) — ce que les
 *    traces ne voient pas : le bouche-à-oreille, l'IA qui a cité TIM avant qu'on tape l'adresse.
 */

type Raw = Record<string, unknown>;
const DAY = 86_400_000;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
const idOf = (v: unknown) => (v == null ? null : typeof v === "object" ? String((v as Raw).id ?? "") || null : String(v));
const label = (v: unknown) => HEARD_FROM.find((h) => h.value === v)?.label ?? String(v);
const provenance = (v: unknown) => PROVENANCE_OPTIONS.find((p) => p.value === v)?.label ?? (v ? String(v) : "inconnue");

export type BookingInsights = ReturnType<typeof buildInsights>;

/** Le bloc, à partir des lignes lues. Pur (testé). */
export function buildInsights(input: { bookings: Raw[]; submissions: Raw[]; clients: Raw[]; now: Date; days: number }) {
  const { bookings, submissions, clients, now, days } = input;
  const count = (f: (b: Raw) => boolean) => bookings.filter(f).length;
  const booked = new Set(bookings.map((b) => idOf(b.submission)).filter(Boolean) as string[]);
  const delays = bookings
    .filter((b) => b.submission && typeof b.submission === "object" && (b.submission as Raw).createdAt)
    .map((b) => (Date.parse(String(b.start)) - Date.parse(String((b.submission as Raw).createdAt))) / DAY)
    .filter((d) => Number.isFinite(d) && d >= 0);
  const byType = new Map<string, number>();
  for (const b of bookings) {
    const name = b.type && typeof b.type === "object" ? String((b.type as Raw).name ?? "?") : "?";
    byType.set(name, (byType.get(name) ?? 0) + 1);
  }
  const declared = clients.filter((c) => c.heardFrom);
  const bySource = new Map<string, number>();
  const cross = new Map<string, number>();
  for (const c of declared) {
    bySource.set(String(c.heardFrom), (bySource.get(String(c.heardFrom)) ?? 0) + 1);
    const k = `${label(c.heardFrom)} ← calculé : ${provenance(c.source)}`;
    cross.set(k, (cross.get(k) ?? 0) + 1);
  }
  const future = bookings.filter((b) => b.status === "confirme" && Date.parse(String(b.start)) > now.getTime()).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return {
    periode: `${days} derniers jours (et à venir)`,
    rendezVous: {
      pris: bookings.length,
      demoEnVisio: count((b) => b.locationKind === "meet"),
      decouverteParTelephone: count((b) => b.locationKind === "telephone"),
      aVenir: future.length,
      annules: count((b) => b.status === "annule"),
      deplacesAuMoinsUneFois: count((b) => Number(b.rescheduledCount ?? 0) > 0),
      venus: count((b) => b.status === "venu"),
      pasVenus: count((b) => b.status === "absent"),
      avecUnProblemeATraiter: count((b) => b.hasProblem === true),
      parType: [...byType.entries()].map(([type, nombre]) => ({ type, nombre })),
    },
    demandesDuFormulaireQuiReservent: { demandes: submissions.length, avecRendezVous: submissions.filter((s) => booked.has(String(s.id))).length, tauxPct: pct(submissions.filter((s) => booked.has(String(s.id))).length, submissions.length) },
    delaiDemandeRendezVousJours: delays.length ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : null,
    prochainsRendezVous: future.slice(0, 10).map((b) => ({ le: String(b.start).slice(0, 16), formule: locationMeta(String(b.locationKind ?? "meet")).task, societe: b.company })),
    sourcesDeclarees: {
      question: "Comment nous avez-vous connus ? (un clic, après la réservation ou dans l'accusé de réception)",
      reponses: declared.length,
      repartition: [...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ source: label(v), nombre: n, pct: pct(n, declared.length) })),
      croisementAvecLaSourceCalculee: [...cross.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => ({ declareEtCalcule: k, nombre: n })),
    },
  };
}

/** Le bloc des rendez-vous et des sources déclarées, sur `days` jours ; null si rien n'est lisible. */
export async function loadBookingInsights(payload: Payload, now = new Date(), days = 90): Promise<BookingInsights | null> {
  const since = new Date(now.getTime() - days * DAY).toISOString();
  const common = { pagination: false, overrideAccess: true } as const;
  const [bookings, submissions, clients] = await Promise.all([
    payload
      .find({ collection: "bookings" as never, where: { or: [{ createdAt: { greater_than_equal: since } }, { start: { greater_than_equal: now.toISOString() } }] }, depth: 1, ...common, select: { start: true, status: true, locationKind: true, rescheduledCount: true, hasProblem: true, company: true, submission: true, type: true } as never })
      .then((r) => r.docs as unknown as Raw[]),
    payload.find({ collection: "form-submissions", where: { createdAt: { greater_than_equal: since } }, depth: 0, ...common, select: { createdAt: true } as never }).then((r) => r.docs as unknown as Raw[]),
    payload.find({ collection: "partner-clients", where: { and: [{ heardFrom: { exists: true } }, { updatedAt: { greater_than_equal: since } }] }, depth: 0, ...common, select: { heardFrom: true, source: true } as never }).then((r) => r.docs as unknown as Raw[]),
  ]).catch(() => [null, null, null] as const);
  if (!bookings || !submissions || !clients) return null;
  return buildInsights({ bookings, submissions, clients, now, days });
}
