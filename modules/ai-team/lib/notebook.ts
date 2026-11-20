import type { Payload } from "payload";

import { idOf } from "@/core/lib/relations";
import { memberByKey } from "@/modules/ai-team/lib/shared-data";
import { DAY_MS } from "@/modules/ai-team/lib/format";

/**
 * LE CARNET D'UN CHEF (14/11/2026) — ce qu'il retient d'un échange à l'autre,
 * et qui le fait évoluer comme une vraie personne.
 *
 * Ce que la direction lui dit sont des IDÉES, pas des ordres : il les juge —
 * retenue, à tester, écartée, chiffres à l'appui. Si la direction tranche
 * (« je tranche »), il applique et note son désaccord et ce qu'il surveillera.
 * Ses décisions, ses consignes à l'équipe et ses convictions sont les siennes :
 * il les revoit seul quand les chiffres changent, en écrivant pourquoi. Une
 * idée écartée peut revenir quand les chiffres bougent.
 *
 * Le chef écrit dans son carnet par un bloc <carnet>{…}</carnet> à la fin de sa
 * réponse (conversation, objectifs de Sergey) ou par le champ « carnet » de sa
 * revue structurée ; le serveur vérifie chaque opération avant de l'écrire.
 */

export type NoteKind = "decision" | "consigne" | "conviction" | "suivi" | "idee";
export type IdeaVerdict = "retenue" | "a-tester" | "ecartee" | "imposee";
export type NoteStatus = "active" | "terminee" | "abandonnee";

const KINDS: NoteKind[] = ["decision", "consigne", "conviction", "suivi", "idee"];
const VERDICTS: IdeaVerdict[] = ["retenue", "a-tester", "ecartee", "imposee"];
const STATUSES: NoteStatus[] = ["active", "terminee", "abandonnee"];
const MAX_OPS = 8;
const MAX_TEXT = 500;
const MAX_REASON = 600;
/** Ce que le chef relit de ses notes closes : les 60 derniers jours (une idée écartée peut revenir). */
const CLOSED_DAYS = 60;

export type AddOp = { op: "ajouter"; kind: NoteKind; text: string; reason: string; target?: string; verdict?: IdeaVerdict; disagreement?: string; dueAt?: string };
export type EditOp = { op: "modifier"; id: string; reason: string; text?: string; status?: NoteStatus; verdict?: IdeaVerdict; disagreement?: string; dueAt?: string };
export type NoteOp = AddOp | EditOp;

/** Les règles du carnet, pour la consigne du chef. `team` : les clés et prénoms de son équipe. */
export function carnetRules(team: { key: string; name: string }[]): string {
  const crew = team.map((m) => `« ${m.key} » (${m.name})`).join(", ");
  return [
    "TON CARNET (monCarnet dans les données) : ce que tu retiens d'un échange à l'autre, comme une vraie personne. Relis-le avant de répondre, et tiens-y-toi.",
    "- Ce que la direction te propose est une IDÉE, pas un ordre. Juge-la comme un expert : « retenue » (elle devient ta décision ou une consigne), « a-tester » (dis à quelles conditions, combien de temps, jugée sur quoi), ou « ecartee » — tu as le droit de dire non, poliment et chiffres à l'appui, en disant ce qui te ferait changer d'avis.",
    "- Si la direction insiste clairement (« je tranche », « c'est décidé », « on le fait quand même ») sur une idée que tu avais écartée, tu appliques : verdict « imposee », avec ton désaccord et ce que tu surveilleras pour juger (champ « desaccord »). Tu ne rouvres pas le débat à chaque message ; tu y reviens quand les chiffres te donnent raison ou tort.",
    "- Tes décisions, tes consignes et tes convictions sont les tiennes : revois-les quand les chiffres changent (« modifier » : nouveau texte, ou état « terminee » / « abandonnee »), toujours avec la raison. Une idée écartée peut revenir si les chiffres ont bougé : dis-le à la direction.",
    `- Une consigne s'adresse à un membre de ton équipe (champ « pour », sa clé : ${crew || "aucune"}) : elle sera jointe à chacune de ses missions tant qu'elle est en cours. Elle dit quoi faire ou ne pas faire, et pourquoi, en une ou deux phrases.`,
    "- « suivi » : un point à revérifier, avec une date (« echeance », AAAA-MM-JJ). « conviction » : ce que les chiffres t'ont appris sur TIM. « decision » : ce que tu as décidé dans ton périmètre.",
    "- Note seulement ce qui compte et durera (pas une question de passage) ; pas de doublon : modifie la note existante plutôt que d'en ajouter une autre. Au plus 8 opérations par réponse.",
  ].join("\n");
}

