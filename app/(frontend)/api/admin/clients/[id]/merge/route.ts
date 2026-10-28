import { NextResponse } from "next/server";
import type { Payload, Where } from "payload";

import { hasAdminRole } from "@/core/access";
import { frDate } from "@/core/lib/dates";
import { phoneDigits } from "@/core/lib/phone";
import { idOf } from "@/core/lib/relations";
import { payloadClient } from "@/core/payload-client";
import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { logActivity } from "@/modules/partner/lib/journal";
import { findKnownClient } from "@/modules/partner/lib/known-client";

/**
 * Absorber une fiche en double dans la fiche existante de la même entreprise.
 *
 * GET  ?q=…                       → fiches candidates (suggestions d'abord, par
 *                                    e-mail / téléphone, puis recherche par nom)
 * POST { targetId, preview }      → `preview` : ce qui va passer d'une fiche à
 *                                    l'autre, et ce qui l'empêcherait ; sinon
 *                                    la fusion
 *
 * Le cas visé : une demande arrivée par le site pour une entreprise déjà
 * suivie, qui a produit une seconde fiche « Nouvelle ». La fiche ABSORBÉE
 * (celle de l'URL) doit donc être un LEAD — encore dans le pipeline, sans phase
 * de test, sans dossier, sans contrat ni signature, sans espace client. Une
 * fiche qui a vécu tout cela ne se fusionne pas d'un clic : trop de liens
 * (parcours, documents signés, comptes) dont le déplacement casserait quelque
 * chose sans que personne le voie.
 *
 * Ce qui passe sur la fiche gardée : les contacts (sauf ceux qu'elle connaît
 * déjà, même e-mail ou même numéro), l'historique, les soumissions du
 * formulaire, les tickets, les réservations de présentation, les séquences, et
 * les développements qui la citaient. La demande d'origine et les coordonnées
 * de la fiche absorbée sont recopiées dans l'historique de la fiche gardée.
 *
 * La fiche absorbée n'est PAS supprimée : elle est archivée (motif « Autre »,
 * précision « Doublon — fusionné dans … »), et garde ce qui n'a pas bougé — les
 * contacts déjà connus, ses envois GA4 (uniques par fiche et par étape). Une
 * fusion se vérifie et, au besoin, se défait à la main.
 *
 * Réservé à TIM : la fiche gardée peut appartenir à un autre partenaire.
 *
 * Pas de transaction : chaque déplacement est un enregistrement à part. Si l'un
 * échoue, la réponse le dit, et relancer la fusion termine le travail — ce qui
 * a déjà bougé n'est plus sur la fiche absorbée.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };
type Fiche = {
  id: number | string;
  companyName?: string | null;
  clientStatus?: string | null;
  email?: string | null;
  phone?: string | null;
  partner?: unknown;
  leadNotes?: string | null;
  createdAt?: string;
};

/** Ce qui suit la fiche absorbée, collection par collection (champ `client`). */
const MOVED = [
  { collection: "client-activities", label: "historique" },
  { collection: "form-submissions", label: "soumissions du formulaire" },
  { collection: "tickets", label: "tickets" },
  {
    collection: "presentation-bookings",
    label: "réservations de présentation",
  },
  { collection: "sequence-runs", label: "séquences de relance" },
] as const;

/** Ce qui fait d'une fiche autre chose qu'un lead : sa présence bloque. */
const BLOCKING = [
  {
    collection: "journey-runs",
    label: "une phase de test ou une mise en production",
  },
  { collection: "client-contracts", label: "un contrat" },
  { collection: "electronic-signatures", label: "des signatures en ligne" },
  { collection: "client-portal-accounts", label: "un espace client" },
  { collection: "client-employees", label: "des salariés au dossier" },
  { collection: "client-sites", label: "des chantiers au dossier" },
  { collection: "client-vehicles", label: "des véhicules au dossier" },
  { collection: "client-machines", label: "des engins au dossier" },
  { collection: "trainings", label: "une formation" },
] as const;

const dateOf = (iso?: string | null) => frDate(iso) || "—";

async function guard(req: Request, id: string) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return { payload, error: 403 as const };
  const source = (await payload
    .findByID({
      collection: "partner-clients",
      id,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })
    .catch(() => null)) as Fiche | null;
  if (!source) return { payload, error: 404 as const };
  return { payload, source };
}

const count = (payload: Payload, collection: string, where: Where) =>
  payload
    .count({
      collection: collection as "client-activities",
      where,
      overrideAccess: true,
    })
    .then((r) => r.totalDocs)
    .catch(() => 0);

async function partnerName(payload: Payload, partner: unknown): Promise<string | null> {
  return (await partnerNames(payload, [partner])).get(String(idOf(partner))) ?? null;
}

