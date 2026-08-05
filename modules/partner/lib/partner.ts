import { lexicalToHtml, mediaUrl } from "@/modules/editorial/lib/content";
import { payloadClient } from "@/core/payload-client";
import { relId } from "@/core/lib/relations";
import { uploadImages } from "@/core/lib/uploads";
import type {
  Mission,
  MissionPartnerStatus,
  PointsEntry,
  PointsSource,
  PointsSummary,
  RedeemResult,
  Reward,
} from "@/core/lib/types";

/**
 * Service métier partenaires sur Payload (Local API), même interface que les
 * fonctions correspondantes de lib/wordpress.ts. Les workflows de crédit /
 * remboursement déclenchés en back-office vivent dans collections/hooks.ts ;
 * ici on gère la lecture (solde, missions, catalogue) et l'échange initié par
 * le partenaire.
 */

type Payload = Awaited<ReturnType<typeof payloadClient>>;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * Résout la FICHE partenaire d'un compte à partir de son email de session.
 *
 * Identification par le LIEN STABLE compte↔fiche (`users.partner`, par ID), pas
 * par correspondance d'email : l'email de session est celui du LOGIN (donc
 * toujours à jour), on remonte au compte puis à SA fiche par identifiants. Ainsi
 * changer l'email d'une fiche (ou d'un compte) ne recrée plus de fiche en double.
 *
 * Repli hérité : correspondance par email, EN LECTURE SEULE. Plus aucune création
 * silencieuse — c'était elle qui générait les doublons dès que l'email divergeait.
 *
 * @returns la fiche partenaire, ou `null` si le compte n'est rattaché à aucune.
 */
async function resolvePartner(payload: Payload, email: string) {
  const normalized = normalizeEmail(email);
  // 1) Lien stable compte → fiche (par ID) : la source de vérité.
  const users = await payload.find({
    collection: "users",
    where: { email: { equals: normalized } },
    limit: 1,
    depth: 0,
  });
  const partnerId = relId((users.docs[0] as { partner?: unknown } | undefined)?.partner);
  if (partnerId) {
    const linked = await payload
      .findByID({ collection: "partners", id: partnerId, depth: 0 })
      .catch(() => null);
    if (linked) return linked;
  }
  // 2) Repli hérité : correspondance par email (lecture seule, sans création).
  const found = await payload.find({
    collection: "partners",
    where: { email: { equals: normalized } },
    limit: 1,
    depth: 0,
  });
  return found.docs[0] ?? null;
}

/** Solde = somme des deltas du ledger du partenaire. */
async function getBalance(payload: Payload, partnerId: number): Promise<number> {
  const res = await payload.find({
    collection: "point-transactions",
    where: { partner: { equals: partnerId } },
    limit: 10000,
    depth: 0,
  });
  return res.docs.reduce((sum, t) => sum + ((t as { delta?: number }).delta ?? 0), 0);
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

export async function getPointsSummary(email: string): Promise<PointsSummary | null> {
  const payload = await payloadClient();
  const partner = await resolvePartner(payload, email);
  if (!partner) return null;
  const res = await payload.find({
    collection: "point-transactions",
    where: { partner: { equals: partner.id } },
    limit: 10000,
    depth: 0,
    sort: "-createdAt",
  });
  const history: PointsEntry[] = res.docs.map((t) => {
    const d = t as unknown as { delta?: number; motif?: string; source?: string; ref?: string | null; createdAt: string };
    return {
      delta: d.delta ?? 0,
      motif: d.motif ?? "",
      source: (d.source ?? "ajustement") as PointsSource,
      ref: d.ref ?? null,
      created_at: d.createdAt,
    };
  });
  return {
    email: normalizeEmail(email),
    balance: history.reduce((s, e) => s + e.delta, 0),
    history,
    code: (partner as { code?: string }).code ?? "",
  };
}

function mapPartnerStatus(status: string | undefined): MissionPartnerStatus {
  if (status === "approved") return "approved";
  if (status === "pending") return "pending";
  return "none"; // rejected ou absent → peut (re)soumettre
}

export async function getMissions(email: string): Promise<Mission[]> {
  const payload = await payloadClient();
  const partner = await resolvePartner(payload, email);

  // Le catalogue est public ; le statut par mission n'existe que si le compte est
  // rattaché à une fiche (sinon aucune soumission → statut par défaut).
  const missions = await payload.find({ collection: "missions", limit: 1000, depth: 1, sort: "order" });
  const subs = partner
    ? await payload.find({
        collection: "mission-submissions",
        where: { partner: { equals: partner.id } },
        limit: 10000,
        depth: 0,
        sort: "-createdAt",
      })
    : { docs: [] as unknown[] };

  // Statut le plus récent par mission pour ce partenaire.
  const latestStatus = new Map<number, string>();
  for (const s of subs.docs) {
    const mid = relId((s as { mission?: unknown }).mission);
    if (mid && !latestStatus.has(mid)) latestStatus.set(mid, (s as { status?: string }).status ?? "");
  }

  return missions.docs.map((m) => {
    // Document Payload brut : `unknown` obligerait à un cast à chaque accès
    // sans rien garantir de plus (conversion vers le type du domaine juste après).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = m as Record<string, any>;
    return {
      id: d.id,
      title: d.title,
      description: lexicalToHtml(d.instructions),
      points: d.points ?? 0,
      url: d.url ?? "",
      type: d.type,
      image: mediaUrl(d.logo),
      repeatable: Boolean(d.repeatable),
      partner_status: mapPartnerStatus(latestStatus.get(d.id)),
    };
  });
}

export async function getRewards(): Promise<Reward[]> {
  const payload = await payloadClient();
  const res = await payload.find({
    collection: "rewards",
    where: { stock: { not_equals: 0 } }, // exclut les épuisés (garde -1 illimité)
    limit: 1000,
    depth: 1,
    sort: "cost",
  });
  return res.docs.map((r) => {
    // Idem : document Payload brut, converti juste après.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = r as Record<string, any>;
    return {
      id: d.id,
      slug: d.slug,
      title: d.title,
      description: lexicalToHtml(d.description),
      cost: d.cost ?? 0,
      stock: d.stock ?? -1,
      image: mediaUrl(d.image),
    };
  });
}

// ─── Échange (débit initié par le partenaire) ────────────────────────────────

/**
 * Cœur de l'échange (débit sécurisé + création de commande), à partir d'une
 * fiche partenaire déjà résolue. Réutilisé par le front (email → fiche) ET par
 * le back-office (compte authentifié → fiche). SEULE porte d'entrée qui débite
 * les points : la création brute de reward-orders est réservée aux admins.
 */
export async function redeemRewardForPartner(
  payload: Payload,
  partner: { id: number; code?: string },
  rewardId: number,
): Promise<{ status: number; data: RedeemResult }> {
  const reward = (await payload
    .findByID({ collection: "rewards", id: rewardId, depth: 0 })
    .catch(() => null)) as { id: number; title: string; cost: number; stock: number } | null;
  if (!reward) return { status: 404, data: { code: "reward_not_found", message: "Récompense introuvable." } };
  if (reward.stock === 0) return { status: 409, data: { code: "out_of_stock", message: "Récompense épuisée." } };

  const balance = await getBalance(payload, partner.id as number);
  if (balance < reward.cost) {
    return { status: 402, data: { code: "insufficient_points", message: "Points insuffisants." } };
  }

  // Débit du ledger.
  const tx = await payload.create({
    collection: "point-transactions",
    data: {
      partner: partner.id,
      delta: -reward.cost,
      motif: `Échange : ${reward.title}`,
      source: "echange",
    },
  });

  // Création de la commande ; rollback du débit en cas d'échec.
  let order: { id: number | string; number?: number | null };
  try {
    // Le numéro est attribué automatiquement (hook du champ referenceNumber).
    order = await payload.create({
      collection: "reward-orders",
      data: {
        partner: partner.id,
        reward: rewardId,
        cost: reward.cost,
        status: "pending",
        ledgerTransaction: tx.id,
      },
    });
  } catch {
    await payload.delete({ collection: "point-transactions", id: tx.id }).catch(() => {});
    return { status: 500, data: { code: "order_failed", message: "Échange impossible, réessayez." } };
  }

  // Référence croisée + décrément du stock si fini.
  await payload.update({ collection: "point-transactions", id: tx.id, data: { ref: `order:${order.id}` } });
  if (typeof reward.stock === "number" && reward.stock > 0) {
    await payload.update({ collection: "rewards", id: rewardId, data: { stock: reward.stock - 1 } });
  }

  return {
    status: 200,
    data: {
      success: true,
      order_number: order.number ?? undefined,
      balance: balance - reward.cost,
      code: partner.code,
    },
  };
}

/** Échange initié depuis le FRONT (résolution de la fiche par email). */
export async function redeemReward(
  email: string,
  rewardId: number,
): Promise<{ status: number; data: RedeemResult }> {
  const payload = await payloadClient();
  const partner = await resolvePartner(payload, email);
  if (!partner) {
    return {
      status: 404,
      data: { code: "partner_not_found", message: "Compte non rattaché à une fiche partenaire." },
    };
  }
  return redeemRewardForPartner(
    payload,
    { id: Number(partner.id), code: (partner as { code?: string }).code },
    rewardId,
  );
}

// ─── Soumission de mission (preuve) ──────────────────────────────────────────

export async function submitMission(args: {
  email: string;
  missionId: number;
  note?: string;
  reviewerEmail?: string;
  files: File[];
}): Promise<{ status: number; data: { success?: boolean; submission_number?: number; code?: string; message?: string } }> {
  const { email, missionId, note, reviewerEmail, files } = args;
  const payload = await payloadClient();
  const partner = await resolvePartner(payload, email);
  if (!partner) {
    return {
      status: 404,
      data: { code: "partner_not_found", message: "Compte non rattaché à une fiche partenaire." },
    };
  }

  const mission = (await payload
    .findByID({ collection: "missions", id: missionId, depth: 0 })
    .catch(() => null)) as { id: number; type: string; repeatable?: boolean } | null;
  if (!mission) return { status: 404, data: { code: "mission_not_found", message: "Mission introuvable." } };

  // Anti-doublon si mission non répétable (sauf si dernière soumission rejetée).
  if (!mission.repeatable) {
    const existing = await payload.find({
      collection: "mission-submissions",
      where: { and: [{ partner: { equals: partner.id } }, { mission: { equals: missionId } }] },
      limit: 1,
      depth: 0,
      sort: "-createdAt",
    });
    const last = existing.docs[0] as { status?: string } | undefined;
    if (last && last.status !== "rejected") {
      return { status: 409, data: { code: "already_submitted", message: "Vous avez déjà soumis cette mission." } };
    }
  }

  // Upload des captures (validation + upload parallèle mutualisés).
  const { ids: attachments } = await uploadImages(payload, files);

  if (mission.type === "preuve" && attachments.length === 0) {
    return { status: 400, data: { code: "no_proof", message: "Ajoutez au moins une capture." } };
  }

  // Le numéro est attribué automatiquement (hook du champ referenceNumber).
  const created = await payload.create({
    collection: "mission-submissions",
    data: {
      mission: missionId,
      partner: partner.id,
      note: note || undefined,
      reviewerEmail: reviewerEmail || undefined,
      status: "pending",
      attachments,
    },
  });

  return {
    status: 200,
    data: { success: true, submission_number: (created as { number?: number }).number },
  };
}