/** Comment écrire dans le carnet depuis une réponse en texte libre. */
export const CARNET_FORMAT = [
  "Pour écrire dans ton carnet, termine ta réponse par un bloc, et seulement si quelque chose est à noter :",
  '<carnet>{"ajouter":[{"sorte":"decision|consigne|conviction|suivi|idee","texte":"…","raison":"…","pour":"clé du membre (consigne)","verdict":"retenue|a-tester|ecartee|imposee (idee)","desaccord":"(imposee)","echeance":"AAAA-MM-JJ (suivi)"}],"modifier":[{"id":"…","raison":"…","texte":"(nouveau texte)","etat":"active|terminee|abandonnee"}]}</carnet>',
  "Les champs sans objet sont omis. La direction ne voit pas ce bloc tel quel : elle voit « Noté : … » sous ta réponse. Ne le mentionne pas dans ton texte.",
].join("\n");

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));

/** Sépare la réponse de son bloc <carnet>. Pure (testée). */
export function splitCarnet(text: string): { text: string; raw: unknown } {
  const m = text.match(/<carnet>([\s\S]*?)<\/carnet>/i);
  const clean = text.replace(/<carnet>[\s\S]*?(<\/carnet>|$)/gi, "").trim();
  if (!m) return { text: clean, raw: null };
  try {
    return { text: clean, raw: JSON.parse(m[1].trim()) };
  } catch {
    return { text: clean, raw: null };
  }
}

/**
 * Les opérations vérifiées : sorte, verdict et état connus, consigne adressée à un membre de SON équipe, note à
 * modifier qui existe dans SON carnet, textes bornés. Le reste est ignoré. Pure (testée).
 */
export function normalizeOps(raw: unknown, ctx: { noteIds: Set<string>; teamKeys: Set<string> }): NoteOp[] {
  const r = (raw && typeof raw === "object" ? raw : {}) as { ajouter?: unknown; modifier?: unknown };
  const ops: NoteOp[] = [];
  for (const a of Array.isArray(r.ajouter) ? r.ajouter : []) {
    const o = (a ?? {}) as Record<string, unknown>;
    const kind = str(o.sorte, 20) as NoteKind;
    const text = str(o.texte, MAX_TEXT);
    if (!KINDS.includes(kind) || !text) continue;
    const add: AddOp = { op: "ajouter", kind, text, reason: str(o.raison, MAX_REASON) };
    if (kind === "consigne") {
      const target = str(o.pour, 60);
      if (!ctx.teamKeys.has(target)) continue;
      add.target = target;
    }
    if (kind === "idee") {
      const verdict = str(o.verdict, 20) as IdeaVerdict;
      if (!VERDICTS.includes(verdict)) continue;
      add.verdict = verdict;
      if (verdict === "imposee") add.disagreement = str(o.desaccord, MAX_REASON) || "Désaccord non précisé.";
    }
    const due = str(o.echeance, 10);
    if (due && isDate(due)) add.dueAt = due;
    ops.push(add);
  }
  for (const e of Array.isArray(r.modifier) ? r.modifier : []) {
    const o = (e ?? {}) as Record<string, unknown>;
    const id = str(String(o.id ?? ""), 40);
    const reason = str(o.raison, MAX_REASON);
    if (!ctx.noteIds.has(id) || !reason) continue;
    const edit: EditOp = { op: "modifier", id, reason };
    const text = str(o.texte, MAX_TEXT);
    if (text) edit.text = text;
    const status = str(o.etat, 20) as NoteStatus;
    if (STATUSES.includes(status)) edit.status = status;
    const verdict = str(o.verdict, 20) as IdeaVerdict;
    if (VERDICTS.includes(verdict)) edit.verdict = verdict;
    const dis = str(o.desaccord, MAX_REASON);
    if (dis) edit.disagreement = dis;
    const due = str(o.echeance, 10);
    if (due && isDate(due)) edit.dueAt = due;
    if (edit.text || edit.status || edit.verdict || edit.disagreement || edit.dueAt) ops.push(edit);
  }
  return ops.slice(0, MAX_OPS);
}

