import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { buildAnnounceEmail } from "@/modules/dev/lib/announce-email";
import { logActivity } from "@/modules/partner/lib/journal";

/**
 * Prévenir les clients qui ont demandé un développement : c'est disponible.
 *
 * GET  ?id=…&title=…                → destinataires proposés (un par
 *                                      opportunité « Demandé par »), intitulé,
 *                                      et l'APERÇU du message tel qu'il partira
 *                                      au premier destinataire
 * POST { id, title, emails: [...] } → UN e-mail par adresse — jamais de copie :
 *                                      un client ne doit pas voir les autres.
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

type Feature = { slug?: string; title?: string } | null;

async function featureOf(payload: Awaited<ReturnType<typeof payloadClient>>, dev: { feature?: Ref }): Promise<Feature> {
  const featureId = idOf(dev.feature);
  if (featureId == null) return null;
  return (await payload
    .findByID({ collection: "features", id: featureId, depth: 0, overrideAccess: true })
    .catch(() => null)) as Feature;
}

/**
 * Le message pour UNE adresse, avec ce qu'on sait du client qui la porte :
 * prénom du référent, partenaire (lien de réservation, adresse de
 * réponse), fiche de doc. Une adresse ajoutée à la main n'a rien de tout ça :
 * le message reste juste, il est seulement moins personnel.
 */
async function messageFor(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  args: { email: string; title: string; client: Client | null; feature: Feature },
) {
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
    featureSlug: args.feature?.slug ?? null,
    featureTitle: args.feature?.title ?? null,
    recipientEmail: args.email,
  });
  return { built, replyTo: p?.email ?? null };
}

export async function GET(req: Request) {
  const { payload, ok } = await guard(req);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
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
  const title = (new URL(req.url).searchParams.get("title") ?? "").trim() || dev.title?.trim() || "";

  // L'aperçu : le message du PREMIER destinataire — c'est ce que verra un
  // vrai client, prénom compris. Sans destinataire, un message
  // générique, pour qu'on relise quand même le texte.
  const first = clients.find((c) => c.email?.trim()) ?? null;
  const { built } = await messageFor(payload, {
    email: first?.email?.trim() ?? "",
    title: title || "votre demande",
    client: first,
    feature: await featureOf(payload, dev),
  });

  return NextResponse.json({
    title: dev.title ?? "",
    announcedAt: dev.announcedAt ?? null,
    recipients: clients.map((c) => ({
      clientId: c.id,
      companyName: c.companyName ?? "",
      email: c.email?.trim() ?? "",
    })),
    preview: { subject: built.subject, html: built.html },
  });
}

export async function POST(req: Request) {
  const { payload, ok } = await guard(req);
  if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { id?: number | string; title?: string; emails?: unknown } = {};
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
  const feature = await featureOf(payload, dev);

  const results: { email: string; sent: boolean }[] = [];
  for (const email of emails) {
    const client = byEmail.get(email) ?? null;
    const { built, replyTo } = await messageFor(payload, { email, title, client, feature });

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
