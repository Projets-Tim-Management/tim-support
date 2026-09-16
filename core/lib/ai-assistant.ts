import { readFileSync } from "node:fs";
import { join } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import type { Payload, Where } from "payload";

import { buildAssistant } from "@/admin/assistant/data-assistant";
import { hasAdminRole, isPartnerMetier, isSupport, partnerIdOf } from "@/core/access";
import { CLOSED_STATUSES } from "@/modules/marketing/lib/due-emails";
import { isStepDone } from "@/modules/marketing/lib/journey";
import { buildBillingReport, type ClientCheck } from "@/modules/partner/lib/billing-check";
import { monthValidation } from "@/modules/partner/lib/billing-validation";
import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import type { HistoryEntry } from "@/modules/partner/lib/history";
import { loadPennylane } from "@/modules/partner/lib/pennylane";

/**
 * L'assistant qui RÉPOND — Claude, branché sur le support en lecture seule.
 *
 * Les rappels de l'assistant (data-assistant.ts) sont calculés sans IA et
 * restent la source de « ce qu'il reste à faire ». Ici, c'est le champ
 * « poser une question » : « pourquoi ce message ? », « comment est calculé
 * le CA ? », « où en est Instalclim ? ». Claude reçoit deux choses :
 *   1. le RÉFÉRENTIEL des règles (docs/REGLES-SUPPORT.md), en consigne — ce
 *      qui n'y est pas, il ne le sait pas, et il doit le dire ;
 *   2. des OUTILS de lecture, un par sujet, scopés au rôle de la personne
 *      (un partenaire ne lit que ses fiches). Jamais d'écriture, jamais une
 *      clé ni un mot de passe.
 *
 * Modèle : Claude Haiku 4.5 — le moins cher (1 $ / 5 $ par million de
 * tokens), largement assez pour lire des données et les expliquer. Le
 * référentiel et les outils sont mis en cache (préfixe stable) : une
 * question coûte autour d'un centime.
 *
 * Boucle manuelle et bornée : cinq allers-retours d'outils au plus, une
 * réponse courte. Pas de streaming — les réponses tiennent en quelques
 * phrases et le widget les affiche d'un bloc.
 */

export const AI_MODEL = "claude-haiku-4-5";
const MAX_TURNS = 5;
const MAX_TOKENS = 1200;
const MAX_HISTORY = 12;

export const isAiConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

export type Scope = {
  admin: boolean;
  support: boolean;
  partnerId: number | string | null;
  userId: number | string | null;
  prenom: string | null;
};

export const scopeOf = (user: Doc | null): Scope | null => {
  if (!user) return null;
  const admin = hasAdminRole(user);
  const support = !admin && isSupport(user);
  const partnerId = !admin && isPartnerMetier(user) ? partnerIdOf(user) : null;
  if (!admin && !support && partnerId == null) return null;
  return {
    admin,
    support,
    partnerId,
    userId: user.id ?? null,
    prenom: (user.firstName as string | undefined)?.trim() || (user.name as string | undefined)?.trim().split(/\s+/)[0] || null,
  };
};

/* ─── Le référentiel, lu une fois ─────────────────────────────────────────── */

let rulesCache: string | null = null;
const rules = (): string => {
  // En cache en production (le fichier ne change qu'au déploiement) ; relu à
  // chaque question en dev, pour voir une modification sans redémarrer.
  if (rulesCache && process.env.NODE_ENV === "production") return rulesCache;
  try {
    rulesCache = readFileSync(join(process.cwd(), "docs", "REGLES-SUPPORT.md"), "utf8");
  } catch {
    rulesCache = "(référentiel introuvable)";
  }
  return rulesCache;
};

/** Jour civil de Paris, « AAAA-MM-JJ ». */
const parisToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(new Date());