const VERDICT_LINE: Record<IdeaVerdict, string> = { retenue: "✅ Idée retenue", "a-tester": "🧪 Idée à tester", ecartee: "❌ Idée écartée", imposee: "🫡 Idée appliquée à votre demande" };
const KIND_LINE: Record<Exclude<NoteKind, "idee" | "consigne">, string> = { decision: "🏛️ Décision", conviction: "💡 Conviction", suivi: "📌 À suivre" };
const STATUS_LINE: Record<NoteStatus, string> = { active: "✏️ Revu", terminee: "✔️ Terminé", abandonnee: "🗑️ Abandonné" };
const dateFr = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

/** La ligne « Noté : … » affichée sous la réponse. Pure (testée). */
export function notedLine(op: NoteOp, ctx: { nameOf: (key: string) => string; textOf: (id: string) => string }): string {
  if (op.op === "modifier") {
    const what = op.text ?? ctx.textOf(op.id);
    return `${op.status ? STATUS_LINE[op.status] : STATUS_LINE.active} : ${what} — ${op.reason}`;
  }
  if (op.kind === "idee") {
    const v = op.verdict!;
    return `${VERDICT_LINE[v]} : ${op.text}${v === "imposee" ? ` — mon désaccord : ${op.disagreement}` : op.reason ? ` — ${op.reason}` : ""}`;
  }
  if (op.kind === "consigne") return `📣 Consigne à ${ctx.nameOf(op.target!)} : ${op.text}`;
  return `${KIND_LINE[op.kind]}${op.kind === "suivi" && op.dueAt ? ` (le ${dateFr(op.dueAt)})` : ""} : ${op.text}`;
}

type Raw = Record<string, unknown>;
export type NoteRow = { id: string; member: string; kind: NoteKind; text: string; reason: string | null; target: string | null; verdict: IdeaVerdict | null; disagreement: string | null; dueAt: string | null; status: NoteStatus; origin: string | null; createdAt: string; updatedAt: string; history: { at: string; change: string; reason: string | null }[] };

const toRow = (d: Raw): NoteRow => ({
  id: String(d.id),
  member: String(idOf(d.member)),
  kind: d.kind as NoteKind,
  text: String(d.text ?? ""),
  reason: (d.reason as string | null) ?? null,
  target: d.target != null ? String(idOf(d.target)) : null,
  verdict: (d.verdict as IdeaVerdict | null) ?? null,
  disagreement: (d.disagreement as string | null) ?? null,
  dueAt: d.dueAt ? String(d.dueAt).slice(0, 10) : null,
  status: (d.status as NoteStatus) ?? "active",
  origin: (d.origin as string | null) ?? null,
  createdAt: String(d.createdAt ?? ""),
  updatedAt: String(d.updatedAt ?? ""),
  history: Array.isArray(d.history) ? (d.history as Raw[]).map((h) => ({ at: String(h.at ?? ""), change: String(h.change ?? ""), reason: (h.reason as string | null) ?? null })) : [],
});