/** Les noms de plusieurs partenaires en une requête, par id. */
async function partnerNames(payload: Payload, partners: unknown[]): Promise<Map<string, string>> {
  const ids = [...new Set(partners.map(idOf).filter((v): v is number | string => v != null))];
  if (!ids.length) return new Map();
  const res = await payload
    .find({
      collection: "partners",
      where: { id: { in: ids } },
      limit: ids.length,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] }));
  return new Map(
    (res.docs as { id: number | string; displayName?: string | null }[])
      .filter((p) => p.displayName)
      .map((p) => [String(p.id), p.displayName!]),
  );
}

/** Les contacts de la fiche absorbée, triés : à déplacer, ou déjà connus de la fiche gardée. */
async function splitContacts(payload: Payload, sourceId: number | string, targetId: number | string) {
  const all = async (client: number | string) =>
    (
      await payload.find({
        collection: "client-contacts",
        where: { client: { equals: client } },
        limit: 500,
        depth: 0,
        overrideAccess: true,
      })
    ).docs as {
      id: number | string;
      email?: string | null;
      phone?: string | null;
      timPassword?: unknown;
    }[];
  const [mine, theirs] = await Promise.all([all(sourceId), all(targetId)]);
  const emails = new Set(theirs.map((c) => c.email?.trim().toLowerCase()).filter(Boolean));
  const phones = new Set(theirs.map((c) => phoneDigits(c.phone)).filter((d) => d.length >= 9));
  const known = (c: (typeof mine)[number]) =>
    (c.email && emails.has(c.email.trim().toLowerCase())) || phones.has(phoneDigits(c.phone));
  return {
    move: mine.filter((c) => !known(c)),
    keep: mine.filter(known),
    withAccess: mine.some((c) => c.timPassword),
  };
}

/** Ce qui empêche la fusion, en phrases. Vide = possible. */
async function blockersOf(payload: Payload, source: Fiche, target: Fiche | null): Promise<string[]> {
  const out: string[] = [];
  if (!target) return ["Fiche à garder introuvable."];
  if (String(target.id) === String(source.id)) return ["Une fiche ne se fusionne pas avec elle-même."];
  if (target.clientStatus === "archive") out.push("La fiche à garder est archivée : désarchivez-la d'abord.");
  if (clientStatusMeta(source.clientStatus)?.phase !== "pipeline") {
    out.push(
      `Cette fiche est « ${clientStatusMeta(source.clientStatus)?.label ?? source.clientStatus} » : seul un lead encore dans le pipeline se fusionne.`,
    );
  }
  const where = { client: { equals: source.id } };
  const counts = await Promise.all(BLOCKING.map((b) => count(payload, b.collection, where)));
  BLOCKING.forEach((b, i) => counts[i] > 0 && out.push(`Cette fiche a ${b.label}.`));
  return out;
}

export async function GET(req: Request, { params }: Params) {
  const ctx = await guard(req, (await params).id);
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });
  const { payload, source } = ctx;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  // Suggestions : la même adresse ou le même numéro ailleurs, puis le même
  // premier mot du nom (« Laurin » pour « Laurin Électricité »).
  // La suggestion ne sert que sans recherche tapée : on ne la calcule qu'alors.
  const word = (q || source.companyName || "").split(/\s+/).find((w) => w.length >= 3) ?? "";
  const [suggested, byName] = await Promise.all([
    q ? null : findKnownClient(payload, { email: source.email, phone: source.phone }, { exclude: source.id }),
    word
      ? payload
          .find({
            collection: "partner-clients",
            where: {
              and: [
                { companyName: { like: q || word } },
                { id: { not_equals: source.id } },
                { clientStatus: { not_equals: "archive" } },
              ],
            },
            sort: "-updatedAt",
            limit: 8,
            depth: 0,
            overrideAccess: true,
          })
          .then((r) => r.docs as Fiche[])
      : ([] as Fiche[]),
  ]);

  const seen = new Set<string>();
  const rows: (Fiche & { suggested: boolean })[] = [];
  if (suggested) {
    const doc = (await payload
      .findByID({
        collection: "partner-clients",
        id: suggested.id,
        depth: 0,
        overrideAccess: true,
      })
      .catch(() => null)) as Fiche | null;
    if (doc) rows.push({ ...doc, suggested: true });
  }
  for (const d of byName) rows.push({ ...d, suggested: false });

  const names = await partnerNames(
    payload,
    rows.map((r) => r.partner),
  );
  const candidates = [];
  for (const r of rows) {
    if (seen.has(String(r.id))) continue;
    seen.add(String(r.id));
    candidates.push({
      id: r.id,
      companyName: r.companyName ?? "Sans nom",
      status: clientStatusMeta(r.clientStatus)?.label ?? r.clientStatus ?? "",
      partner: names.get(String(idOf(r.partner))) ?? null,
      email: r.email ?? null,
      suggested: r.suggested,
    });
  }
  return NextResponse.json({
    source: { id: source.id, companyName: source.companyName },
    candidates,
  });
}

