import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { buildAnnounceEmail } from "@/modules/dev/lib/announce-email";
import { readAnnounceSettings } from "@/modules/dev/lib/announce-settings";
import { logActivity } from "@/modules/partner/lib/journal";

/**
 * Prévenir les clients qui ont demandé un développement : c'est disponible.
 *
 * GET  ?id=…&title=…[&features=1,2] → destinataires proposés (un par
 *                                      opportunité « Demandé par »), intitulé,
 *                                      fiches de doc jointes, et l'APERÇU du
 *                                      message tel qu'il partira au premier
 *                                      destinataire
 * POST { id, title, emails, featureIds } → UN e-mail par adresse — jamais de
 *                                      copie : un client ne doit pas voir les autres.
 *
 * Fiches de doc : celles choisies dans la fenêtre ; sans choix transmis, la
 * « Fiche de documentation » du développement. Seules les fiches PUBLIÉES
 * partent : un lien vers un brouillon mènerait le client sur une page vide.
 *
 * L'envoi est un GESTE, fait depuis la fenêtre de la fiche (AnnounceField), et
 * non un effet de bord du changement de statut : l'équipe relit l'intitulé,
 * retire ou ajoute des adresses, puis envoie. Admin seul, comme le module.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Ref = { id?: unknown } | number | string | null | undefined;
const idOf = (ref: Ref): number | string | null => {
  if (ref == null) return null;
  if (typeof ref === "object") return ((ref as { id?: number | string }).id ?? null) as number | string | null;
  return ref as number | string;
};

type Client = { id: number | string; companyName?: string; email?: string; partner?: Ref };

async function guard(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user || !hasAdminRole(user)) return { payload, ok: false as const };
  return { payload, ok: true as const };
}

/** Les opportunités « Demandé par » d'un développement, avec leur adresse. */
async function requesters(payload: Awaited<ReturnType<typeof payloadClient>>, dev: { opportunities?: Ref[] | null }) {
  const ids = (dev.opportunities ?? []).map(idOf).filter((id): id is number | string => id != null);
  const clients = await Promise.all(
    ids.map(
      (id) =>
        payload
          .findByID({ collection: "partner-clients", id, depth: 0, overrideAccess: true })
          .catch(() => null) as Promise<Client | null>,
    ),
  );
  return clients.filter((c): c is Client => c != null);
}

type Feature = { id: number | string; slug: string; title?: string; shortDescription?: string };

/** Les fiches demandées (ids), publiées seulement, dans l'ordre donné. */
async function featuresOf(payload: Awaited<ReturnType<typeof payloadClient>>, ids: (number | string)[]): Promise<Feature[]> {
  const docs = await Promise.all(
    [...new Set(ids.map(String))].slice(0, 10).map(
      (id) =>
        payload
          .findByID({ collection: "features", id, depth: 0, overrideAccess: true })
          .catch(() => null) as Promise<{ id: number | string; slug?: string; title?: string; shortDescription?: string; _status?: string } | null>,
    ),
  );
  return docs
    .filter((d): d is NonNullable<typeof d> => d != null && d._status === "published" && Boolean(d.slug))
    .map((d) => ({ id: d.id, slug: d.slug!, title: d.title, shortDescription: d.shortDescription }));
}

/** Le choix transmis (liste, éventuellement vide), sinon la fiche du développement. */
const chosenIds = (raw: unknown, dev: { feature?: Ref }): (number | string)[] => {
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
  if (typeof raw === "string") return raw.split(",").map((v) => v.trim()).filter(Boolean);
  const own = idOf(dev.feature);
  return own == null ? [] : [own];
};

/**
 * Le message pour UNE adresse, avec ce qu'on sait du client qui la porte :
 * prénom du référent, partenaire (lien de réservation, adresse de
 * réponse), fiche de doc. Une adresse ajoutée à la main n'a rien de tout ça :
 * le message reste juste, il est seulement moins personnel.
 */