const systemPrompt = (scope: Scope): string =>
  [
    "Tu es l'assistant du back-office « TIM support ». Tu réponds en français à des questions sur les données et les règles du support.",
    "FORME. Synthétise : l'essentiel d'abord, jamais de remplissage. Mets en **gras** les noms, les montants et les dates qui comptent, en *italique* les nuances. Dès qu'il y a plusieurs éléments, fais une liste (« - »). Pour un emploi du temps ou un planning, un titre par jour (« ### Lundi 21 septembre ») puis une ligne par action avec l'heure en gras. Pas de tableau, pas de code. Trois à huit lignes suffisent le plus souvent.",
    "Tu disposes du référentiel des règles ci-dessous et d'outils de lecture. Pour toute question sur une donnée précise (un client, un chiffre, un état), appelle l'outil qui la lit avant de répondre : ne devine jamais une donnée.",
    "Si une règle n'est pas dans le référentiel, dis que tu ne sais pas et renvoie vers l'équipe. Tu ne modifies rien : quand une action est nécessaire, dis laquelle et où (quel écran), sans prétendre l'avoir faite.",
    "Quand tu cites une fiche, donne son lien : /admin/collections/partner-clients/<id> ; un parcours : /admin/collections/journey-runs/<id> ; un ticket : /admin/collections/tickets/<id>.",
    "Dates en français, montants en euros HT. Ne mentionne jamais de clé, jeton ou mot de passe.",
    scope.admin
      ? "La personne est administratrice : elle voit tout."
      : scope.support
        ? "La personne fait partie du support : elle ne voit que les tickets."
        : "La personne est un partenaire-métier : tes outils ne lisent que ses opportunités, ses parcours et ses tâches.",
    "",
    "# Référentiel",
    rules(),
  ].join("\n");

/* ─── Les outils de lecture ───────────────────────────────────────────────── */

const scoped = (scope: Scope, clauses: Where[]): Where => ({
  and: scope.partnerId != null ? [{ partner: { equals: scope.partnerId } }, ...clauses] : clauses,
});

const nameOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { companyName?: string; displayName?: string }).companyName ?? (v as { displayName?: string }).displayName ?? null) : null;

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : null);

/** Une fiche, telle qu'on la résume à l'assistant : jamais les mots de passe ni l'historique complet. */
const clientSummary = (c: Doc) => ({
  id: c.id,
  entreprise: c.companyName,
  statut: clientStatusMeta(c.clientStatus)?.label ?? c.clientStatus,
  email: c.email ?? null,
  telephone: c.phone ?? null,
  partenaire: nameOf(c.partner),
  source: c.source ?? null,
  creeeLe: day(c.createdAt),
  signeeLe: day(c.signatureDate),
  debutContrat: day(c.contractStartDate),
  caHTMensuel: c.caPaye ?? 0,
  licences: c.totalLicences ?? 0,
  reserves: Array.isArray(c.intakeIssues) ? c.intakeIssues.map((i: Doc) => `${i.field} : ${i.message} (saisi « ${i.raw} »)`) : [],
  notesLead: c.leadNotes ?? null,
});