export async function POST(req: Request, { params }: Params) {
  const ctx = await guard(req, (await params).id);
  if ("error" in ctx) return NextResponse.json({ error: "denied" }, { status: ctx.error });
  const { payload, source } = ctx;
  const body = (await req.json().catch(() => null)) as {
    targetId?: number | string;
    preview?: boolean;
  } | null;
  if (body?.targetId == null) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const target = (await payload
    .findByID({
      collection: "partner-clients",
      id: body.targetId,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })
    .catch(() => null)) as Fiche | null;

  const blockers = await blockersOf(payload, source, target);
  const contacts = target ? await splitContacts(payload, source.id, target.id) : null;
  if (contacts?.withAccess) blockers.push("Un contact de cette fiche a déjà un accès TIM.");

  const where = { client: { equals: source.id } };
  const moving = await Promise.all(
    MOVED.map(async (m) => ({
      ...m,
      n: await count(payload, m.collection, where),
    })),
  );
  const developments = await payload
    .find({
      collection: "developments",
      where: { opportunities: { in: [source.id] } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    .then((r) => r.docs as { id: number | string; opportunities?: unknown[] }[])
    .catch(() => []);

  const summary = {
    target: target
      ? {
          id: target.id,
          companyName: target.companyName ?? "Sans nom",
          partner: await partnerName(payload, target.partner),
        }
      : null,
    contacts: contacts ? { move: contacts.move.length, alreadyKnown: contacts.keep.length } : null,
    moving: moving.filter((m) => m.n > 0).map((m) => ({ label: m.label, n: m.n })),
    developments: developments.length,
    blockers,
  };

  if (body.preview || blockers.length || !target || !contacts) {
    return NextResponse.json(summary, {
      status: blockers.length && !body.preview ? 409 : 200,
    });
  }

  // ── La fusion ─────────────────────────────────────────────────────────────
  const failed: string[] = [];
  const move = async (collection: string, id: number | string, label: string) => {
    await payload
      .update({
        collection: collection as "client-activities",
        id,
        data: { client: target.id } as never,
        overrideAccess: true,
      })
      .catch((e) => {
        payload.logger.error(`[fusion] ${collection} ${id} : ${e}`);
        failed.push(label);
      });
  };

  for (const c of contacts.move) await move("client-contacts", c.id, "contacts");
  for (const m of MOVED) {
    const docs = (
      await payload.find({
        collection: m.collection as "client-activities",
        where,
        limit: 1000,
        depth: 0,
        overrideAccess: true,
      })
    ).docs as { id: number | string }[];
    for (const d of docs) await move(m.collection, d.id, m.label);
  }
  for (const d of developments) {
    // Les identifiants gardent leur type (nombres en base) ; le dédoublonnage se
    // fait sur leur forme texte — la fiche gardée y était peut-être déjà.
    const seen = new Set<string>();
    const next = (d.opportunities ?? [])
      .map(idOf)
      .filter((v): v is number | string => v != null)
      .map((v) => (String(v) === String(source.id) ? target.id : v))
      .filter((v) => !seen.has(String(v)) && Boolean(seen.add(String(v))));
    await payload
      .update({
        collection: "developments",
        id: d.id,
        data: { opportunities: next } as never,
        overrideAccess: true,
      })
      .catch((e) => {
        payload.logger.error(`[fusion] développement ${d.id} : ${e}`);
        failed.push("développements");
      });
  }

  if (failed.length) {
    return NextResponse.json(
      {
        error: "partial",
        message: `Fusion incomplète (${[...new Set(failed)].join(", ")}). Relancez-la : elle reprendra là où elle s'est arrêtée.`,
      },
      { status: 500 },
    );
  }

  // La trace, sur la fiche GARDÉE : d'où venait la fiche absorbée, et ce
  // qu'elle disait. La demande d'origine ne se perd pas avec elle.
  const sourcePartner = await partnerName(payload, source.partner);
  await logActivity(payload, {
    client: target.id,
    title: `Fiche fusionnée : « ${source.companyName ?? "Sans nom"} »`,
    content: [
      `Fiche n° ${source.id}, créée le ${dateOf(source.createdAt)}${sourcePartner ? ` (${sourcePartner})` : ""}, absorbée dans celle-ci et archivée.`,
      [source.email && `E-mail : ${source.email}`, source.phone && `Téléphone : ${source.phone}`]
        .filter(Boolean)
        .join(" · "),
      source.leadNotes ? `\nDemande d'origine :\n${source.leadNotes}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  }).catch((e) => payload.logger.error(`[fusion] journal de ${target.id} : ${e}`));

  // Archivée, jamais supprimée. En brouillon, comme l'archivage du menu : ni
  // GA4 ni séquence ne réagissent à une fiche qui disparaît du pipeline.
  await payload.update({
    collection: "partner-clients",
    id: source.id,
    draft: true,
    data: {
      _status: "draft",
      clientStatus: "archive",
      lossReason: "autre",
      lossReasonDetail: `Doublon — fusionné dans « ${target.companyName ?? "Sans nom"} » (fiche n° ${target.id}) le ${dateOf(new Date().toISOString())}.`,
    } as never,
    overrideAccess: true,
  });

  return NextResponse.json({ ok: true, targetId: target.id, ...summary });
}