async function messageFor(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  args: { email: string; title: string; client: Client | null; features: Feature[] },
) {
  const settings = await readAnnounceSettings(payload);
  const { client } = args;
  const partnerId = client ? idOf(client.partner) : null;
  const [partner, account] = await Promise.all([
    partnerId != null
      ? payload.findByID({ collection: "partners", id: partnerId, depth: 0, overrideAccess: true }).catch(() => null)
      : Promise.resolve(null),
    client
      ? payload
          .find({
            collection: "client-portal-accounts",
            where: { client: { equals: client.id } },
            limit: 1,
            depth: 0,
            overrideAccess: true,
          })
          .then((r) => r.docs[0] ?? null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  const p = partner as {
    email?: string;
    scheduling?: { enabled?: boolean; mode?: string; bookingUrl?: string };
  } | null;
  const a = account as { firstName?: string } | null;

  const built = buildAnnounceEmail({
    title: args.title,
    contactFirstName: a?.firstName ?? null,
    bookingUrl:
      p?.scheduling?.enabled && p.scheduling.mode === "lien" && p.scheduling.bookingUrl?.trim()
        ? p.scheduling.bookingUrl.trim()
        : null,
    features: args.features,
    recipientEmail: args.email,
    ...settings,
  });
  return { built, replyTo: p?.email ?? null };
}

export async function GET(req: Request) {
  const { payload, ok } = await guard(req);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (!id) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const dev = (await payload
    .findByID({ collection: "developments", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as {
    title?: string;
    opportunities?: Ref[];
    feature?: Ref;
    announcedAt?: string | null;
  } | null;
  if (!dev) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const clients = await requesters(payload, dev);
  const title = (params.get("title") ?? "").trim() || dev.title?.trim() || "";
  const features = await featuresOf(payload, chosenIds(params.has("features") ? params.get("features") : undefined, dev));

  // L'aperçu : le message du PREMIER destinataire — c'est ce que verra un
  // vrai client, prénom compris. Sans destinataire, un message
  // générique, pour qu'on relise quand même le texte.
  const first = clients.find((c) => c.email?.trim()) ?? null;
  const { built } = await messageFor(payload, {
    email: first?.email?.trim() ?? "",
    title: title || "votre demande",
    client: first,
    features,
  });

  return NextResponse.json({
    title: dev.title ?? "",
    announcedAt: dev.announcedAt ?? null,
    recipients: clients.map((c) => ({
      clientId: c.id,
      companyName: c.companyName ?? "",
      email: c.email?.trim() ?? "",
    })),
    features: features.map((f) => ({ id: f.id, title: f.title ?? "", slug: f.slug })),
    preview: { subject: built.subject, html: built.html },
  });
}

export async function POST(req: Request) {
  const { payload, ok } = await guard(req);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { id?: number | string; title?: string; emails?: unknown; featureIds?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  const title = String(body.title ?? "").trim();
  // Dédoublonnées en minuscules : deux graphies de la même adresse feraient
  // deux messages chez la même personne.
  const emails = [
    ...new Set(
      (Array.isArray(body.emails) ? body.emails : [])
        .map((e) => String(e).trim().toLowerCase())
        .filter((e) => EMAIL_RE.test(e)),
    ),
  ];
  if (!body.id || !title || emails.length === 0) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const dev = (await payload
    .findByID({ collection: "developments", id: body.id, depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: number | string; opportunities?: Ref[]; feature?: Ref } | null;
  if (!dev) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const clients = await requesters(payload, dev);
  const byEmail = new Map(clients.filter((c) => c.email).map((c) => [c.email!.trim().toLowerCase(), c]));
  const features = await featuresOf(payload, chosenIds(body.featureIds, dev));

  const results: { email: string; sent: boolean }[] = [];
  for (const email of emails) {
    const client = byEmail.get(email) ?? null;
    const { built, replyTo } = await messageFor(payload, { email, title, client, features });

    try {
      await payload.sendEmail({
        to: email,
        subject: built.subject,
        html: built.html,
        text: built.text,
        // La réponse va à celui qui fera la démo : le partenaire du client.
        ...(replyTo ? { replyTo } : {}),
      });
      results.push({ email, sent: true });
    } catch (err) {
      payload.logger.error(`[dev] annonce du dev ${dev.id} à ${email} échouée : ${err}`);
      results.push({ email, sent: false });
      continue;
    }

    if (client) {
      await logActivity(payload, {
        client: client.id,
        title: `E-mail envoyé : « ${title} » est disponible`,
        content: `Le client est prévenu que le développement demandé est livré, avec une proposition de démo ou d'échange téléphonique.`,
      }).catch((err) => payload.logger.error(`[dev] journal de l'annonce (client ${client.id}) : ${err}`));
    }
  }

  const sent = results.filter((r) => r.sent).length;
  let announcedAt: string | null = null;
  if (sent > 0) {
    announcedAt = new Date().toISOString();
    await payload
      .update({ collection: "developments", id: dev.id, data: { announcedAt }, overrideAccess: true })
      .catch((err) => payload.logger.error(`[dev] date d'annonce du dev ${dev.id} non enregistrée : ${err}`));
  }
  payload.logger.info(`[dev] dev ${dev.id} annoncé à ${sent}/${emails.length} adresse(s).`);
  return NextResponse.json({ sent, total: emails.length, results, announcedAt });
}