/** Le carnet d'un chef : ses notes en cours, et celles closes depuis 60 jours. */
export async function loadCarnet(payload: Payload, chiefId: number | string, now: Date): Promise<NoteRow[]> {
  const since = new Date(now.getTime() - CLOSED_DAYS * DAY_MS).toISOString();
  const res = await payload.find({
    collection: "ai-team-notes",
    where: { and: [{ member: { equals: chiefId } }, { or: [{ status: { equals: "active" } }, { updatedAt: { greater_than_equal: since } }] }] },
    sort: "-updatedAt",
    limit: 80,
    depth: 0,
    overrideAccess: true,
  });
  return (res.docs as unknown as Raw[]).map(toRow);
}

/** Les consignes en cours adressées à un membre (sa fiche : « Consignes reçues »). */
export async function consignesOf(payload: Payload, memberId: number | string): Promise<NoteRow[]> {
  const res = await payload.find({ collection: "ai-team-notes", where: { and: [{ target: { equals: memberId } }, { kind: { equals: "consigne" } }, { status: { equals: "active" } }] }, sort: "-createdAt", limit: 20, depth: 0, overrideAccess: true });
  return (res.docs as unknown as Raw[]).map(toRow);
}

/** L'équipe d'un chef : clé, prénom, id. */
export async function teamOf(payload: Payload, chiefId: number | string): Promise<{ id: string; key: string; name: string; jobTitle: string; active: boolean }[]> {
  const res = await payload.find({ collection: "ai-team-members", where: { chief: { equals: chiefId } }, sort: "order", pagination: false, depth: 0, overrideAccess: true, select: { key: true, name: true, jobTitle: true, active: true } as never });
  return (res.docs as unknown as Raw[]).map((m) => ({ id: String(m.id), key: String(m.key), name: String(m.name), jobTitle: String(m.jobTitle ?? ""), active: m.active !== false }));
}

/** Le carnet tel que le chef le relit. Pure (testée). */
export function carnetForModel(notes: NoteRow[], team: { id: string; key: string; name: string }[]) {
  const byId = new Map(team.map((m) => [m.id, m]));
  return notes.map((n) => ({
    id: n.id,
    sorte: n.kind,
    texte: n.text,
    raison: n.reason,
    ...(n.target ? { pour: byId.get(n.target)?.key ?? n.target } : {}),
    ...(n.verdict ? { verdict: n.verdict } : {}),
    ...(n.disagreement ? { desaccord: n.disagreement } : {}),
    ...(n.dueAt ? { echeance: n.dueAt } : {}),
    etat: n.status,
    depuis: n.createdAt.slice(0, 10),
    ...(n.history.length > 1 ? { historique: n.history.slice(-4).map((h) => `${h.at.slice(0, 10)} : ${h.change}${h.reason ? ` (${h.reason})` : ""}`) } : {}),
  }));
}

/**
 * Écrit les opérations vérifiées dans le carnet du chef, et rend les lignes « Noté : … ». Une note modifiée garde
 * son histoire : chaque changement, daté, avec sa raison.
 */