const TOOLS: Anthropic.Tool[] = [
  {
    name: "rappels",
    description: "Ce qui attend l'action de la personne connectée : la liste des rappels de l'assistant (tickets, relevés en retard, tâches, factures à valider…), et le détail des actions de l'agenda — aujourd'hui et en retard (heure, nature, client, lien).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "rechercher_clients",
    description: "Cherche des opportunités / clients par nom d'entreprise (recherche partielle) ou par statut. Renvoie jusqu'à 20 fiches résumées.",
    input_schema: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Tout ou partie du nom de l'entreprise." },
        statut: { type: "string", description: "Valeur de statut : nouvelle, en-qualification, demo-programmee, attente-engagement, attente-longue, en-test, actif, perdue, resilie, archive." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "fiche_client",
    description: "La fiche complète d'une opportunité / d'un client : identité, statut, montants, réserves, contacts, les 10 dernières activités (notes, appels, tâches) et son parcours de test s'il y en a un.",
    input_schema: { type: "object", properties: { id: { type: "number", description: "Identifiant de la fiche." } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "parcours",
    description: "Les phases de test ouvertes (ou celle d'un client) : dates, statut, chaque étape avec son état, son acteur, sa date.",
    input_schema: { type: "object", properties: { clientId: { type: "number", description: "Limiter à ce client (optionnel)." } }, additionalProperties: false },
  },
  {
    name: "agenda",
    description: "L'agenda de la personne : sessions de prise en main, tâches datées et étapes de parcours, jour par jour, sur les 7 prochains jours (ou une plage donnée). C'est l'outil pour « mon emploi du temps », « qu'ai-je demain ».",
    input_schema: {
      type: "object",
      properties: {
        du: { type: "string", description: "Premier jour, AAAA-MM-JJ (défaut : aujourd'hui)." },
        jours: { type: "number", description: "Nombre de jours (défaut 7, 31 au plus)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "taches",
    description: "Les tâches (rappels datés) : en retard, aujourd'hui, à venir sur 7 jours — ou celles d'un client.",
    input_schema: { type: "object", properties: { clientId: { type: "number", description: "Limiter à ce client (optionnel)." } }, additionalProperties: false },
  },
  {
    name: "rapprochement",
    description: "Le rapprochement Pennylane (admins) : pour chaque client facturé, verdict, écarts, totaux fiche / abonnement, prochaine facture, et l'état de validation du mois. Optionnel : filtrer sur un nom.",
    input_schema: { type: "object", properties: { nom: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "soumissions_formulaire",
    description: "Les dernières soumissions des formulaires du site vitrine (admins) : date, formulaire, canal, état du traitement, erreur éventuelle, réponses, fiche créée.",
    input_schema: { type: "object", properties: { seulementAReprendre: { type: "boolean", description: "Ne renvoyer que les soumissions en échec ou en brouillon." } }, additionalProperties: false },
  },
  {
    name: "tickets",
    description: "Les tickets du support non résolus (admins, support) : numéro, sujet, client, statut, priorité, réponse client non lue.",
    input_schema: { type: "object", properties: { urgents: { type: "boolean" } }, additionalProperties: false },
  },
  {
    name: "connexions_support",
    description: "L'état des connexions du support (admins) : Pennylane, Brevo, INSEE, Google, Anthropic — configurée ou non, dernier test, notes — et pour Anthropic la dépense de l'assistant (aujourd'hui, mois en cours). Jamais les clés.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
];

/** Les outils qu'un rôle a le droit d'appeler. */
const toolsFor = (scope: Scope): Anthropic.Tool[] =>
  TOOLS.filter((t) => {
    if (scope.admin) return true;
    if (scope.support) return t.name === "rappels" || t.name === "tickets";
    return ["rappels", "rechercher_clients", "fiche_client", "parcours", "agenda", "taches"].includes(t.name);
  });

/** Exécute un outil de lecture — exporté pour pouvoir vérifier chaque outil sans passer par Claude. */
export async function runTool(payload: Payload, scope: Scope, name: string, input: Doc, user: Doc): Promise<unknown> {
  const base = { depth: 1 as const, overrideAccess: true as const };
  switch (name) {
    case "rappels": {
      const a = await buildAssistant(payload, user);
      return {
        actions: a.agenda.map((x) => ({ quand: x.at, heure: x.time, retardJours: x.lateDays, nature: x.label, titre: x.title, client: x.client, lien: x.href })),
        rappels: a.items.map((i) => ({ urgence: i.tone, texte: i.text, precision: i.hint ?? null, lien: i.cta.href })),
      };
    }
    case "rechercher_clients": {
      if (scope.support) return { erreur: "Hors périmètre." };
      const clauses: Where[] = [];
      if (input.nom) clauses.push({ or: [{ companyName: { like: String(input.nom) } }, { raisonSociale: { like: String(input.nom) } }] });
      if (input.statut) clauses.push({ clientStatus: { equals: String(input.statut) } });
      const r = await payload.find({ ...base, collection: "partner-clients", where: scoped(scope, clauses), limit: 20, sort: "-updatedAt" });
      return { total: r.totalDocs, fiches: (r.docs as Doc[]).map(clientSummary) };
    }
    case "fiche_client": {
      if (scope.support) return { erreur: "Hors périmètre." };
      const c = (await payload.findByID({ ...base, collection: "partner-clients", id: String(input.id) }).catch(() => null)) as Doc | null;
      if (!c || (scope.partnerId != null && String(c.partner?.id ?? c.partner) !== String(scope.partnerId))) return { erreur: "Fiche introuvable." };
      const [activities, contacts, runs] = await Promise.all([
        payload.find({ ...base, depth: 0, collection: "client-activities", where: { client: { equals: c.id } }, sort: "-occurredAt", limit: 10 }),
        payload.find({ ...base, depth: 0, collection: "client-contacts", where: { client: { equals: c.id } }, limit: 10 }),
        payload.find({ ...base, depth: 0, collection: "journey-runs", where: { client: { equals: c.id } }, sort: "-createdAt", limit: 1 }),
      ]);
      const run = runs.docs[0] as Doc | undefined;
      return {
        ...clientSummary(c),
        contacts: (contacts.docs as Doc[]).map((k) => ({ nom: [k.firstName, k.lastName].filter(Boolean).join(" "), role: k.role ?? null, email: k.email ?? null, telephone: k.phone ?? null })),
        activites: (activities.docs as Doc[]).map((a) => ({ le: day(a.occurredAt), type: a.type, titre: a.title, detail: a.content ?? null, echeance: day(a.dueDate), faite: a.done ?? null })),
        parcours: run ? runSummary(run) : null,
      };
    }
    case "parcours": {
      if (scope.support) return { erreur: "Hors périmètre." };
      const clauses: Where[] = input.clientId ? [{ client: { equals: Number(input.clientId) } }] : [{ status: { not_in: CLOSED_STATUSES } }];
      const r = await payload.find({ ...base, collection: "journey-runs", where: scoped(scope, clauses), limit: 30, sort: "endDate" });
      return { parcours: (r.docs as Doc[]).map(runSummary) };
    }
    case "agenda": {
      if (scope.support) return { erreur: "Hors périmètre." };
      const { getTodayAgenda } = await import("@/admin/dashboard/data-agenda");
      const jours = Math.min(31, Math.max(1, Number(input.jours) || 7));
      const du = typeof input.du === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.du) ? input.du : parisToday();
      const debut = Date.parse(`${du}T00:00:00.000Z`);
      const fin = debut + jours * 86_400_000;
      // L'agenda charge une fenêtre fixe autour de « maintenant » (du 1er − 10 j
      // au 1er + 50 j) : on la centre sur le MILIEU de la plage demandée, pour
      // qu'une plage de 31 jours partant d'une fin de mois tienne dedans.
      const a = await getTodayAgenda({ payload } as never, "/admin", debut + (jours * 86_400_000) / 2, { partnerId: scope.partnerId });
      const dans = a.items.filter((i) => Date.parse(i.at) >= debut && Date.parse(i.at) < fin);
      const parJour = new Map<string, unknown[]>();
      for (const i of dans) {
        const j = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(new Date(i.at));
        const heure = i.allDay ? null : new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(i.at));
        parJour.set(j, [...(parJour.get(j) ?? []), { heure, nature: i.label, quoi: i.title, client: i.client, fait: Boolean(i.done), visio: i.link ?? null, lien: i.href }]);
      }
      return {
        du,
        jours,
        enRetard: a.retard.map((i) => ({ prevuLe: i.at.slice(0, 10), nature: i.label, quoi: i.title, client: i.client, lien: i.href })),
        parJour: [...parJour.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([jour, actions]) => ({ jour, actions })),
      };
    }
    case "taches": {
      if (scope.support) return { erreur: "Hors périmètre." };
      const clauses: Where[] = [{ type: { equals: "tache" } }, { done: { not_equals: true } }];
      if (input.clientId) clauses.push({ client: { equals: Number(input.clientId) } });
      else clauses.push({ dueDate: { less_than: new Date(Date.now() + 7 * 86_400_000).toISOString() } });
      const r = await payload.find({ ...base, collection: "client-activities", where: scoped(scope, clauses), limit: 50, sort: "dueDate" });
      const today = parisToday();
      return {
        taches: (r.docs as Doc[]).map((t) => ({ id: t.id, client: nameOf(t.client), clientId: t.client?.id ?? t.client, titre: t.title, echeance: day(t.dueDate), etat: day(t.dueDate)! < today ? "en retard" : day(t.dueDate) === today ? "aujourd'hui" : "à venir" })),
      };
    }
    case "rapprochement": {
      if (!scope.admin) return { erreur: "Réservé aux administrateurs." };
      const snap = await loadPennylane();
      const docs = (await payload.find({ ...base, depth: 0, collection: "partner-clients", where: { clientStatus: { equals: "actif" } }, limit: 500, pagination: false })).docs as Doc[];
      const report = buildBillingReport(
        docs.map((d) => ({ id: d.id, name: d.companyName ?? "—", siren: d.siren, raisonSociale: d.raisonSociale, clientStatus: d.clientStatus, paymentMethod: d.paymentMethod, paymentTerms: d.paymentTerms, billingPeriod: d.billingPeriod, licences: d.licences })),
        snap,
      );
      const hist = new Map(docs.map((d) => [String(d.id), (d.history ?? []) as HistoryEntry[]]));
      const now = new Date();
      const filtre = input.nom ? String(input.nom).toLowerCase() : null;
      return {
        luChezPennylane: snap.fetchedAt,
        clients: report.checks
          .filter((c: ClientCheck) => !filtre || c.client.name.toLowerCase().includes(filtre))
          .map((c: ClientCheck) => {
            const v = monthValidation(hist.get(String(c.client.id)) ?? [], c, now);
            return {
              id: c.client.id,
              client: c.client.name,
              verdict: c.verdict,
              ecarts: c.issues.map((i) => i.label),
              ficheHTMensuel: c.totals.supportHT,
              abonnementHTMensuel: c.totals.plHT,
              prochaineFacture: c.pennylane?.nextOccurrence ?? null,
              validation: { etat: v.state, mois: v.month.slice(0, 7), signeeLe: day(v.validatedAt) },
              impayes: c.latePayments.map((p) => ({ numero: p.number, resteDu: p.remaining, joursDeRetard: p.lateDays })),
            };
          }),
      };
    }
    case "soumissions_formulaire": {
      if (!scope.admin) return { erreur: "Réservé aux administrateurs." };
      const where: Where = input.seulementAReprendre ? { processingStatus: { in: ["echec", "brouillon"] } } : {};
      const r = await payload.find({ ...base, collection: "form-submissions", where, limit: 20, sort: "-createdAt" });
      return {
        soumissions: (r.docs as Doc[]).map((s) => ({ id: s.id, le: s.createdAt, formulaire: s.form?.title ?? s.formIdSnapshot ?? null, canal: s.channel ?? null, traitement: s.processingStatus, erreur: s.processingError ?? null, reponses: s.answers ?? null, fiche: s.client?.id ?? s.client ?? null, entreprise: nameOf(s.client) })),
      };
    }
    case "tickets": {
      if (!scope.admin && !scope.support) return { erreur: "Hors périmètre." };
      const clauses: Where[] = [{ status: { not_equals: "resolved" } }];
      if (input.urgents) clauses.push({ priority: { equals: "urgent" } });
      const r = await payload.find({ ...base, collection: "tickets", where: { and: clauses }, limit: 30, sort: "-updatedAt" });
      return {
        tickets: (r.docs as Doc[]).map((t) => ({ id: t.id, numero: t.number ?? null, sujet: t.subject, client: nameOf(t.client), statut: t.status, priorite: t.priority ?? null, reponseClientNonLue: Boolean(t.unreadClientReply), misAJour: t.updatedAt })),
      };
    }
    case "connexions_support": {
      if (!scope.admin) return { erreur: "Réservé aux administrateurs." };
      const { SUPPORT_CONNECTIONS, isConfigured } = await import("@/core/lib/support-connections");
      const { summarizeSpend } = await import("@/core/lib/ai-budget");
      const g = (await payload.findGlobal({ slug: "support-connections", depth: 0, overrideAccess: true })) as { entries?: Doc[] | null };
      const entries = new Map((g.entries ?? []).map((e) => [e.key, e]));
      return {
        connexions: SUPPORT_CONNECTIONS.map((c) => {
          const e = entries.get(c.key);
          return {
            nom: c.name,
            configuree: isConfigured(c),
            dernierTest: e?.lastTestAt ?? null,
            dernierTestOk: e?.lastTestOk ?? null,
            message: e?.lastTestMessage ?? null,
            notes: e?.notes ?? null,
            // La dépense de l'assistant lui-même : le jour (plafonné) et le mois (ce que la facture dira).
            ...(c.key === "anthropic" ? { depenseAssistant: summarizeSpend(e) } : {}),
          };
        }),
      };
    }
    default:
      return { erreur: `Outil inconnu : ${name}` };
  }
}

const runSummary = (r: Doc) => ({
  id: r.id,
  client: nameOf(r.client),
  clientId: r.client?.id ?? r.client,
  statut: r.status,
  debut: day(r.startDate),
  fin: day(r.endDate),
  session: r.sessionAt ?? null,
  bilan: r.reviewAt ?? null,
  etapes: ((r.steps ?? []) as Doc[]).map((s) => ({
    etape: s.label,
    acteur: s.actor,
    etat: isStepDone(s) ? "faite" : s.state === "bloque" ? "bloquée" : s.state === "auto" ? "validation automatique en attente" : "à faire",
    faiteLe: day(s.doneAt),
  })),
});

/* ─── La conversation ─────────────────────────────────────────────────────── */

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type Answer = {
  text: string;
  /** Tokens consommés sur l'échange complet, pour suivre ce que ça coûte. */
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; calls: number };
};

/**
 * Répond à la dernière question, avec l'historique récent de la
 * conversation. Boucle bornée : à chaque tour, soit Claude répond, soit il
 * demande des outils qu'on exécute avant de le rappeler.
 */
export async function answer(payload: Payload, user: Doc, history: ChatTurn[]): Promise<Answer> {
  const scope = scopeOf(user);
  if (!scope) throw new Error("Aucun périmètre pour ce compte.");
  const client = new Anthropic();
  const tools = toolsFor(scope);

  // Les derniers tours — en commençant par un tour UTILISATEUR : l'API refuse
  // une conversation qui s'ouvre sur l'assistant, et la coupe à MAX_HISTORY
  // tombe une fois sur deux sur une réponse.
  const recent = history.slice(-MAX_HISTORY);
  const firstUser = recent.findIndex((t) => t.role === "user");
  const messages: Anthropic.MessageParam[] = (firstUser >= 0 ? recent.slice(firstUser) : recent).map((t) => ({ role: t.role, content: t.content }));
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      // Le référentiel et les outils ne changent pas d'une question à l'autre :
      // en cache, ils coûtent dix fois moins à chaque appel suivant.
      system: [{ type: "text", text: systemPrompt(scope), cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });
    usage.calls += 1;
    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { text: text || "Je n'ai pas de réponse à donner ici.", usage };
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const t of toolUses) {
      let content: string;
      try {
        content = JSON.stringify(await runTool(payload, scope, t.name, (t.input ?? {}) as Doc, user));
      } catch (e) {
        content = JSON.stringify({ erreur: (e as Error).message });
      }
      results.push({ type: "tool_result", tool_use_id: t.id, content });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "Je n'arrive pas à conclure sur cette question — reformulez, ou regardez directement sur l'écran concerné.", usage };
}