export async function applyCarnet(
  payload: Payload,
  o: { chiefId: number | string; ops: NoteOp[]; notes: NoteRow[]; team: { id: string; key: string; name: string }[]; origin: "conversation" | "revue"; sourceMessage?: number | string | null; now: Date },
): Promise<string[]> {
  const byKey = new Map(o.team.map((m) => [m.key, m]));
  const byNote = new Map(o.notes.map((n) => [n.id, n]));
  const at = o.now.toISOString();
  const lines: string[] = [];
  for (const op of o.ops) {
    const line = notedLine(op, { nameOf: (k) => byKey.get(k)?.name ?? k, textOf: (id) => byNote.get(id)?.text ?? "" });
    try {
      if (op.op === "ajouter") {
        await payload.create({
          collection: "ai-team-notes",
          data: {
            member: o.chiefId,
            kind: op.kind,
            text: op.text,
            reason: op.reason || null,
            target: op.target ? byKey.get(op.target)?.id : null,
            verdict: op.verdict ?? null,
            disagreement: op.disagreement ?? null,
            dueAt: op.dueAt ? `${op.dueAt}T12:00:00.000Z` : null,
            // Une idée écartée est close d'emblée : elle se relit 60 jours, et peut revenir.
            status: op.verdict === "ecartee" ? "terminee" : "active",
            origin: o.origin,
            sourceMessage: o.sourceMessage ?? null,
            history: [{ at, change: line, reason: op.reason || null }],
          } as never,
          overrideAccess: true,
        });
      } else {
        const prev = byNote.get(op.id)!;
        await payload.update({
          collection: "ai-team-notes",
          id: op.id,
          data: {
            ...(op.text ? { text: op.text } : {}),
            ...(op.status ? { status: op.status } : {}),
            ...(op.verdict ? { verdict: op.verdict } : {}),
            ...(op.disagreement ? { disagreement: op.disagreement } : {}),
            ...(op.dueAt ? { dueAt: `${op.dueAt}T12:00:00.000Z` } : {}),
            history: [...prev.history.map((h) => ({ at: h.at, change: h.change, reason: h.reason })), { at, change: line, reason: op.reason }],
          } as never,
          overrideAccess: true,
        });
      }
      lines.push(line);
    } catch (e) {
      payload.logger.warn(`[équipe IA] carnet : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return lines;
}

/** Lit, vérifie et écrit en une fois : ce que les trois points d'entrée (conversation, revues) partagent. */
export async function writeCarnet(
  payload: Payload,
  o: { chiefId: number | string; raw: unknown; origin: "conversation" | "revue"; sourceMessage?: number | string | null; now: Date; notes?: NoteRow[]; team?: { id: string; key: string; name: string }[] },
): Promise<string[]> {
  if (!o.raw) return [];
  const [notes, team] = await Promise.all([o.notes ?? loadCarnet(payload, o.chiefId, o.now), o.team ?? teamOf(payload, o.chiefId)]);
  const ops = normalizeOps(o.raw, { noteIds: new Set(notes.map((n) => n.id)), teamKeys: new Set(team.map((m) => m.key)) });
  if (!ops.length) return [];
  return applyCarnet(payload, { chiefId: o.chiefId, ops, notes, team, origin: o.origin, sourceMessage: o.sourceMessage, now: o.now });
}

/**
 * Les consignes en cours adressées à un membre, telles qu'on les joint à sa mission : « Consigne de Mark
 * (14 novembre) : … — pourquoi ». Vide s'il n'en a pas.
 */
export async function consignesFor(payload: Payload, memberKey: string): Promise<string[]> {
  const member = await memberByKey<Raw>(payload, memberKey).catch(() => undefined);
  if (!member) return [];
  const res = await payload.find({ collection: "ai-team-notes", where: { and: [{ target: { equals: member.id } }, { kind: { equals: "consigne" } }, { status: { equals: "active" } }] }, sort: "createdAt", limit: 12, depth: 1, overrideAccess: true }).catch(() => null);
  return ((res?.docs ?? []) as unknown as Raw[]).map((d) => {
    const chief = (d.member && typeof d.member === "object" ? (d.member as Raw).name : null) ?? "ton chef";
    const when = new Date(String(d.createdAt)).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
    return `Consigne de ${chief} (${when}) : ${String(d.text)}${d.reason ? ` — ${String(d.reason)}` : ""}`;
  });
}

/** Le paragraphe joint à la consigne d'un sous-agent ; vide sans consigne. Pure. */
export function consignesBlock(lines: string[]): string {
  return lines.length ? `\n\nLES CONSIGNES DE TON CHEF, à appliquer dans ce travail (elles priment sur tes habitudes ; si l'une te semble contredite par les chiffres, applique-la quand même et dis-le dans ton rendu) :\n${lines.map((l) => `- ${l}`).join("\n")}` : "";
}
